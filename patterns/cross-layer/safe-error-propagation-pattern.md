# Safe Error Propagation Pattern

**Version**: 1.0
**Last Updated**: 2026-04-18
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

---

## Related

- `cross-layer/domain-errors-pattern.md` — Result pattern and error hierarchy
- `cross-layer/error-handler-chain-pattern.md` — ADR-0041, HTTP error mapper chain
- `cross-layer/logger-pattern.md` — LOGGER_SERVICE token and ILoggerService
- `src/shared/infrastructure/repositories/base-kysely.repository.ts` — Rule 1 enforcement
- Task: TS-SEC-011 (audit that identified this systemic issue)
