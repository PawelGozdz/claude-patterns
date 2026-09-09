# Typed Projection Row-Builder — Rule Card

**Tags**: "api:tests:fixtures", "api:data-access:projection"
<!-- Egzekwowalne streszczenie typed-projection-row-builder-pattern.md.
     Pełny wzorzec: typed-projection-row-builder-pattern.md -->

**Layer**: Testing (L2/E2E fixtures)
**Status**: Production (7 projection tables migrated, LocalHero)
**Source**: typed-projection-row-builder-pattern.md

## MUST
- **PR1** — One typed builder **per table** (`Insertable<Database['table']>` in, same type out),
  never a generic builder parametrized by table name.
- **PR2** — Colocate the builder in `{context}/infrastructure/repositories/__fixtures__/`, next
  to the repository/handler that actually writes that table in production — never in a shared/
  centralized fixtures directory.
- **PR3** — Header comment must name the **production handler** that creates/updates the row
  (documents the contract, helps find the consumer on a schema change).
- **PR4** — Build `defaults()` returning `Omit<Insertable<Database['table']>, 'user_id'>` (or
  the relevant key), and export a function that spreads `{ ...defaults(), ...overrides }` —
  overrides only what a test deliberately varies.
- **PR5** — Only apply this pattern to **Category 2** tables: synced exclusively by an event
  handler from another context, zero local command to build through. Category 1 (real
  aggregate) uses a Mother; Category 3 (cross-context orchestrator, large blast radius) stays
  as-is.
- **PR6** — Before migrating a call-site, verify every `overrides` field actually exists on
  `Insertable<Database[table]>` — a field the table type doesn't know is a real drift to report,
  not to silently drop.

## MUST NOT
- **N1** — ❌ One generic builder handling multiple tables via a dynamic table-name argument —
  forces `tableName as any` in Kysely's `.insertInto()`, losing the type safety the pattern
  exists to provide.
- **N2** — ❌ Put the builder outside the context that owns the table's production writes (e.g.
  in `authorization/` for a table `neighborhood-economy` owns).
- **N3** — ❌ Force a Category 2 projection through the full production event flow (register
  user → emit integration event → wait for handler) in every consuming L2 test — that tests the
  event bus, not the code under test, and is drastically slower.
- **N4** — ❌ Migrate the test that verifies the sync handler itself to use this builder — that
  test's insert is deliberately different/smaller than `defaults()`; that's expected, not drift.
- **N5** — ❌ Leave a Category 1 table (has a real aggregate + `create()`) as a bare insert
  "because it's faster" — use the Mother pattern instead.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ Projection table synced exclusively by another context's event handler (Category 2).
- ✅ Multiple test files with independently copied insert literals that have drifted.
- ✅ Test in context B needing "a row to exist" in context A's projection.
- ❌ A table backed by a real aggregate (Category 1 → Mother).
- ❌ The sync handler's own source-of-truth test.
- ❌ A Category 3 cross-context orchestrator fixture with large blast radius.

## Verifier — najczęstsze naruszenia
| Symptom w kodzie | Złamana reguła |
|---|---|
| `.insertInto(tableName as any)` w builderze | N1 |
| Builder w `test/shared/fixtures/` zamiast przy właścicielu tabeli | PR2/N2 |
| L2 test rejestruje realnego usera + czeka na integration event zamiast użyć row-buildera | N3 |
| Migracja `sync-*.handler.integration.spec.ts` na row-builder | N4 |
| Brak nagłówka wskazującego produkcyjny handler w builderze | PR3 |

**Pełny wzorzec**: [`typed-projection-row-builder-pattern.md`](./typed-projection-row-builder-pattern.md)
