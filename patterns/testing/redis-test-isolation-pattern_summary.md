# Redis Test Isolation — Rule Card

**Tags**: "api:tests:integration"
<!-- Egzekwowalne streszczenie redis-test-isolation-pattern.md.
     Pełny wzorzec: redis-test-isolation-pattern.md -->

**Layer**: Testing (E2E / L3)
**Status**: Production
**Source**: redis-test-isolation-pattern.md

## MUST
- **RD1** — Clear Redis cache **explicitly at the start of each test** (`it('...', async () => {
  await RedisTestHelper.clear...(context.app); ... })`), not in `beforeEach()`/`afterEach()`.
- **RD2** — Use `RedisTestHelper.clear<Specific>()` methods, not a direct Redis client import —
  the helper encapsulates the logic and is the single reusable API.
- **RD3** — Clear only the **specific** cache the test needs (rate limiting, verification level,
  session) — `clearAll()` is ~5x slower and is the last resort.

## MUST NOT
- **N1** — ❌ Clear Redis automatically inside `beforeEach()` alongside `cleanAll()` — a race:
  the manual clearing code may run before `cleanAll()`'s own async work completes.
- **N2** — ❌ Import the Redis client directly (`app.get<any>(REDIS_CLIENT)`) and call
  `.keys()`/`.del()` inline — always go through `RedisTestHelper`.
- **N3** — ❌ Clear cache in `afterEach()` — too late; the next test may start before the clear
  finishes, or the clear itself races with the next test's setup.
- **N4** — ❌ Use `RedisTestHelper.clearAll()` as the default for every test — reserve it for
  cases that genuinely need a full flush; prefer the specific clearer.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ A test's assertion depends on cache state a prior test may have populated.
- ✅ Choosing which specific cache to clear for a test's setup.
- ✅ Debugging stale-cache test flakiness.
- ❌ Clearing Postgres/DB state (`context.cleaner.cleanAll()` instead).
- ❌ L1 unit tests with no Redis dependency.

## Verifier — najczęstsze naruszenia
| Symptom w kodzie | Złamana reguła |
|---|---|
| `RedisTestHelper.clear...()` wywołane w `beforeEach`/`afterEach` zamiast wewnątrz `it()` | RD1/N1/N3 |
| `app.get<any>(REDIS_CLIENT)` + ręczne `.keys()`/`.del()` w teście | RD2/N2 |
| `RedisTestHelper.clearAll()` użyty tam, gdzie wystarczy specyficzny clearer | RD3/N4 |

**Pełny wzorzec**: [`redis-test-isolation-pattern.md`](./redis-test-isolation-pattern.md)
