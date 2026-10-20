---
id: TASK-OBS-010
title: 'Bramki pre-commit w metrykach'
type: feature
status: done
priority: P3
story_points: 3
created_date: 2026-10-17
updated_date: 2026-10-18
assignee: '@unassigned'
labels: [observability, telemetry]
epic: EP-OBSERVABILITY-001
depends_on: [TASK-OBS-004]
related: [TASK-OBS-009]
source: 'przegląd luk telemetrii 2026-10-17 (po TASK-OBS-004)'
---

# TASK-OBS-010: bramki pre-commit w metrykach

## 🎯 Goal

Wiedzieć, która z ~31 bramek `scripts/pre-commit-guards.mjs` faktycznie coś łapie, a która jest martwa
lub zawsze czerwona z cudzej winy. Dziś bramki nie zostawiają żadnego śladu poza ekranem commitującego.

## Zakres

1. Nowy proces `pre-commit` w `schemas/telemetry-event-v1.schema.json` (świadoma zmiana listy zamkniętej,
   dopisek w ADR 0012) i w `PROCESSES` walidatora.
2. `runCheck` w `pre-commit-guards.mjs` zapisuje `step.end`: `step.role` = stała nazwa bramki (bez nazw plików
   z etykiet typu „zmienione: a.js, b.js"), `outcome` ok/failed, `m.durationMs`. Jeden `run.start`/`run.end` na commit.
3. Zapis best-effort (nigdy nie zmienia wyniku bramki), nie mierzy się sam siebie rekurencyjnie.
4. Eval: katalog tymczasowy `CLAUDE_TELEMETRY_DIR`; asercja, że w zdarzeniach nie ma nazw plików.

## Kryteria akceptacji

- [x] Jeden commit = `run.start` + krok per bramka + `run.end`; z agregatu da się policzyć odsetek porażek per bramka.
- [x] W zdarzeniach i agregacie nie ma ścieżek ani nazw plików (test).
- [x] Narzut na commit < 100 ms.

## Wynik (2026-10-18)

- `lib/precommit-telemetry.mjs` buduje i zapisuje przebieg; `pre-commit-guards.mjs` woła go raz, po zebraniu
  wyników, przed wyliczeniem kodu wyjścia (błąd zapisu = jedna linia na stderr, wynik bramek bez zmian).
- Nazwa bramki w `step.role` to stały `id` (slug statycznej etykiety). Dwie bramki z etykietą dynamiczną
  (`audit-projects --gate`, `generate-inbox-index --check`) podają `id` jawnie; eval pilnuje tego statycznie
  oraz unikalności id (inaczej `count-assets --check` i `--check-docs` wpadłyby do jednego kubełka).
- Przyczyna porażki z rodziny bramki: `eval-*` → `test`, `lint-*` → `lint`, reszta → `config`.
- Narzut zapisu: 1,4–3,4 ms na realnej historii (16 tys. linii). Dlatego `appendEventsDedup` dostał opcję
  `dedup: false` — domyślny skan czyta wszystkie pliki zdarzeń i rósłby z historią.
- Na prawdziwych bramkach: 33 kroki, 35 zdarzeń, bez nazw plików.
