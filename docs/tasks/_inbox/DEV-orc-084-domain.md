---
id: DEV-orc-084-domain
status: promoted
resolution: >
  Naprawione jako ORC-094 (2026-10-03): osobny log per check w sondzie (lint nadpisywał błędy tsc), pole lint i stałe mapowanie wyników.
trigger: halt
rule_ref: ORC-084
first_seen: 2026-10-03
last_seen: 2026-10-03
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-084-domain

## Occurrences

- 2026-10-03 marketing-hub (TS-MH-013) run `wf_84a1efdc-808` warstwa `domain` — Rename portu w domain przy typecheck całego apps/api czerwonym do późniejszych warstw: sonda bez pass, GO_WITH_GAPS niedostępne, halt machine; podobnie application (BLOCKED_BY_PRIOR) i lint zgłaszany jako typecheck w testing
