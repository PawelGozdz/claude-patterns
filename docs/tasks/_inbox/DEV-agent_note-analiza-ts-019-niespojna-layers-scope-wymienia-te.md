---
id: DEV-agent_note-analiza-ts-019-niespojna-layers-scope-wymienia-te
status: dismissed
dismissed_reason: >
  Jednorazowa niespójność analizy aegis-flow TS-019 (layers_scope wymienia test compose D19, a compose przeniesiono do zadania HTTP, Q1=B), wychwycona i obsłużona w przebiegu wf_3a5c22ec-f69; raport TS-019.report.md trafia do decyzji człowieka. Nie jest wadą wzorców ani silnika.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-18
last_seen: 2026-10-18
occurrences: 1
projects:
  - aegis-flow
---

# DEV-agent_note-analiza-ts-019-niespojna-layers-scope-wymienia-te

## Occurrences

- 2026-10-18 aegis-flow (TS-019) run `wf_3a5c22ec-f69` warstwa `testing:red-tests` — Analiza TS-019 niespójna: layers_scope wymienia test compose (D19) w red-tests, a compose przeniesiono do zadania HTTP (Q1=B, linie 266 vs 243).
