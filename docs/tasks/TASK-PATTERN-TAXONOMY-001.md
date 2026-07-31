---
id: TASK-PATTERN-TAXONOMY-001
title: 'Napisać pattern card: taxonomy-reference-data-pattern.md'
type: task
status: planned
priority: P3
story_points: TBD
created_date: 2026-07-25
updated_date: 2026-07-25
assignee: unassigned
labels: [patterns, documentation, taxonomy]
source: >
  juz-ide-api-2, project-orchestration/tasks/TS-TAXONOMY-SUBSCRIPTIONS-001-category-migration-notifications.md
  (WARN #8, fast-follow z final gate TS-TAXONOMY-EXPAND-001), przeniesione tu jako D6
  ustalenia project-orchestration/analysis/TS-TAXONOMY-SUBSCRIPTIONS-001-category-migration-notifications.analysis.md.
---

# TASK-PATTERN-TAXONOMY-001 — pattern card dla statycznych, per-kontekstowych drzew referencyjnych

## Kontekst

`patterns/domain/taxonomy-reference-data-pattern.md` **nie istnieje** w tym repo. Karta była
dopuszczona jako niedublokujący fast-follow przy zamknięciu `TS-TAXONOMY-EXPAND-001` (AC7,
projekt konsument: `juz-ide-api-2`, ADR-0110 tamtego projektu), ale żaden ticket po stronie
`claude-patterns` nie został dotąd założony — ryzyko, że karta zostanie zapomniana na stałe,
skoro task-konsument, który ją wywołał, właśnie się zamyka.

## Zakres

- [ ] Napisać Rule Card + pełny pattern dla statycznych, per-kontekstowych drzew referencyjnych
      (wzorzec `shared/domain/taxonomy/*.taxonomy.ts` z `juz-ide-api-2`/ADR-0110).
- [ ] Udokumentować kontrakt: `isActive`-blind vs `allActiveSlugs()`, `freezeTaxonomyTree()`.
- [ ] Konwencja nazw plików wg roli domenowej (nie konsumenta).
- [ ] Rozróżnienie względem `config-policy-aggregate-pattern.md` (Anti-Pattern 4 — statyczne
      dane referencyjne, zero runtime mutation surface, BR-TAX-206 w projekcie źródłowym).

## Powiązania

- Konsument: `juz-ide-api-2`, ADR-0110 (`docs/adr/0110-static-context-owned-taxonomy.md`).
- Wynika z: `TS-TAXONOMY-EXPAND-001` (AC7) → `TS-TAXONOMY-SUBSCRIPTIONS-001` (D6).
