---
id: DEV-orc-141-final-gate
status: proposed
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: ORC-141
first_seen: 2026-11-17
last_seen: 2026-11-17
occurrences: 1
projects:
  - juz-ide-api-test
---

# DEV-orc-141-final-gate

## Occurrences

- 2026-11-17 juz-ide-api-test (TS-TEST-LOAD-015) run `wf_1c323528-319` warstwa `final-gate` — QH4 (query-handler-pattern) wymaga wstrzykiwania wyłącznie IQueryRepository, a get-reach-context/handler.ts wstrzykuje IGeographicLocationRepositoryWithBoundary (port komendowy z odczytami); karta nie rozstrzyga zgodności wąskiego odczytu D2a. Przypadek odziedziczony.
