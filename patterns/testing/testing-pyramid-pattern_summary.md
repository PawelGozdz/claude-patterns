# Testing Pyramid — Rule Card

**Tags**: "api:tests"
<!-- Egzekwowalne streszczenie testing-pyramid-pattern.md (ADR-0035).
     Wzorzec na półce triggers 4 bloków (nestjs, flutter, python, node) —
     wysoki priorytet. Pełny wzorzec: testing-pyramid-pattern.md -->

**Layer**: Testing
**Status**: Production-enforced (ADR-0035)
**Source**: testing-pyramid-pattern.md

## MUST
- **TP1** — Test EVERY business rule at **L1** (Specification unit tests) — the foundation of
  the pyramid, never skipped.
- **TP2** — Maintain the ~50% L1 / ~30% L2 / ~20% L3 distribution across a context's test suite.
- **TP3** — Run L1+L2 on EVERY PR, completing in under ~3 minutes total.
- **TP4** — Separate rate-limit tests into their own files (`*-rate-limits.e2e.spec.ts`) — never
  mixed with functional E2E tests (see rate-limit-testing-pattern.md).
- **TP5** — Update `BUSINESS_RULES.md`/`.yaml` test-column markers when adding rule coverage
  (see business-rules-yaml-pattern.md for the mechanism).
- **TP6** — Route each concern to its correct level by the decision tree: business rule → L1
  Spec; aggregate state transition → L1 Aggregate; input format → L1 Schema; handler
  orchestration → L2; API contract/auth/rate-limiting → L3; security vulnerability → L4.

## MUST NOT
- **N1** — ❌ Test business rules at L3 (E2E) — exhaustive edge-case coverage belongs at L1;
  L3 covers happy-path + auth only.
- **N2** — ❌ Write E2E tests for every business-rule edge case — that's the "Business Rules in
  E2E Tests" anti-pattern: slow suite duplicating what L1 Specifications already cover.
- **N3** — ❌ Invert the pyramid (majority of tests at L3) — slow feedback loop, brittle,
  high-maintenance; move logic tests down to L1.
- **N4** — ❌ Mix rate-limiting assertions into a functional-flow test file — rate-limit 429s
  interfere with and mask functional assertions.
- **N5** — ❌ Test business rules only at L2 (Handler) or L3, skipping L1 Specifications
  entirely — rules become non-reusable, verified in only one call site.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ ALL bounded contexts — consistent test distribution across the codebase.
- ✅ New feature development — write L1 Specs first, then L2/L3.
- ✅ CI/CD optimization — fast feedback from L1+L2 on every PR.
- ❌ Judging test quality by raw count/coverage % alone — the distribution and level placement
  matter more than total test count (see Anti-Pattern 2: Inverted Pyramid).

## Verifier — najczęstsze naruszenia
| Symptom w kodzie | Złamana reguła |
|---|---|
| E2E `describe` block enumerating 10+ business-rule edge cases | N1/N2 |
| L3 test suite >>20% of total tests, L1 <<50% | TP2/N3 |
| Rate-limit `it()` w tym samym pliku co funkcjonalny happy-path test | TP4/N4 |
| Business rule ma tylko test L2/L3, brak `*.spec.ts` w `domain/specifications/` | TP1/N5 |
| `BUSINESS_RULES.md` bez markera testu przy nowo dodanej regule | TP5 |

**Pełny wzorzec**: [`testing-pyramid-pattern.md`](./testing-pyramid-pattern.md)
