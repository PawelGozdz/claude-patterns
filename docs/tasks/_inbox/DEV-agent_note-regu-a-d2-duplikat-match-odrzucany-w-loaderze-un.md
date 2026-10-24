---
id: DEV-agent_note-regu-a-d2-duplikat-match-odrzucany-w-loaderze-un
status: promoted
resolution: >
  ANL-038 (uzupełnione 2026-10-25): usunięcie lub zawężenie pola, typu albo reguły wymaga w
  dirs jednostki także konsumentów i testów, które na tym polegają; ORC-042 zadziałał
  poprawnie (zgłoszenie zamiast edycji), brakowało ich w planie.
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

# DEV-agent_note-regu-a-d2-duplikat-match-odrzucany-w-loaderze-un

## Occurrences

- 2026-10-24 aegis-flow (TS-007) run `wf_cc338944-276` warstwa `engine:scope-dup` — Reguła D2 (duplikat match odrzucany w loaderze) unieważnia testy poza zakresem warstwy: test_scope_match (tie) i test_scope_audit_contract (ambiguous_assets).
