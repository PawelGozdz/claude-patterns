---
id: DEV-agent_note-schemat-final-gate-nie-ma-pola-na-warn-dread-6-8
status: dismissed
dismissed_reason: >
  WARN (DREAD 6-8) trafia do minor_findings z prefiksem i dociera do implementera warstwy
  (ORC-091), więc nic nie ginie. Osobne pole w schemacie bramki ma sens dopiero, gdy coś
  zacznie filtrować WARN mechanicznie.
trigger: agent_note
category: config
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-24
last_seen: 2026-10-24
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-agent_note-schemat-final-gate-nie-ma-pola-na-warn-dread-6-8

## Occurrences

- 2026-10-24 juz-ide-api-2 (TS-SEC-EVENT-GEOFILTER-ORACLE-001) run `wf_5aae9701-07b` — Schemat final_gate nie ma pola na WARN (DREAD 6-8) z rubryki security-e2e-verifier; WARN trafia do minor_findings z prefiksem.
