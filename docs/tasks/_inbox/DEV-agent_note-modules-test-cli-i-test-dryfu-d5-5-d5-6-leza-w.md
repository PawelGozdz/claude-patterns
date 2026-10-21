---
id: DEV-agent_note-modules-test-cli-i-test-dryfu-d5-5-d5-6-leza-w
status: dismissed
dismissed_reason: >
  Zgodne z projektem: testy w tests/ nie należą do dirs warstwy modules (pcu), więc warstwa
  słusznie je pominęła, a pokrywa je warstwa testing, która w tym przebiegu została wykonana.
  Notatka to ostrzeżenie agenta, nie odstępstwo od reguły.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-21
last_seen: 2026-10-21
occurrences: 1
projects:
  - pcu
---

# DEV-agent_note-modules-test-cli-i-test-dryfu-d5-5-d5-6-leza-w

## Occurrences

- 2026-10-21 pcu (TASK-072) run `wf_7bb4cf24-3be` warstwa `modules` — modules: test CLI i test dryfu (D5.5, D5.6) leżą w tests/, poza dirs warstwy modules; warstwa pominęła je jako poza zakresem, wykonała testing
