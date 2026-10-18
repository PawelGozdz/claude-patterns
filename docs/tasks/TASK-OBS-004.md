---
id: TASK-OBS-004
title: 'Audyt floty i setup jako źródła metryk; setup zgłasza odstępstwa do skrzynki'
type: feature
status: done
priority: P2
story_points: 3
created_date: 2026-10-10
updated_date: 2026-10-17
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

## Kontekst dla świeżej sesji

- Audyt: `scripts/audit-projects.mjs` (CLI, `--all`, `--report`, `--root` dla testów, pomija
  katalogi `_*`), kontrole w `scripts/lib/audit-checks.mjs`; sekcja `--report` mapuje błędy na
  reguły `AUD-*` i woła `report-deviation --once-per-project`. Eval:
  `tests/flow-evals/audit-projects/run.js` (wszystko w katalogu tymczasowym).
- Cron (crontab użytkownika `dev`): `30 7 * * 1-5 /opt/projects/claude-patterns/scripts/cron/audit-daily.sh >>
  ~/.claude/metrics/audit-daily.log 2>&1` — wrapper (`scripts/cron/audit-daily.sh`) znajduje node i woła audyt
  z `--all --report`; po wdrożeniu każdy codzienny przebieg da metryki.
- Setup: `scripts/setup-project.sh <projekt>`; materializacja w kroku 5a
  (`scripts/materialize-runtime.mjs`), README wzorców `scripts/generate-patterns-readme.mjs`.
  Po każdej edycji `.sh`: `bash -n`. Eval: `tests/flow-evals/setup-project/run.js`.
- Projekt testowy: aegis-flow (`/opt/projects/aegis-flow`).

## Zakres (zrealizowany 2026-10-17, po zawężeniu)

1. `scripts/audit-projects.mjs` + `scripts/lib/audit-telemetry.mjs`: `run.start`/`run.end` (`process: audit`,
   projekt `claude-patterns`) + `step.end` per projekt × kontrola, także OK. `step.group` = projekt,
   `step.role` = nazwa kontroli (agregat grupuje po `process × role`, więc daje odsetek porażek per kontrola),
   `step.id` = `projekt:kontrola`; `failed` + `cause: config` przy BŁĘDZIE lub OSTRZEŻENIU, `ok` przy samym INFO.
   Zapis nie zależy od `--report`; nie powstaje przy `--gate` (pre-commit) ani z `--no-telemetry`.
   Kontrole: runtime, dead-links, git-hygiene, env-deny, claude-md, surplus, templates, local-blocks,
   verify-setup, manifest; globalne: routing, telemetry-freshness, rag-freshness, outside-blocks.
2. `scripts/setup-project.sh`: ostrzeżenia, które setup tylko wypisywał, idą do skrzynki przez
   `report-deviation --source setup --trigger setup_drift --once-per-project` (helper `report_drift`):
   `SETUP-OVERLAY-DIR-MISSING` (overlay bez katalogu w centrali: patterns/agents/rules), `SETUP-MATERIALIZE-FAILED`,
   `SETUP-README-MANUAL` (ADR 0011 B3).
3. **Świadomie pominięte:** `run.start`/`run.end` samego setupu. Setup uruchamia się rzadko i ręcznie, a ocena
   „czy się udał" i tak wynika z ostrzeżeń w skrzynce i z audytu; osobny przebieg dawałby dwa zdarzenia na kilka dni.

## Kryteria akceptacji

- [x] Jeden przebieg `audit-projects --all` = zdarzenia dla wszystkich projektów i kontroli (21 projektów, 231 zdarzeń); z nich da się policzyć % OK (sprawdzone na `buildRollups`, eksport bez przecieków).
- [x] Ostrzeżenia setupu trafiają do skrzynki z `--once-per-project`; eval `setup-project` zielony (2/2). Setup nie zostawia `run.start`/`run.end` — patrz punkt 3.
- [x] Eval `audit-projects` sprawdza zdarzenia (katalog tymczasowy `CLAUDE_TELEMETRY_DIR`), 23/23.
