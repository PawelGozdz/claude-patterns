# Rate Limit Testing — Rule Card

**Tags**: "api:tests", "api:security:rate-limit"
<!-- Egzekwowalne streszczenie rate-limit-testing-pattern.md.
     Pełny wzorzec: rate-limit-testing-pattern.md -->

**Layer**: Testing (E2E / L3)
**Status**: Production
**Source**: rate-limit-testing-pattern.md

## MUST
- **RL1** — Fire requests **concurrently** via `Promise.all(...)`, never a sequential
  `for`-loop with `await` inside — a sequential loop lets the rate-limit window reset between
  iterations, hiding the real limit.
- **RL2** — Assert on **counts** of success/failure (`successful.length`, `tooManyRequests.length`),
  never on the exact order of which specific request got 429 — order is non-deterministic under
  concurrency.
- **RL3** — Clear rate-limit state (`RedisTestHelper.clearRateLimitingData(context.app)`) at the
  start of **every** test — stale counters from a previous test cause false 429s.
- **RL4** — Keep rate-limit tests in a **separate file** from functional tests
  (`*-rate-limits.e2e.spec.ts`), per testing-pyramid-pattern.md.
- **RL5** — For window-reset tests, batch requests with an explicit `sleep()` between batches
  (only case where a delay belongs in a rate-limit test) — one batch per window.

## MUST NOT
- **N1** — ❌ Use `setTimeout`/`sleep` between individual requests to "stay in the window" —
  brittle and unnecessary; concurrent `Promise.all()` requests naturally land in the same window.
- **N2** — ❌ Assert `responses[0].status === 200` / `responses[11].status === 429` (exact index)
  — count-based assertions only.
- **N3** — ❌ Leave rate-limit counters uncleared between tests — causes flaky cross-test
  interference.
- **N4** — ❌ Mix rate-limit assertions into a functional-flow test file.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ Verifying 429 once the limit is exceeded.
- ✅ Checking rate-limit response headers.
- ✅ Verifying burst requests within the limit succeed.
- ✅ IP-based limiting across simulated users on the same IP.
- ✅ Window-reset behavior after expiry.
- ❌ Endpoint business-logic correctness (keep separate).
- ❌ Load/throughput testing at scale.

## Verifier — najczęstsze naruszenia
| Symptom w kodzie | Złamana reguła |
|---|---|
| `for (...) { await request(...) }` w teście rate-limit | RL1/N1 |
| `expect(responses[0].status).toBe(200)` (indeksowane) | RL2/N2 |
| Brak `RedisTestHelper.clearRateLimitingData` w `beforeEach` | RL3/N3 |
| Test rate-limit w tym samym pliku co test funkcjonalny | RL4/N4 |
| `await sleep(100)` między pojedynczymi requestami w Promise.all batchu | N1 |

**Pełny wzorzec**: [`rate-limit-testing-pattern.md`](./rate-limit-testing-pattern.md)
