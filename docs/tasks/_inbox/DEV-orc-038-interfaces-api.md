---
id: DEV-orc-038-interfaces-api
status: proposed
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: ORC-038
first_seen: 2026-11-03
last_seen: 2026-11-03
occurrences: 1
projects:
  - pcu
---

# DEV-orc-038-interfaces-api

## Occurrences

- 2026-11-03 pcu (TASK-062) warstwa `interfaces:api` — final-gate: poprawka ustalenia (lost update w parse-script) leży w plikach trzech warstw (api, service, db), a runda naprawcza kieruje ją do jednej warstwy bez praw do pozostałych; jednostki w analizie nie obejmują wspólnie tych plików
