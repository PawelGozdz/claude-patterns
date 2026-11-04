---
id: DEV-agent_note-logi-sondy-tmp-check-final-n-log-sa-wspo-dzielo
status: proposed
trigger: agent_note
category: infra
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-11-03
last_seen: 2026-11-03
occurrences: 1
projects:
  - grant-flow
---

# DEV-agent_note-logi-sondy-tmp-check-final-n-log-sa-wspo-dzielo

## Occurrences

- 2026-11-03 grant-flow (TS-PROJ-WRITEOWN-002) run `wf_4ca93096-102` warstwa `final-gate` — Logi sondy /tmp/check-final-<n>.log są współdzielone między repozytoriami: równoległy przebieg aegis-flow nadpisał logi grant-flow, więc bramka nie mogła odczytać wyników typecheck/test. Nazwa logu powinna zawierać projekt lub id przebiegu.
