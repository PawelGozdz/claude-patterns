---
id: DEV-orc-012-testing
status: dismissed
dismissed_reason: >
  python/testing-pattern.md ma sekcję Applicability, która opisuje ten przypadek wprost: bez DDD i SQLAlchemy (engine/ + plik dziennika, jak aegis-flow) zostają idee, a części domain.* i SQLAlchemy się pomija. Karty _summary.md nie ma celowo, bo wzorzec jest doradczy, nie wiążący.
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: ORC-012
first_seen: 2026-10-21
last_seen: 2026-10-21
occurrences: 1
projects:
  - aegis-flow
---

# DEV-orc-012-testing

## Occurrences

- 2026-10-21 aegis-flow (TS-004) run `wf_b7eccac7-82d` warstwa `testing` — python/testing-pattern.md zakłada układ DDD z SQLAlchemy (domain.entities, repozytoria), a aegis-flow ma engine/ i plik dziennika; wzorzec niedopasowany do projektu, bez karty _summary.md
