---
id: TASK-OBS-006
title: 'Plan przebiegu w run.start (orchestrate-prepare) + commit opisu deviation_note'
type: feature
status: todo
priority: P2
story_points: 2
created_date: 2026-10-10
updated_date: 2026-10-10
assignee: '@unassigned'
labels: [observability, telemetry, orchestration]
epic: EP-OBSERVABILITY-001
depends_on: []
related: [TASK-OBS-005]
source: 'ADR 0012 krok 2 (plan); ADR 0011 B2'
---

# TASK-OBS-006: plan przebiegu i deviation_note

## 🎯 Goal

„Zaplanowane 20 kroków, jesteśmy na 15" — do tego `run.start` orchestrate musi nieść plan
(warstwy i role z `runtime.yml`), a agenci muszą wiedzieć, kiedy zgłaszać odstępstwa.

## Zakres

1. `scripts/orchestrate-prepare.mjs`: przy przygotowaniu przebiegu `run.start` z `plan` (warstwy
   × role inner loop + bramka końcowa); runId Workflow dopięty przez collector (to samo `runId`).
2. ~~Opis `deviation_note`~~ — **zrobione** w `002d49e` (develop, 2026-10-10): stała
   `DEVIATION_NOTE_DESCRIPTION` jako `description` w IMPL_SCHEMA i VERDICT_SCHEMA
   (`scripts/workflow/orchestrate.template.mjs`) + test w `tests/flow-evals/orchestrate-script/run.js`.

3. **Wersja silnika w `run.start`** (decyzja 2026-10-10, po porównaniu dni 08.10 vs 10.10 z
   rollupów): zdarzenia nie wiedzą, który stan claude-patterns je wygenerował, a zmiany wchodzą do
   wszystkich projektów naraz przez symlinki — „przed i po zmianie orchestratora" to dziś tylko data.
   Nowe pole `engine` w `run.start` (krótki hash commitu claude-patterns, `git rev-parse --short`;
   bez gita → `null`), zmiana `schemas/telemetry-event-v1.schema.json` + ADR 0012 (pole opcjonalne,
   więc `v: 1` zostaje), wpis w `telemetry-emit run-start` i w konwerterze collectora. Agregat dzienny
   (`scripts/lib/telemetry-rollup.mjs`) liczy wtedy liczniki także per `engine`, żeby dało się
   porównać wersje bez zgadywania po dacie.
4. **Cena `claude-haiku-5-5` w `~/.claude/metrics/prices.json`**: >50% kroków orchestrate (sondy,
   część bramek) nie ma `costUsd`, bo modelu nie ma w cenniku (08.10: 198 z 394 kroków, 10.10: 131
   z 232), więc koszty z rollupów są mocno niedoszacowane. Plik leży poza repo; wartość ceny
   trzeba potwierdzić u źródła (cennik Anthropic), nie zgadywać. Zdarzenia już zapisane zostają
   bez kosztu — poprawka działa od następnych przebiegów (opcjonalnie: przeliczenie wsteczne z tokenów
   w zdarzeniach, które je mają).

## Kontekst dla świeżej sesji

- Plan istnieje w `runtime.yml` projektu (sekcja `orchestrate.layers` + `inner_loop` +
  `final_gate`); parser planu już jest: `parsePlan` w `scripts/workflow-conformance.mjs`.
- `runId` narzędzia Workflow (`wf_…`) nie jest znany w `orchestrate-prepare` (powstaje przy
  wywołaniu Workflow) — trzeba albo przekazać id z prepare do skryptu i do collectora, albo
  zapisać plan pod kluczem, który collector dopnie (np. hash `runtime.yml` + TS-ID + czas).
  Rozstrzygnij to jako pierwszy krok i zapisz decyzję w ADR 0012.
- Konwerter collectora: `scripts/lib/telemetry-legacy.mjs` (`legacyRunToEvents` emituje dziś
  `run.start` bez `plan`).

## Kryteria akceptacji

- [ ] `run.start` przebiegu orchestrate ma `plan` zgodny z `runtime.yml` z momentu przebiegu.
- [ ] `run.start` ma `engine` (hash commitu); schemat i ADR 0012 zaktualizowane, rollup rozdziela liczniki per `engine`.
- [ ] `claude-haiku-5-5` ma cenę w `prices.json`; nowy przebieg orchestrate nie zostawia kroków haiku bez `costUsd`.
- [ ] Evale `orchestrate-prepare` i `orchestrate-script` zielone.
