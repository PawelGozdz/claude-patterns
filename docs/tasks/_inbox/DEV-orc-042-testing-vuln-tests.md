---
id: DEV-orc-042-testing-vuln-tests
status: proposed
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: ORC-042
first_seen: 2026-11-11
last_seen: 2026-11-11
occurrences: 1
projects:
  - my-intelligence
---

# DEV-orc-042-testing-vuln-tests

## Occurrences

- 2026-11-11 my-intelligence (TS-072) run `wf_2d549075-e1e` warstwa `testing:vuln-tests` — Implementer testów zgłosił poprawki spoza tests/: brak defusedxml w requirements.txt (wymaga go parsers/cwe_xml.py) i brak krs_bulk w config/sources/_schema.yaml (valid_collector_types).
