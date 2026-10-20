---
id: DEV-orc-074-engine
status: promoted
resolution: >
  Naprawione 2026-10-20 jako ORC-117 (docs/decisions/orchestrate-rule-history.md#orc-117): GO z unverified_scope idzie w reverify, a drobne ustalenia (minor_findings) przepadały, bo przejście naprawcze ORC-091 działało tylko przy czystym GO. Teraz przed reverify jest jedno przejście naprawcze implementera (minorPassBeforeReverify). Brak testów jako luka zakresu warstwy kodu jest zamierzony przy podziale na jednostki.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: ORC-074
first_seen: 2026-10-20
last_seen: 2026-10-20
occurrences: 1
projects:
  - aegis-flow
---

# DEV-orc-074-engine

## Occurrences

- 2026-10-20 aegis-flow (TS-017) run `wf_6cd40ef0-6b9` warstwa `engine` — Weryfikator warstwy engine zgłosił bug czytnika (TypeError dla nie-str event) jako minor_finding w rundzie 2 (GO z unverified_scope), a w rundzie 3 jako HIGH/NO_GO; rundy GO z lukami przechodzą w reverify bez przebiegu naprawczego i nie naprawiają minor_findings, więc warstwa wyczerpała 3 próby na jednej linii poprawki. Dodatkowo weryfikator warstwy kodu notuje brak testów jako luka zakresu (testy należą do jednostki testing).
