# Pattern: Try Confirm Cancel

**Tags**: "api:app"
**Layer**: Application
**Level**: core
**Status**: experimental

## What This Is

A multi-step protocol with state that must survive across a transaction boundary — most
commonly "reserve a priced resource, then either confirm the reservation once the entity
it paid for has an id, or release it if anything downstream fails" (TCC: **T**ry /
**C**onfirm / **C**ancel). Once the same reserve→confirm/release dance appears in **three
or more** command handlers of one bounded context, it stops being handler-local orchestration
and becomes a per-context **application service** (`C2` threshold, ADR-0118): one class
owning the ACL calls and the state-carrying method signatures, injected into every handler
that needs the dance instead of each handler re-deriving its own copy.

The service stays **generic**: `feature`, `actionType`, `radiusBucket` and
`contextEntityId` are caller-supplied parameters, never hardcoded to one content type. It
fails with one **generic** error type (`kind: 'validation' | 'infrastructure'`, plus a
`code`); it is the caller's job — every caller, individually — to translate that generic
failure into its own context-specific domain error. The service never manufactures a
context-flavored user-facing message; it does not know "Local Share" or "Boost" exist.

## When to Use

**Use this pattern for:**
- ✅ A reserve→confirm/release (or equivalent hold→commit/abort) protocol appears in **≥3
  handlers of the same bounded context** — extract an application service. Below that
  threshold, leave the dance in the handler (`C2`); a service with one real caller is
  premature abstraction.
- ✅ The reservation's state (a reservation id, a reason for releasing it) must be threaded
  from the pre-transaction `prepare()` hook (or seeded at zero) through
  `executeBusinessLogic()` into a post-rollback `compensate()` call — i.e. state that a
  plain in-method `try/catch` cannot carry, because the compensating step runs as a
  **separate invocation** after the transaction has already unwound.
- ✅ The same mechanic is needed by handlers with genuinely different domain context
  (different feature codes, different content types) — parameterize the caller-supplied
  fields (`feature`, `actionType`, `contextEntityId`), don't fork the service per content
  type (`C3` — a domain difference is an explicit parameter, never a copy).

**Do NOT use for:**
- ❌ Fewer than 3 call sites in one context — leave the reserve/release calls inline in the
  handler; a shared service at that scale adds an indirection layer nobody else uses yet.
- ❌ A protocol with no state needing to survive a rollback (a single request/response call
  to an external system with no compensating action) — that is a plain ACL call through the
  ACL Registry (`architecture/acl-registry-pattern.md`), not TCC.
- ❌ Baking one caller's error messages or content-type name into the service — that is
  `C1`'s per-context translation responsibility leaking into the shared mechanism. If a
  service method starts returning "Local Share"-flavored text, the abstraction has already
  broken.

## Implementation

### 1. The generic service — caller-supplied parameters, one generic error type

Real production shape (`neighborhood-economy/application/services/token-reservation.service.ts`)
— extracted from `CreateLocalShareHandler.resolvePricingAndReserveTokens()`, the first
consumer, then reused unmodified by a second (`BoostLocalShareHandler`):

```typescript
export type TokenReservationFailureKind = 'validation' | 'infrastructure';

export class TokenReservationError extends Error {
  constructor(
    public readonly kind: TokenReservationFailureKind,
    public readonly code: string,
    message: string,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TokenReservationError';
  }
}

@Injectable()
export class TokenReservationService {
  constructor(
    @Inject(ACL_REGISTRY_SERVICE) private readonly aclRegistry: ACLRegistryService,
    @Inject(LOGGER_SERVICE) private readonly logger: ILoggerService
  ) {}

  // TRY — resolves cost via the pricing ACL, reserves it via the token-economy ACL.
  // Fail-closed throughout: a thrown exception, an unavailable ACL, or an unrecognized
  // error code all deny with kind: 'infrastructure'. Never degrades to a free quote.
  async resolvePricingAndReserveTokens(
    params: ResolvePricingAndReserveTokensParams
  ): Promise<Result<{ tokenCost: number; reservationId: string | null }, TokenReservationError>> {
    /* ... getGlobalRequired('pricing') then getGlobalRequired('token-economy'),
           both wrapped in safeRun() INSIDE the callback (ACL9) ... */
  }

  // CONFIRM — commit-time step (NOT compensation): confirms a reservation was consumed
  // once the entity it paid for has an id.
  async confirmConsumption(
    params: ConfirmConsumptionParams
  ): Promise<Result<{ newBalance: number }, TokenReservationError>> { /* ... */ }

  // CANCEL — best-effort release, the compensating action for resolvePricingAndReserveTokens().
  async releaseReservation(
    params: ReleaseReservationParams
  ): Promise<Result<void, TokenReservationError>> { /* ... */ }
}
```

`feature`, `finalLevelCode`, `actionType`, `contextType` and the optional
`contextEntityId`/`latitude`/`longitude` are all **caller-supplied** — the second consumer
(`BoostLocalShareHandler`) extended the params object backward-compatibly (optional
`contextEntityId`, optional geo fields) without changing anything for the first
(`CreateLocalShareHandler`). That is the concrete test of "the service stayed generic": a
second, differently-shaped caller was added with zero changes to the first caller's
behavior.

### 2. Caller wiring — `prepare()` seeds, `executeBusinessLogic()` mutates, `compensate()` reads back

CREATE-shape caller (`create-local-share/handler.ts`) — the reservation id is written into
the SAME `prepared` object `compensate()` will read after a rollback:

```typescript
const pricingResult = await this.resolvePricingAndReserveTokens({
  finalLevelCode: resolvedLocation.verifiedLevelCode,
  latitude: shareLatitude,
  longitude: shareLongitude,
  quoteId: command.quoteId,
});
if (pricingResult.isFailure) {
  return Result.fail(pricingResult.error);
}
const tokenReservationId = pricingResult.value.tokenReservationId;
// the ONLY channel compensate() has to learn about a reservation made mid-transaction:
prepared.value.tokenReservationId = tokenReservationId;

// ... aggregate.create(), save() ...

if (localShareResult.isFailure) {
  prepared.value.compensationReason = 'CREATE_FAILED';
  return Result.fail(/* ... */);
}
if (saveError || saveResult?.isFailure) {
  prepared.value.compensationReason = 'SAVE_FAILED';
  return Result.fail(/* ... */);
}

if (tokenReservationId) {
  const [confirmError, confirmResult] = await safeRun(() =>
    this.tokenReservationService.confirmConsumption({
      reservationId: tokenReservationId,
      actionType: TOKEN_ACTION_TYPE,
      radiusBucket: TOKEN_RESERVATION_BUCKET_SENTINEL,
      contextType: ContextType.LOCAL_SHARE,
      contextEntityId: localShare.getId().toString(),
    })
  );
  if (confirmError || confirmResult?.isFailure) {
    // CONFIRM_FAILED is a documented exception to the compensate() hook (see
    // Anti-Pattern 3 in application/command-handler-pattern.md B4 discussion): the
    // Tier-2 audit for this failure MUST run AFTER release but BEFORE rollback, which a
    // post-rollback compensate() call structurally cannot satisfy — so this ONE path
    // releases inline instead of going through prepared.compensationReason.
    await this.tokenReservationService.releaseReservation({
      reservationId: tokenReservationId,
      actionType: TOKEN_ACTION_TYPE,
      radiusBucket: TOKEN_RESERVATION_BUCKET_SENTINEL,
      reason: 'CONFIRM_FAILED',
    });
    /* ...Tier-2 audit, then Result.fail() to trigger rollback... */
  }
}
```

The post-rollback compensation hook, reading the same `prepared` object back:

```typescript
protected override async compensate(
  _command: CreateLocalShareCommand,
  prepared: PreparedGeography,
  _error: Error
): Promise<void> {
  if (prepared.isFailure) return;
  const { tokenReservationId: reservationId, compensationReason: reason } = prepared.value;
  if (!reservationId || !reason) return;   // nothing was reserved, or already released inline
  await this.tokenReservationService.releaseReservation({
    reservationId,
    actionType: TOKEN_ACTION_TYPE,
    radiusBucket: TOKEN_RESERVATION_BUCKET_SENTINEL,
    reason,
  });
}
```

UPDATE-shape caller (`boost-local-share/handler.ts`) — `prepare()` is empty apart from the
zero-state seed (the mutated aggregate is loaded with a lock **inside** the transaction,
never in `prepare()` — `A3`/`A4`), and every post-reservation failure branch sets
`compensationReason` uniformly (no `CONFIRM_FAILED`-style exception here, because this
handler has no rollback-after-confirm step — `D9`):

```typescript
protected override async prepare(_command: BoostLocalShareCommand): Promise<PreparedBoost> {
  return { tokenReservationId: null, compensationReason: null };
}

// inside executeBusinessLogic(command, prepared):
const reservationResult = await this.tokenReservationService.resolvePricingAndReserveTokens({
  feature: PRICING_FEATURE,
  finalLevelCode: command.levelCode,
  quoteId: command.quoteId,
  latitude: undefined,          // BOOST is non-geographic
  longitude: undefined,
  actionType: TOKEN_ACTION_TYPE,
  contextType: ContextType.LOCAL_SHARE,
  contextEntityId: command.contentId,   // UPDATE-shape already has the id — CREATE-shape omits this
});
if (reservationResult.isFailure) {
  return Result.fail(this.mapTokenReservationError(reservationResult.error));
}
prepared.tokenReservationId = reservationResult.value.reservationId;

// ...BoostInfo.create() fails -> prepared.compensationReason = 'BOOST_INFO_INVALID';
// ...applyBoost() fails      -> prepared.compensationReason = 'DOMAIN_VALIDATION_FAILED';
// ...save() fails            -> prepared.compensationReason = 'SAVE_INFRASTRUCTURE_ERROR' | 'SAVE_REPOSITORY_ERROR';
```

### 3. Per-caller error translation — the generic error never leaks past the caller, and `kind` MUST survive the translation

Both handlers translate `TokenReservationError` into their own domain error class,
identically in shape, with zero shared code beyond the switch on `kind`:

```typescript
private mapTokenReservationError(error: TokenReservationError): LocalSharesDomainError {
  if (error.kind === 'validation') {
    return new LocalSharesValidationError(error.code, error.message);
  }
  return new LocalSharesInfrastructureError(error.message, error);
}
```

A third context adopting this service (Faza 5: `quick-jobs`, `community-communication`,
`pricing`) writes its own version of this function mapping to its own error classes — it
never reuses `LocalSharesValidationError`, and it never asks the service to know about
quick-jobs.

**`TCC9`: the `if (error.kind === 'validation') { ... } return <other class>` branch above is
not optional boilerplate — it is the entire point of the function.** A mapper that returns
one error class regardless of `kind` has not "translated the error", it has destroyed the
one piece of information the service went to the trouble of computing. See Anti-Pattern 5.

## Anti-Patterns

### Anti-Pattern 1: The reserve→confirm/release dance copy-pasted per handler

The state this task's audit found before extraction: the same three-call ACL dance
(resolve quote → reserve → confirm-or-release) reimplemented independently in every one of
9 token-reservation call sites across 3 bounded contexts, each with its own inline
`safeRun()` wrapping, its own fail-open/fail-closed judgment call, and its own
`compensationReason` bookkeeping (or none at all). This is exactly how the P0-2 finding
(8× `getGlobal('token-economy')` instead of `getGlobalRequired`, meaning "pricing already
charged the user, tokens silently never got reserved") shipped identically to 8 different
files — one root cause, copied 8 times because there was no single service to fix once.

### Anti-Pattern 2: A service that knows its caller's domain

```typescript
// ❌ WRONG — service manufactures a context-specific message
async resolvePricingAndReserveTokens(params): Promise<Result<..., TokenReservationError>> {
  if (tokenCost > 0 && !reserved) {
    return Result.fail(new TokenReservationError(
      'validation', 'TOKEN_RESERVE_FAILED',
      'Insufficient tokens to boost this local share',   // ❌ "boost", "local share" — caller's vocabulary
    ));
  }
}
```

The service's messages describe the *token-economy* failure ("insufficient tokens for this
action at the selected reach level"), never the caller's noun ("this local share", "this
booking"). The moment a context-specific word appears inside the service, a second caller
either inherits a wrong-sounding message or forks the service — both defeat `C2`.

### Anti-Pattern 3: Calling the ACL directly from a handler instead of through the service

```typescript
// ❌ WRONG — bypasses the service (and repeats its fail-closed judgment call, badly)
const tokenFacade = this.aclRegistry.getGlobal('token-economy');   // fail-OPEN: undefined on missing registration
if (tokenFacade) {
  await tokenFacade.reserveExactAmount(actionType, tokenCost);
}
// falls through silently if tokenFacade is undefined — publishes for free
```

Once a context has adopted `TokenReservationService` (or its own per-context equivalent),
a new handler in that context reaching for `aclRegistry.getGlobal(...)` directly is a
regression to the exact P0-2 fail-open shape this service was built to close — `getGlobal`
degrades silently on an unregistered ACL, `getGlobalRequired` (used INSIDE every
`safeRun()` call in the service) throws and is caught fail-closed.

### Anti-Pattern 4: Threading reservation state through instance fields instead of `prepared`

```typescript
// ❌ WRONG — instance field instead of the prepared carrier
private pendingReservationId: string | null = null;   // ❌ shared mutable state across concurrent requests

async executeBusinessLogic(command) {
  this.pendingReservationId = reservationResult.value.reservationId;
}
async compensate(command, _prepared, _error) {
  if (this.pendingReservationId) { /* ... */ }   // ❌ wrong request's id on concurrent execution
}
```

NestJS providers are singletons by default — an instance field survives across concurrent
requests handled by the same handler instance, so one request's compensation can read
another's reservation id. The `prepared` object passed explicitly through
`prepare()`→`executeBusinessLogic()`→`compensate()` is the only channel that is correctly
scoped to a single command's lifecycle.

### Anti-Pattern 5: `mapXxxReservationError()` collapses `kind` into one error class

```typescript
// ❌ WRONG — real regression, TS-ARCH-HANDLER-CONTRACT-001 Faza 5 fala A,
// boost-event/handler.ts and (independently) boost-group/handler.ts
private mapTokenReservationError(error: TokenReservationError): Error {
  return new EventsInfrastructureError(error.message, error);   // ❌ ignores error.kind entirely
}
```

Both a genuine token-economy outage (`kind: 'infrastructure'`) and a user who simply lacks
tokens (`kind: 'validation'`) exit through the same branch here, so both surface as the
same HTTP status. Concretely, in this incident that status was 503 — the canonical
"safe to retry" signal — for a denial that is permanent until the user tops up, which
invites a client retry storm against a token-reserving endpoint (each retry attempting
another reservation). The pre-existing, already-shipped correct shape (copy this, don't
reinvent it) branches explicitly and constructs a DIFFERENT class per branch:

```typescript
// ✅ RIGHT — publish-event/handler.ts, same context, same service, same day
private mapTokenReservationError(error: TokenReservationError): Error {
  if (error.code === 'TOKEN_RESERVE_FAILED') {
    return new EventValidationFlowError(
      'Insufficient tokens to publish event',
      LocalHeroErrorCode.TOKEN_INSUFFICIENT_TOKENS   // -> 402, mapped explicitly by this
    );                                                //    context's own error mapper
  }
  return new EventsInfrastructureError(error.message, error);   // genuine infra failure only
}
```

This is exactly why `TCC4`'s "every caller has its own small mapping function" is
necessary but **not sufficient** — a mapper can exist, be per-caller, and still be wrong if
it does not fan the two `kind` values out to two different outcomes. A
`code-quality-verifier` pass scoped to "does this caller have a mapper" (a structural
check) will pass this Anti-Pattern; a pass that also asks "does the mapper's output differ
between `kind: 'validation'` and `kind: 'infrastructure'`" catches it. See `TCC9` and the
Verifier check note in the rule card.
