---
id: DEV-orc-085-api
status: promoted
resolution: >
  ORC-118: prompt sondy kończył się bezwarunkowo linią o braku skryptu w package.json, także dla komend dosłownych (make typecheck) w projekcie Pythona. Teraz dla samych komend dosłownych linia znika, a skipped znaczy tylko brak samej komendy (docs/decisions/orchestrate-rule-history.md#orc-118). Przyczyna jest prawdopodobna, bez dziennika przebiegu; gdy ślepa sonda wróci, trzeba zajrzeć w dziennik.
trigger: agent_note
category: typecheck
sources:
  - orchestrate
rule_ref: ORC-085
first_seen: 2026-10-21
last_seen: 2026-10-21
occurrences: 1
projects:
  - aegis-flow
---

# DEV-orc-085-api

## Occurrences

- 2026-10-21 aegis-flow (TS-004) run `wf_b7eccac7-82d` warstwa `api` — sonda warstwy api ślepa: make typecheck i make lint wszystkie skipped (warnings w raporcie)
