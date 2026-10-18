---
id: DEV-agent_note-weryfikator-testing-zg-osi-deviation-note-o-karci
status: dismissed
dismissed_reason: >
  Kolejność jednostek w jednym przebiegu: weryfikator warstwy testing zgłosił kartę
  aig-invariants.md, którą aktualizowała jednostka U1 (ai-gateway TS-AIG-075). Cudze zakresy
  odfiltrowują ORC-070 i ORC-093.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-10
last_seen: 2026-10-10
occurrences: 1
projects:
  - ai-gateway
---

# DEV-agent_note-weryfikator-testing-zg-osi-deviation-note-o-karci

## Occurrences

- 2026-10-10 ai-gateway (TS-AIG-075) run `wf_868eba50-308` warstwa `testing:U2` — Weryfikator testing zgłosił deviation_note o karcie aig-invariants bez sprawdzenia treści (plik poza zakresem warstwy); karta faktycznie zaktualizowana przez U1
