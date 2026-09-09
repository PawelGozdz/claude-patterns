# Domain-Colocated Fixture Mother — Rule Card

**Tags**: "api:tests:fixtures"
<!-- Egzekwowalne streszczenie domain-colocated-fixture-mother-pattern.md.
     Pełny wzorzec: domain-colocated-fixture-mother-pattern.md -->

**Layer**: Domain (L1 construction) + Test Infrastructure (L2/L3 persistence)
**Status**: production
**Scope**: project-specific (juz-ide-api-1) — see parent's `**Scope**` line; pass
`project: "juz-ide-api-1"` to `retrieve_patterns` to include it.
**Source**: domain-colocated-fixture-mother-pattern.md

## MUST
- **FM1** — A Mother (`domain/**/__fixtures__/{aggregate}.mother.ts`) is a **pure domain
  function**: zero imports from `infrastructure/`, `application/`, or `test/`.
- **FM2** — Build the aggregate through its **real public factory methods**
  (`create()`/named factories) — never bypass business-rule/invariant checks.
- **FM3** — Keep persistence a separate, explicit layer on top of the Mother
  (`repository.save()` via DI in `test/`) — construction and persistence are different concerns.
- **FM4** — Category 2 (projection row-builders with no aggregate to save through): one **typed**
  builder per table, colocated with its owning context — never one dynamic-table-name builder
  shared across contexts (forces untypeable `as any`).
- **FM5** — Pick the mechanism by actual test need (see parent's "Kiedy używać czego" table):
  pure L1 → Mother directly; L2/L3 in the aggregate's own context → Mother + `save()`; L2/L3 in
  another context needing "a user to exist" → the composite; projection-only → row-builder alone;
  mutating an SUT-created row → DB helpers, not Mother; k6-scale load seeding → `SeederRunner`
  (Category 4, a permanent exception).
- **FM6** — Control event emission via the DI override (`eventDispatcher: { mode: 'capture' }`),
  never a fixture-internal "no events" bypass flag.

## MUST NOT
- **N1** — ❌ `(aggregate as any)._field = ...` to force a value the public API doesn't expose —
  add the capability to the aggregate instead of reaching around it.
- **N2** — ❌ Use `reconstituteFromPersistence()` as a construction shortcut — it exists to
  rebuild from an already-persisted row, not to skip invariant checks during test setup.
- **N3** — ❌ Import `@shared/database` (or any infra type) into `domain/**/__fixtures__/**` —
  unconditionally blocked by the `.dependency-cruiser.js` rule
  `domain-fixtures-should-not-import-shared-database`, no exceptions.
- **N4** — ❌ Build a fixture-internal "no events" mode — creates a second write path that
  silently drifts from what production actually does (root cause of a real false-positive
  "zero events" assertion incident).
- **N5** — ❌ Rip-and-replace a documented Category 3 orchestrator (e.g. a fixture with a
  200+ file blast radius) because it "should" use Mothers — verify blast radius by grep first;
  migrate it to delegate to Mothers internally instead of wholesale replacement.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ Any test needing a realistically-constructed aggregate instance (L1 pure, or L2/L3 with
  real persistence/events).
- ✅ Splitting "what a correct X looks like" (construction) from "how it gets written to
  Postgres" (persistence strategy).
- ❌ k6-scale bulk/load-test seeding — use `SeederRunner` (Category 4), not Mother/composite;
  this is a throughput constraint, not oversight.
- ❌ Mutating a row created by a real SUT flow (e.g. `POST /auth/register`) — use DB helpers,
  Mother builds from scratch.

## Verifier — najczęstsze naruszenia
| Symptom w kodzie | Złamana reguła |
|---|---|
| `import ... from '@shared/database'` w `domain/**/__fixtures__/**` | N3 |
| `(x as any)._id = ...` w fixture | N1 |
| `reconstituteFromPersistence()` wołane zamiast `create()` w Mother | N2 |
| Fixture ma własną flagę "skip events" | N4 |
| Jeden row-builder z dynamiczną nazwą tabeli dla wielu kontekstów | FM4 |

**Pełny wzorzec**: [`domain-colocated-fixture-mother-pattern.md`](./domain-colocated-fixture-mother-pattern.md)
