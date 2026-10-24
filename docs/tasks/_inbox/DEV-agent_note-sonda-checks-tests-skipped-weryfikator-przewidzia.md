---
id: DEV-agent_note-sonda-checks-tests-skipped-weryfikator-przewidzia
status: dismissed
dismissed_reason: >
  Zgodne z projektem: warstwa implementation w ai-gateway nie ma tests:true (testy należą do warstwy testing), więc sonda zwraca checks.tests=skipped, a weryfikator ocenia testy statycznie (jak w TS-AIG-075). Czerwony AT:secret poza zakresem warstwy (REVEAL_ALLOWLIST) to skutek zamierzonego zawężenia jednostki.
trigger: agent_note
category: test
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-21
last_seen: 2026-10-21
occurrences: 1
projects:
  - ai-gateway
---

# DEV-agent_note-sonda-checks-tests-skipped-weryfikator-przewidzia

## Occurrences

- 2026-10-21 ai-gateway (TS-AIG-102) run `wf_459d7f82-1a7` warstwa `implementation:core-adapter` — sonda checks.tests skipped; weryfikator przewidzial czerwony AT:secret poza zakresem warstwy (REVEAL_ALLOWLIST)
