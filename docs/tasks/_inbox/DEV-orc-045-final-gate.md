---
id: DEV-orc-045-final-gate
status: proposed
trigger: agent_note
category: infra
sources:
  - orchestrate
rule_ref: ORC-045
first_seen: 2026-11-12
last_seen: 2026-11-12
occurrences: 1
projects:
  - juz-ide-api-4
---

# DEV-orc-045-final-gate

## Occurrences

- 2026-11-12 juz-ide-api-4 (TS-AUTH-LEGAL-HOLD-DB-TYPES-001) run `wf_ac63a8d9-461` warstwa `final-gate` — Plik kart wstrzykiwany do agenta (cards-__all.md, 1029 linii, ok. 33,9 tys. tokenów) przekracza limit jednego Read (25 tys. tokenów); polecenie 'jedno wywołanie Read w całości' wymagało drugiego odczytu i zjadło 1 z 15 wywołań budżetu bramki końcowej.
