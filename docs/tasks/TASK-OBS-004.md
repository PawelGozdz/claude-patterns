---
id: TASK-OBS-004
title: 'Audyt floty i setup jako źródła metryk; setup zgłasza odstępstwa do skrzynki'
type: feature
status: todo
priority: P2
story_points: 3
created_date: 2026-10-10
updated_date: 2026-10-10
assignee: '@unassigned'
labels: [observability, telemetry, audit, setup]
epic: EP-OBSERVABILITY-001
depends_on: []
related: [TASK-OBS-005]
source: 'ADR 0012 krok 4; ADR 0011 B3'
---

# TASK-OBS-004: audyt i setup w metrykach

## 🎯 Goal

Odsetek zdrowia floty dzień po dniu: audyt zapisuje wynik KAŻDEJ kontroli w każdym projekcie
(także OK), a nie tylko błędy. Setup zapisuje swój przebieg i zgłasza do skrzynki to, co dziś
tylko wypisuje na ekran.

## Zakres

1. `scripts/audit-projects.mjs`: `run.start`/`run.end` (`process: audit`) + `step.end` per
   projekt × kontrola (`step.group` = projekt, `step.id` = kontrola, `outcome` ok/failed,
   `cause: config`). Przy `--report` i bez — metryka nie zależy od zgłaszania.
2. `scripts/setup-project.sh`: `run.start`/`run.end` (`process: setup`) przez `telemetry-emit`.
3. Setup → `report-deviation --source setup --trigger setup_drift`: materializacja z ostrzeżeniem,
   kategoria overlay bez katalogu, README zachowany jako ręczny (ADR 0011 B3).

## Kryteria akceptacji

- [ ] Jeden przebieg `audit-projects --all` = zdarzenia dla wszystkich projektów i kontroli; z nich da się policzyć % OK.
- [ ] Setup na aegis-flow zostawia `run.start`/`run.end`; ostrzeżenie materializacji trafia do skrzynki z `--once-per-project`.
- [ ] Eval `audit-projects` sprawdza zdarzenia (katalog tymczasowy `CLAUDE_TELEMETRY_DIR`).
