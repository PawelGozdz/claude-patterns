---
id: TASK-OBS-006
title: 'Plan przebiegu w run.start (orchestrate-prepare) + commit opisu deviation_note'
type: feature
status: blocked
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
blocked_by: 'staged zmiany innej sesji w scripts/orchestrate-prepare.mjs, scripts/workflow/orchestrate.template.mjs i tests/flow-evals/orchestrate-script/run.js (stan 2026-10-10)'
---

# TASK-OBS-006: plan przebiegu i deviation_note

## 🎯 Goal

„Zaplanowane 20 kroków, jesteśmy na 15" — do tego `run.start` orchestrate musi nieść plan
(warstwy i role z `runtime.yml`), a agenci muszą wiedzieć, kiedy zgłaszać odstępstwa.

## Zakres

1. `scripts/orchestrate-prepare.mjs`: przy przygotowaniu przebiegu `run.start` z `plan` (warstwy
   × role inner loop + bramka końcowa); runId Workflow dopięty przez collector (to samo `runId`).
2. Commit opisu `deviation_note` (już w drzewie 2026-10-10): stała `DEVIATION_NOTE_DESCRIPTION`
   jako `description` w IMPL_SCHEMA i VERDICT_SCHEMA + test w `orchestrate-script` + ADR 0011 B2.

## Kryteria akceptacji

- [ ] Odblokowane: inna sesja zacommitowała swoje zmiany w tych plikach.
- [ ] `run.start` przebiegu orchestrate ma `plan` zgodny z `runtime.yml` z momentu przebiegu.
- [ ] Evale `orchestrate-prepare` i `orchestrate-script` zielone.
