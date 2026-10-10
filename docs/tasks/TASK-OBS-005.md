---
id: TASK-OBS-005
title: 'Agregaty dzienne telemetrii (telemetry/rollups/) i generowany _inbox/index.json'
type: feature
status: todo
priority: P1
story_points: 5
created_date: 2026-10-10
updated_date: 2026-10-10
assignee: '@unassigned'
labels: [observability, telemetry, dashboard]
epic: EP-OBSERVABILITY-001
depends_on: []
related: [TASK-OBS-003, TASK-OBS-008]
source: 'ADR 0012 krok 5; decyzja 2026-10-10: skrzynka zostaje markdownem (edycja w triage), widok maszynowy generowany obok'
---

# TASK-OBS-005: agregaty dzienne i indeks skrzynki

## 🎯 Goal

Dashboard i przyszły serwer czytają małe, zagregowane pliki JSON — nie 13 tys. surowych zdarzeń
ani 115 plików markdown. Agregaty są w gicie (scalają się z wielu maszyn), surowe zdarzenia nie.

## Kontekst dla świeżej sesji

- Dane wejściowe: `telemetry/events/RRRR-MM.jsonl` (~13 tys. zdarzeń 2026-07…10 po migracji;
  odtworzenie: `node scripts/telemetry-migrate-legacy.mjs`, idempotentne). Odczyt:
  `readEvents` z `scripts/lib/telemetry-events.mjs`.
- Liczby kontrolne z migracji (2026-10-10) do testu agregatu: kanoniczny orchestrate
  `run.end` = ok 239 / no_go 172 / killed 9; first-pass GO weryfikatora 89,3% (orchestrate)
  vs 65,4% (workflow); koszt napraw 22,5% (orchestrate); cichy zgon 4,1% kroków.
- „Naprawione/otwarte": `step.fixes` wskazuje werdykt, który implementer naprawia; naprawione =
  kolejny werdykt tej samej jednostki (`step.id` z prefiksem `grupa:jednostka:`) ma `go`.
- Nagłówki skrzynki czyta dziś `readInboxEntries` w `scripts/report-deviation.mjs` (nieeksportowane,
  plik jest CLI) — przenieś do `scripts/lib/` zamiast kopiować.
- Wzorzec pliku generowanego z markerem GENERATED i `--check`: `scripts/generate-patterns-readme.mjs`.

## Zakres

1. `scripts/telemetry-aggregate.mjs` → `telemetry/rollups/<projekt>/<RRRR-MM-DD>.json`: liczniki
   per proces × rola × outcome × cause, p50/p90 czasu, koszt, first-pass yield, udział i koszt
   napraw (`attempt > 1`), skuteczność napraw (`fixes` → wynik kolejnego werdyktu), cichy zgon,
   `run.end` per outcome, gęstość `deviation` per sygnatura. **Bez `taskRef`.**
2. Idempotentny: przeliczenie dnia nadpisuje jego plik; uruchamiany z crona po audycie.
3. `docs/tasks/_inbox/index.json` generowany z nagłówków rekordów (id, status, trigger,
   category, sources, occurrences, projects, first_seen, last_seen) z markerem GENERATED;
   rekordy bez `category` dostają `defaultCategory(trigger)`.
4. `pre-commit-guards`: `index.json` aktualny względem skrzynki (`--check`).

## Kryteria akceptacji

- [ ] Agregat dnia z migrowanych danych zgadza się z ręcznym przeliczeniem (np. 172/420 NO_GO bramki końcowej).
- [ ] Żaden plik w `telemetry/rollups/` nie zawiera `taskRef`, `runId` ani ścieżek (eval).
- [ ] `index.json` odtwarzalny; ręczna edycja wykrywana przez `--check`.
- [ ] Wpis cron i dokumentacja w ADR 0012.
