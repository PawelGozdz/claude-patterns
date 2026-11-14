---
id: DEV-agent_note-lista-plikow-bramki-koncowej-pomija-test-load-gene
status: proposed
trigger: agent_note
category: infra
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-11-13
last_seen: 2026-11-13
occurrences: 1
projects:
  - juz-ide-api-test
---

# DEV-agent_note-lista-plikow-bramki-koncowej-pomija-test-load-gene

## Occurrences

- 2026-11-13 juz-ide-api-test (TS-TEST-LOAD-014) run `wf_aca905d2-b57` warstwa `final-gate` — Lista plików bramki końcowej pomija test/load/generated/flow-graph.ts i step-functions.ts, zmienione przez U-A (dirs obejmuje generated/); git add wg listy zostawiłby je poza stagingiem
