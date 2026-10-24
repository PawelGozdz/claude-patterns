---
id: DEV-agent_note-pe-ny-pytest-k-scope-guardrail-authorize-dag-mia
status: dismissed
dismissed_reason: >
  Warstwy engine mają w checks tylko make typecheck i make lint, testy należą do warstwy
  testing, więc sonda zgłosiła skipped zgodnie z konfiguracją. Czerwień wyszła w pełnym pytest
  weryfikatora i została zgłoszona; test unieważniony zmianą z innej jednostki naprawia
  kolejna jednostka.
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-24
last_seen: 2026-10-24
occurrences: 1
projects:
  - aegis-flow
---

# DEV-agent_note-pe-ny-pytest-k-scope-guardrail-authorize-dag-mia

## Occurrences

- 2026-10-24 aegis-flow (TS-007) run `wf_cc338944-276` warstwa `engine:limits-rank` — Pełny pytest -k scope|guardrail|authorize|dag miał czerwony test_scope_audit_contract (ambiguous_assets) przez zmianę w scope_config.py z innej jednostki; sonda testów zgłosiła skipped.
