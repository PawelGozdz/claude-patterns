# E2E Hybrid Fixture — Rule Card

**Tags**: "api:tests:e2e"
<!-- Egzekwowalne streszczenie e2e-hybrid-fixture-pattern.md.
     Pełny wzorzec: e2e-hybrid-fixture-pattern.md -->

**Layer**: E2E (L3)
**Status**: production
**Source**: e2e-hybrid-fixture-pattern.md

## MUST
- **E1** — Use **HTTP** for the flow actually under test (what the test's assertion is about).
- **E2** — Use **fixtures** (Mother/composite/DB helpers) for setup and verification — not for
  the thing being tested.
- **E3** — Wait explicitly for async side effects (BullMQ handlers, event processing) before
  asserting on their result — a fixed delay or a poll, never assert immediately after the
  triggering HTTP call returns.
- **E4** — Clear Redis and DB state between tests (`context.cleaner.cleanAll()` +
  `RedisTestHelper.clear...Cache()`) for isolation.
- **E5** — When constructing users for setup, use the current domain-colocated Mother +
  `repository.save()` + typed projection row-builders (see
  `domain-colocated-fixture-mother-pattern.md`) — the old `UserIdentityFixtureClass` ad-hoc
  construction is superseded (though `createProjections()` is not yet deleted, see that
  pattern's migration status).
- **E6** — Mutate an SUT-created row via DB helpers (e.g. `markEmailVerified(db, userId)`), not
  via a fresh Mother build, when the row itself came from a real HTTP call under test.

## MUST NOT
- **N1** — ❌ Use ONLY fixtures for a flow that should exercise the HTTP layer — the test passes
  without ever touching the code path it claims to verify.
- **N2** — ❌ Use ONLY HTTP for setup that could be a fixture — every extra HTTP call in
  `beforeEach` slows the whole suite and risks rate limits.
- **N3** — ❌ Assert on an async handler's side effect immediately after the triggering call —
  race condition; the handler may not have run yet.
- **N4** — ❌ Skip Redis/DB cleanup between tests — stale cache/rows leak state across tests.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ Auth registration / multi-step flows where the flow itself is the thing under test →
  Pattern 1 (HTTP).
- ✅ Tests that need a specific pre-existing user/entity state → Pattern 2 (fixture helpers).
- ✅ Verifying DB rows written by an async pipeline → Pattern 3 (manual DB queries).
- ✅ Cache-dependent behavior → Pattern 4 (Redis management).
- ✅ Async event side effects → Pattern 5 (timing).
- ✅ Race conditions/locking → Pattern 6 (concurrent operations).
- ❌ A pure L1 unit test with no DB/HTTP involvement — use a Mother directly, no E2E layer.

## Verifier — najczęstsze naruszenia
| Symptom w kodzie | Złamana reguła |
|---|---|
| Test asercjuje na skutek BullMQ zaraz po `await request(...).post(...)` bez opóźnienia/pollingu | N3/E3 |
| `beforeEach` robi pełny rejestracja+weryfikacja przez HTTP zamiast fixture | N2 |
| Test integracyjny flow rejestracji buduje usera WYŁĄCZNIE fixture'em | N1 |
| Brak `context.cleaner.cleanAll()` / czyszczenia Redis w `beforeEach` | N4/E4 |

**Pełny wzorzec**: [`e2e-hybrid-fixture-pattern.md`](./e2e-hybrid-fixture-pattern.md)
