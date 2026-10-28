---
id: DEV-agent_note-dm4-z-dto-mapper-pattern-mapper-obok-komendy-prz
status: dismissed
dismissed_reason: >
  Jedno zgłoszenie z jednego projektu. DM4 ma uzasadnienie (mapper wspólny rozjeżdża się, gdy
  kształty DTO się różnią), a zatwierdzona decyzja D1 pkt 2b grant-flow wybiera wspólny
  toTaskDto świadomie. Wyjątek w karcie dopiero przy drugim projekcie z tym samym kształtem.
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-28
last_seen: 2026-10-28
occurrences: 1
projects:
  - grant-flow
---

# DEV-agent_note-dm4-z-dto-mapper-pattern-mapper-obok-komendy-prz

## Occurrences

- 2026-10-28 grant-flow (TS-UI-010) run `wf_b1414cd3-066` warstwa `final-gate` — DM4 z dto-mapper-pattern (mapper obok komendy) przeczy zatwierdzonej decyzji D1 pkt 2b (jeden wspólny toTaskDto dla odczytu i zapisu); karta nie ma wyjątku dla DTO współdzielonego.
