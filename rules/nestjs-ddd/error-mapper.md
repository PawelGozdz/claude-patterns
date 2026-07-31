# Rule: Error Mapper (context IDomainErrorMapper)
**Governs**: `patterns/cross-layer/domain-errors-pattern.md` (Anti-Pattern 5), `patterns/cross-layer/error-handler-chain-pattern.md` (DomainErrorHandler)
**Applies to**: `*-error.mapper.ts` in `**/infrastructure/**/mappers/`; any new `export class XxxError extends ...` in `domain/**`

> A domain error's `code` reaching the client is a TWO-STEP contract: (1) the
> class must have a `code` starting with `D_` (`DomainErrorHandler.canHandle()`
> requires this — `src/shared/response/handlers/domain-error.handler.ts`), (2)
> the class must be registered in its bounded context's `IDomainErrorMapper`
> (`Map<ErrorConstructor, mapFn>`). Missing step 2 is the failure mode this
> rule exists to prevent — the error still reaches the client, just as a
> generic 422 "A domain error occurred" from `GlobalFallbackErrorMapper`,
> silently discarding the intended HTTP status and message. A 2026-07 audit
> across all 11 bounded contexts found **72 unregistered classes in 8 of 11
** contexts — this is not a hypothetical.

## ALWAYS
- When creating a new `D_`-prefixed domain error class, register it in the SAME PR/diff in every context mapper that could plausibly receive it — a new error class and its mapper entry are ONE change, not two (this restates `domain-errors-pattern.md` DE3, now with a mechanical backstop — see below).
- Add the registration as a `[ErrorClass, error => new SomeResponseError(...)]` tuple in the mapper's `errorMappings` Map — grep an existing entry in the same file for the exact style (some contexts use `new BusinessLogicError(...)`, `new ConflictError(...)`, etc. from `@shared/response/errors/base-response-error`).
- Pick the HTTP status from what the error semantically means, not from what's convenient: persistence/repository failure → 500 (never blame the client for a server-side write failure), not-found → 404, conflict/already-exists/already-in-state → 409, forbidden/not-eligible → 403, quota/rate-limit → 429, payment/insufficient-tokens → 402, validation/format → 400, business-rule violation → 422.
- For a class with an internal `switch(errorCode)`/allowlist (one class, many `LocalHeroErrorCode` values — e.g. `AuthValidationError`, `LocalServicesValidationError`): add a dedicated `case`/branch for EVERY code that class's static factories or constructors actually produce — grep `new XxxError(` and every static factory across the context to enumerate them. A `default` branch that silently reuses one status for codes that semantically need a different one (e.g. an authz-gate code falling into a generic 400 default) is the same bug as an unregistered class, just one level deeper (see DIM2 in the audit below).
- Keep `default` branches SAFE (static message, never `error.message` passthrough — see `safe-error-propagation-pattern.md` Rule 5 / CWE-209) even while fixing the status.
- Write or extend an **L1 Guardian coverage test** per context mapper using the shared helper `src/shared/response/testing/error-mapper-coverage.guardian.ts` (`findUnregisteredErrorClasses`) — mirrors the `eventMap` guardian convention (`repository.md`). One test file per mapper, e.g. `<mapper-name>-error-mapper-coverage.guardian.spec.ts`, scanning the context's full `domain/` tree against that mapper's registrations. This is a CI blocker, not optional — see any of the 11 guardian specs added 2026-07 for the reference shape.
- When the guardian finds a declared class that should NOT be registered (dead code with zero throw-sites, or reachable only from a non-HTTP path like an `@EventHandler`/background job that catches `isFailure` and never propagates), add it to the guardian's `exclusions` array with a **one-sentence reason** — never leave it silently unregistered and unexplained.
- Before excluding a class, verify its `code` is actually in scope: a literal `code = 'SOME_STRING'` that does NOT start with `'D_'`, or a `code` left `undefined` (e.g. `extends IDomainError` without passing `options.code` to `super()`), means `DomainErrorHandler.canHandle()` returns `false` and the class never reaches any mapper regardless — that's a structural "out of mechanism scope" exclusion, not a judgment call.
- If a class inherits `code` from a parent class without overriding it, check the PARENT's `code` the same way — the guardian's static analysis only looks at the class's own body.

## NEVER
- NEVER add a new `D_`-prefixed error code/class without a corresponding mapper entry "for now, register it later" — this is exactly how the audited 72-class gap accumulated. If the error class doesn't need HTTP exposure yet (event-only), say so explicitly in the guardian's `exclusions`, don't just skip it.
- NEVER let a `switch(errorCode)`/allowlist `default` branch return a HARDCODED status for a code it wasn't actually written for — a catch-all string-match (e.g. branching on `error.message.includes(...)`) is fragile; prefer branching on `errorCode`/`code` whenever the class exposes one (see the `RoleAssignmentFailedError` fix, 2026-07, for a worked example of replacing a message-substring catch-all with precise dispatch).
- NEVER treat `GlobalFallbackErrorMapper` as an acceptable long-term destination for a real, HTTP-reachable domain error — it exists for genuinely unmapped edge cases, not as a substitute for registration. It does not reliably honor the full `ERROR_HTTP_STATUS` map for every code (only a couple of prefixes get special-cased — verify current behavior in `global-fallback-error.mapper.ts` before assuming it "mostly works").
- NEVER skip writing/updating the guardian coverage test because "the mapper already looks complete" — the whole point of the mechanical scan is that manual review missed 72 classes across a codebase this size.

## Why
The per-context `IDomainErrorMapper` is the only place an error's intended
HTTP status and message survive the trip from domain to client. A missing
registration doesn't crash anything — it silently degrades to a generic 422,
which is why manual review missed it at scale for months: nothing *looked*
broken. The `D_` prefix + `code.startsWith('D_')` check in `DomainErrorHandler`
is a real, cheap-to-verify gate — checking it BEFORE deciding whether a class
needs mapper registration prevents wasted effort registering classes that can
never reach the mapper anyway. The guardian test converts "did we forget a
registration" from a question only a full manual audit can answer into one
`vitest run` answers in milliseconds — mirroring exactly why the `eventMap`
guardian exists for domain events (`repository.md`).
