# Safe Error Propagation Pattern

**Version**: 1.1
**Last Updated**: 2026-09-19
**Tags**: "api:security", "api:api-surface:errors"

**Status**: PRODUCTION
**Priority**: CRITICAL
**Primary Users**: domain-application-implementer, infrastructure-testing-implementer, code-quality-verifier, security-e2e-verifier

---

## 🎯 Problem

**Infrastructure errors leaking to HTTP responses (TS-SEC-011)**

Application-layer handlers and services propagating raw infrastructure errors to callers, which then surface in API responses as SQL error text, table names, Kysely stack traces, Redis connection strings, or OAuth provider details.

**Root cause chain:**
```
BaseKyselyRepository.save() throws Postgres error
  → wraps as RepositoryError("Failed to save X: duplicate key violates constraint user_profiles_user_id_key")
    → handler returns Result.fail(repoError)
      → error mapper uses error.message as HTTP response body
        → attacker sees internal schema details
```

---

## ✅ Safe Error Propagation Rules

### Rule 1 — BaseKyselyRepository: no raw error in message

Repository error messages are **generic**. The raw error is stored as `cause` only.

```typescript
// ✅ CORRECT — already enforced in BaseKyselyRepository (fixed TS-SEC-011)
return Result.fail(
  this.createRepositoryError(
    `Failed to save ${this.getAggregateTypeName()}`,  // generic
    'save',
    error  // raw error stored as cause — for internal debugging only
  )
);

// ❌ WRONG — never interpolate error.message into repository error messages
return Result.fail(
  this.createRepositoryError(
    `Failed to save ${this.getAggregateTypeName()}: ${(error as Error).message}`,
    'save',
    error
  )
);
```

> **No logger in repositories** — logging belongs in handlers, not repositories.

---

### Rule 2 — Domain error factories: no `details` parameter

Domain error factory methods must **never** accept raw infrastructure details.

```typescript
// ✅ CORRECT — generic message, no parameter
static persistenceError(): DiscussionsValidationError {
  return new DiscussionsValidationError(
    'Operation could not be completed at this time',
    'persistence',
    LocalHeroErrorCode.PERSISTENCE_ERROR
  );
}

// ❌ WRONG — embeds raw error text into domain error
static persistenceError(details: string): DiscussionsValidationError {
  return new DiscussionsValidationError(
    `Persistence error: ${details}`,  // leaks to HTTP response via mapper
    'persistence',
    LocalHeroErrorCode.PERSISTENCE_ERROR
  );
}
```

---

### Rule 3 — Handlers: log before failing with repo error

When a handler wraps a repository failure, **log the raw error server-side** before returning the generic domain error.

```typescript
// ✅ CORRECT — log internally, return generic
const saveResult = await this.repository.save(aggregate);
if (saveResult.isFailure) {
  this.logger.error('Failed to persist thread', { error: saveResult.error.message });
  return Result.fail(DiscussionsValidationError.persistenceError());
}

// ❌ WRONG — propagates raw repo error without logging
if (saveResult.isFailure) {
  return Result.fail(saveResult.error);  // repo error reaches HTTP response
}

// ❌ WRONG — embeds raw message in domain error
if (saveResult.isFailure) {
  return Result.fail(new SomeDomainError(`Failed: ${saveResult.error.message}`));
}
```

---

### Rule 4 — catch blocks: never embed error.message in returned errors

```typescript
// ✅ CORRECT — generic message, log internally
} catch (error) {
  this.logger.error('Social auth URL generation failed', { error: (error as Error).message });
  return Result.fail(new SocialAuthError('Unable to initiate sign-in', provider));
}

// ❌ WRONG — raw error details in returned value
} catch (error: any) {
  return Result.fail(
    new SocialAuthError(`Auth URL generation failed: ${error.message}`, provider)
  );
}
```

---

### Rule 5 — Error mappers: static messages, no error.message passthrough

Context error mappers are the **last line of defense**. They must never pass `error.message` to HTTP exception constructors.

```typescript
// ✅ CORRECT — static message, structural metadata only
[SomeDomainError]: (error) =>
  new BusinessLogicError('Operation not permitted', {
    errorType: error.constructor.name,
    code: (error as SomeDomainError).code,
    field: (error as SomeDomainError).field,
  }),

// ❌ WRONG — dynamic message leaks whatever the error contains
[SomeDomainError]: (error) =>
  new BusinessLogicError(error.message || 'Operation not permitted', { ... }),
```

---

### Rule 5b — Discriminated switch: `default` must not inherit a sibling case's message via fallthrough

A mapper that discriminates one domain error class by an internal `error.code` (the same-class-multiple-codes shape used by `TokenWalletError`, `PaymentValidationError`, etc.) is a second place Rule 5's "static message" requirement can silently break, distinct from `error.message` leaking. Grouping a specific `case` into `default:` via fallthrough means `default` — which exists to catch **future, not-yet-specific** codes — actually returns that specific case's message. A later PR adding a third code gets that unrelated message with no compiler or test signal, because the code compiles and the two originally-intended codes both still "work".

**N7 — MUST NOT** (see MUST NOT list below): in a `switch (error.code)` inside an error mapper, `default:` must not be grouped with a specific `case` via fallthrough (`case X:\ndefault:\n  return sameStaticMessage`) — it is its OWN branch with its OWN generic, code-neutral static message, even when today only that one specific case exists and reusing the message would appear to change nothing observable.

```typescript
// ✅ CORRECT — default: is its own branch with its own generic message
switch (paymentError.code) {
  case LocalHeroErrorCode.PAY_AUTHENTICATION_REQUIRED:
    return new AuthenticationError('Authentication is required to perform this action', { code: paymentError.code });

  case LocalHeroErrorCode.PAY_INVALID_CURRENCY:
    return new ValidationError('Invalid currency code', { code: paymentError.code });

  default:
    // generic fallback for any future code not yet given its own case —
    // MUST NOT reuse a sibling case's message
    return new ValidationError('Invalid payment request', { code: paymentError.code });
}

// ❌ WRONG — N7 violation: default: silently inherits PAY_INVALID_CURRENCY's
// message via fallthrough; a future third code gets reported as a currency error
switch (paymentError.code) {
  case LocalHeroErrorCode.PAY_AUTHENTICATION_REQUIRED:
    return new AuthenticationError('Authentication is required to perform this action', { code: paymentError.code });

  case LocalHeroErrorCode.PAY_INVALID_CURRENCY:
  default:
    return new ValidationError('Invalid currency code', { code: paymentError.code });
}
```

Found as a real defect (D17, TS-ERROR-MAPPER-001, juz-ide-api-2, `payment-error.mapper.ts`) — the WRONG example above is the code exactly as it shipped before the fix. Zero observable behavior change for the two codes that existed at the time; the bug was latent, waiting for a third code to land.

---

### Rule 6 — Mechanical guardian: Rule 5 is not self-enforcing

**Discipline decays. A context with `*-error.mapper.ts` files but no mechanical test asserting Rule 5 WILL regress** — this is not hypothetical: the exact leak this pattern exists to prevent was fixed once (2026-05-23, 17 mappers), then silently reappeared in new mappers and new branches over the following four months, because nothing asserted it stayed fixed (TS-ERROR-MAPPER-001, juz-ide-api-2). A code-review-only enforcement of Rule 5 is a policy, not a control.

**SEP6 — MUST**: any bounded context with at least one `*-error.mapper.ts` has a mechanical guardian test (e.g. `*-error-message-leak.guardian.spec.ts`) — a regex-over-source-text L1 test, not a runtime/instantiation test, run on every PR.

**SEP7 — MUST**: the guardian discovers mapper files via a **filesystem walk** (`readdirSync` + filename regex), never a hand-maintained file-path array. A hand-maintained list silently fails to protect a mapper added tomorrow — confirmed as a real, found-and-fixed defect (DREAD 7) in the same task that motivated this rule; the guardian's own module docblock claimed "filesystem scan" while the code shipped a hardcoded array, and nothing caught the mismatch until an external review read the code, not the comment.

```typescript
// ✅ CORRECT — SEP7: discovers mappers, cannot silently miss a new one
function walkTsFiles(dir: string): string[] { /* readdirSync, recurse, filter *-error.mapper.ts */ }
const TARGET_MAPPERS = walkTsFiles(CONTEXTS_ROOT).filter(f => f.endsWith('-error.mapper.ts'));

// ❌ WRONG — SEP7 violation: a mapper added tomorrow is invisible to this guardian
const TARGET_MAPPERS = [
  'src/contexts/auth/infrastructure/mappers/auth-error.mapper.ts',
  'src/contexts/pricing/infrastructure/mappers/pricing-error.mapper.ts',
  // ...whatever existed when someone last remembered to update this list
];
```

**SEP8 — MUST**: the scan root covers **every** location a mapper can live, not just the per-context convention directory (typically `src/contexts/**`). A global/fallback mapper living outside that convention (e.g. `GlobalFallbackErrorMapper`, the one mapper every unmatched error actually reaches) is exactly the kind of narrow-scope blind spot that gets missed — found as a real gap (DREAD 6, the 30th mapper in a 30-mapper repo, silently excluded by a scan root written before it existed) in the same task.

**SEP9 — MUST**: the leak-detection regex catches **all** of these shapes, not just the simplest one. Each was independently confirmed, by mutation-testing the guardian itself, as a real gap in an earlier, narrower version of this same regex (DREAD 8 each):

1. `.message` as the constructor's first argument — `new XxxError(error.message)`
2. `.message` via an intermediate variable — `const m = error.message; new XxxError(m)`
3. `.message` nested in a metadata object under an explicit key — `new XxxError('static', { detail: error.message })`
4. the SAME two shapes above, but as an **object-shorthand property** (`const message = error.message; new XxxError('static', { message })`) and via a **parenthesised/cast receiver** (`new XxxError((e as Error).message)`, `{ detail: (e as Error).message }`)

A guardian that only catches shape 1 gives false confidence — it looks like a backstop and lets shapes 2-4 through untouched. Treat SEP9 as a checklist when writing or reviewing a guardian regex, not just when TS-ERROR-MAPPER-001-style code already exists to catch.

**SEP10 — MUST**: the guardian has an anti-vacuous-pass control — assert the discovered-file count is above a floor (e.g. `>= 20`) AND include one named reference file that must always be present in the discovered set. Without this, a broken scan root (SEP8 regression, typo, moved directory) silently degrades to `it.each([])` — zero test cases, zero failures, 100% green, 0% protection.

```typescript
// ✅ CORRECT — SEP10: a broken scan cannot pass silently
expect(TARGET_MAPPERS.length).toBeGreaterThanOrEqual(20);
expect(TARGET_MAPPERS).toContain('src/contexts/auth/infrastructure/mappers/auth-error.mapper.ts'); // named reference control
it.each(TARGET_MAPPERS)('%s never passes a domain error.message into an HTTP exception', (mapperPath) => { /* ... */ });
```

Reference implementation embodying SEP6-SEP10 together (post-audit, all five rules applied): `src/shared/response/errors/__tests__/no-raw-error-message-leak.guardian.spec.ts` in juz-ide-api-2. Its filesystem-walk mechanism (SEP7/SEP8) mirrors `src/shared/response/testing/error-mapper-coverage.guardian.ts`, which pioneered the scan-instead-of-list approach for the sibling "unregistered domain error class" guardian problem.

---

## Classification Guide

Use this table to decide if propagating an error is safe:

| Error source | Safe to propagate via `Result.fail(x.error)`? |
|---|---|
| `userAggregate.someMethod()` → domain error | ✅ Yes — domain errors have controlled messages |
| `Email.create()`, `GroupCategory.create()` → VO error | ✅ Yes — finite, fixed message set |
| `LockAcquisitionError`, `ConcurrentOperationError` from repo | ✅ Yes — purpose-built, user-facing by design |
| `repository.save()` → `RepositoryError` | ⚠️ Safe **only after P1 fix** — log + return generic domain error |
| `repository.findById()` → `RepositoryError` | ⚠️ Same — log + return generic domain error |
| `catch (error)` → any exception | ❌ No — log internally, return new generic error |
| External service (OAuth, SMS, payment gateway) result | ❌ No — log internally, return generic domain error |
| `error.message` interpolated into domain error constructor | ❌ Never |

---

## Three-Layer Defense-in-Depth

```
Layer 1 — Repository (BaseKyselyRepository)
  → Generic messages, raw error in cause only

Layer 2 — Handler / Service
  → Log raw error, return generic domain error via factory

Layer 3 — Error Mapper (infrastructure)
  → Static HTTP messages, never error.message in response body
```

Any single layer catching a leak prevents it from reaching the user. All three layers working together provide defense-in-depth.

---

## Anti-patterns to flag in code review

| Pattern | Verdict |
|---|---|
| `Result.fail(repoResult.error)` where `repoResult` is from repo call | ⚠️ Review — safe only if repo uses generic messages (Rule 1) |
| `Result.fail(new SomeError(\`...: ${error.message}\`))` | ❌ BLOCK |
| `Result.fail(new SomeError(error.message))` | ❌ BLOCK |
| `static factory(details: string)` embedding details in message | ❌ BLOCK |
| `new HttpException(error.message, ...)` in mapper | ❌ BLOCK |
| `catch (e) → return Result.fail(someFactory(e.message))` | ❌ BLOCK |
| `.message` reused via object-shorthand or a parenthesised/cast receiver in mapper metadata (`const message = error.message; { message }` / `{ detail: (e as Error).message }`) | ❌ BLOCK (SEP9) |
| Context has `*-error.mapper.ts` files, zero `*-error-message-leak.guardian.spec.ts` (or equivalent) | ❌ BLOCK (SEP6) |
| Guardian's target-file list is a literal array instead of a filesystem walk | ❌ BLOCK (SEP7) |
| Guardian's scan root excludes a mapper location (e.g. a global/fallback mapper outside `src/contexts/**`) | ❌ BLOCK (SEP8) |
| Guardian has no floor-count / named-reference-file sanity control | ❌ BLOCK (SEP10) |
| `case X: default: return sameStaticMessage` — a `default:` branch sharing its message with an adjacent named `case` via fallthrough | ❌ BLOCK — a future third error code silently inherits the wrong message even though its `code` is mapped correctly; give `default:` its own neutral fallback, never reuse a named case's text |

---

## Related

- `cross-layer/domain-errors-pattern.md` — Result pattern and error hierarchy
- `cross-layer/error-handler-chain-pattern.md` — ADR-0041, HTTP error mapper chain
- `cross-layer/logger-pattern.md` — LOGGER_SERVICE token and ILoggerService
- `src/shared/infrastructure/repositories/base-kysely.repository.ts` — Rule 1 enforcement
- `src/shared/response/testing/error-mapper-coverage.guardian.ts` (juz-ide-api-2) — filesystem-walk discovery mechanism that SEP7/SEP8 generalize
- `src/shared/response/errors/__tests__/no-raw-error-message-leak.guardian.spec.ts` (juz-ide-api-2) — reference guardian implementing SEP6-SEP10
- Task: TS-SEC-011 (audit that identified this systemic issue)
- Task: TS-ERROR-MAPPER-001 (juz-ide-api-2, 2026-09-19) — origin of Rule 6 (SEP6-SEP10) and the switch-fallthrough anti-pattern; regression that had been fixed once (2026-05-23) and silently reappeared for four months with no mechanical backstop
