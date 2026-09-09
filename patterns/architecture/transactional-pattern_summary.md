# Transactional Pattern — Rule Card

**Tags**: "api:data-access:transaction"
<!-- Egzekwowalne streszczenie transactional-pattern.md. Pełny wzorzec: transactional-pattern.md -->

**Layer**: Architecture
**Status**: Production-enforced
**Source**: transactional-pattern.md

## MUST
- **TX1** — Put `@Transactional()` on `BaseCommandHandler.execute()` **only** — one decorator
  per command, at the base-class entry point.
- **TX2** — Return `Result.ok(value)` / `Result.empty()` for success — this commits the
  transaction.
- **TX3** — Return `Result.fail(error)` for business failures — this triggers rollback.
- **TX4** — Document the handler with a `@transactional` JSDoc tag.
- **TX5** — Let the base class convert `Result.fail()` into the thrown exception that drives
  rollback — the handler itself returns `Result`, it does not throw.

## MUST NOT
- **N1** — ❌ Add `@Transactional()` to an individual handler method below the base class —
  causes nested transactions (Anti-Pattern 1).
- **N2** — ❌ Throw exceptions from business logic — return `Result.fail()` instead
  (Anti-Pattern 2); throwing bypasses the Result→rollback contract.
- **N3** — ❌ Manually begin/commit/rollback a transaction (Anti-Pattern 3) — the decorator
  owns the transaction lifecycle.
- **N4** — ❌ Add `@Transactional()` to a repository method — repositories participate via CLS
  (continuation-local storage), not their own decorator (Anti-Pattern 4).
- **N5** — ❌ Add `@Transactional()` to a domain entity/aggregate method — domain layer has no
  transaction concept (see aggregate-pattern.md A6: sync, no infra deps).

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ ALL command handlers (write operations).
- ✅ Services orchestrating multiple commands as one atomic workflow.
- ✅ Domain services performing cross-aggregate database writes.
- ❌ Query handlers (read-only, no transaction needed).
- ❌ Domain entities/aggregates (pure logic, no database).
- ❌ Repository methods (participate via CLS automatically).
- ❌ Controllers (delegate to handlers).

## Verifier — najczęstsze naruszenia
| Symptom w kodzie | Złamana reguła |
|---|---|
| `@Transactional()` na metodzie repozytorium | N4 |
| `@Transactional()` zagnieżdżony na handlerze POD `BaseCommandHandler.execute()` | N1 |
| `throw new Error(...)` w handlerze zamiast `Result.fail()` | N2 |
| Ręczne `db.transaction(async (trx) => ...)` w handlerze | N3 |
| `@Transactional()` na agregacie/encji domenowej | N5 |

**Pełny wzorzec**: [`transactional-pattern.md`](./transactional-pattern.md)
