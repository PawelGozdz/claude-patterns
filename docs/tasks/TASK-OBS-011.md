---
id: TASK-OBS-011
title: 'Blokady z hooków w metrykach'
type: feature
status: todo
priority: P3
story_points: 3
created_date: 2026-10-17
updated_date: 2026-10-17
assignee: '@unassigned'
labels: [observability, telemetry]
epic: EP-OBSERVABILITY-001
depends_on: [TASK-OBS-004]
related: [TASK-OBS-009]
source: 'przegląd luk telemetrii 2026-10-17 (po TASK-OBS-004)'
---

# TASK-OBS-011: blokady z hooków w metrykach

## 🎯 Goal

Zobaczyć, ile razy i jakie reguły hooków (`block-root-grep`, `block-subagent-commit` i podobne) faktycznie
blokują pracę. To pokazuje, które reguły się opłacają, a które tylko drażnią. Dziś blokada znika bez śladu.

## Zakres

1. Nowy proces `hook` w schemacie (razem z OBS-010 albo po nim; wspólna zmiana listy zamkniętej, ADR 0012).
2. Hooki blokujące zapisują zdarzenie WYŁĄCZNIE przy zablokowaniu: `step.end` z `step.role` = id reguły,
   `outcome: halted`. Bez treści komendy i bez ścieżek. Przepuszczenia nie są zapisywane (wolumen > 1000/dzień).
3. Zapis best-effort, hook zawsze kończy się `exit 0` (zasada repo); wspólny helper w `hooks/lib/`.
4. Eval w `tests/flow-evals/telemetry-events/`: blokada → jedno zdarzenie, przepuszczenie → zero.

## Kryteria akceptacji

- [ ] Zablokowanie przez hook zostawia jedno zdarzenie z id reguły; przepuszczenie nie zostawia nic.
- [ ] W zdarzeniu nie ma treści komendy ani ścieżki (test).
- [ ] Hook nie wydłuża się o więcej niż kilka ms (zapis dopisujący jedną linię).
