---
id: TASK-OBS-005
title: 'Agregaty dzienne telemetrii (telemetry/rollups/) i generowany _inbox/index.json'
type: feature
status: done
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

## Stan (2026-10-10) — zamknięte

Zrobione zgodnie z zakresem, z jednym odstępstwem: **plik agregatu jest per host** —
`telemetry/rollups/<projekt>/<RRRR-MM-DD>.<host>.json`, nie `<dzień>.json`. Surowe zdarzenia są per
maszyna i poza gitem, więc plik z jednej maszyny nadpisałby plik drugiej, a percentyle nie dają się
sumować (plik hosta niesie liczniki do zsumowania i lokalne percentyle). Szczegóły i definicje
metryk: ADR 0012, krok 5.

Pliki: `scripts/telemetry-aggregate.mjs` + `scripts/lib/telemetry-rollup.mjs` (czysta funkcja),
`scripts/generate-inbox-index.mjs` + `scripts/lib/inbox.mjs` (czytnik wspólny z `report-deviation`),
`rollupsDir()` w `scripts/lib/telemetry-events.mjs`, eval `tests/flow-evals/telemetry-rollups/`
(13 przypadków; mutacje: numer rundy, ostatni zamiast pierwszego werdyktu, `taskRef` w agregacie —
wszystkie wykryte), wpisy w `pre-commit-guards`, cron `45 7 * * 1-5` po audycie.

Na prawdziwych danach (271 plików, 1,2 MB, 13 142 zdarzenia): sumy `run.end` orchestrate z agregatów
(ok 246 / no_go 174 / killed 9) równają się surowemu zliczeniu, w najbardziej zajętym dniu
(2026-10-03) zero różnic w werdyktach weryfikatora. Liczby kontrolne z tasku (239/172/9) są sprzed
kilku nowych przebiegów, więc kryterium sprawdzone na bieżących danych, nie na zamrożonych.

**Otwarte:** first-pass 89,3% / 65,4% z migracji nie dał się odtworzyć (agregat: 86,6% / 68,0%;
definicja w ADR 0012); `--check` agregatów nie jest w pre-commit (zdarzenia per maszyna); pliki
agregatów zmieniane przez cron zostają w drzewie jako niezacommitowane.

## Kryteria akceptacji

- [x] Agregat dnia z danych zgadza się z niezależnym przeliczeniem (sumy `run.end`, werdykty z 2026-10-03; eval z ręcznie policzonym zestawem). *Liczby 172/420 z migracji sprawdzone na bieżących danych: 174/429.*
- [x] Żaden plik w `telemetry/rollups/` nie zawiera `taskRef`, `runId` ani ścieżek (eval + grep po 271 plikach).
- [x] `index.json` odtwarzalny; ręczna edycja wykrywana przez `--check` (eval, `--check` w pre-commit przy zmianach skrzynki).
- [x] Wpis cron i dokumentacja w ADR 0012.
