---
id: DEV-halt-unverified-scope
status: promoted
resolution: >
  ORC-127: scopeBlock jednostek (id z dwukropkiem) mówi, że plik wspólny może zawierać hunki
  innych jednostek, a weryfikator ocenia tylko fragmenty wynikające z powodu jednostki i nie
  wpisuje pliku do unverified_scope z tego powodu.
trigger: halt
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-19
last_seen: 2026-10-23
occurrences: 2
projects:
  - juz-ide
  - juz-ide-api-1
---

# DEV-halt-unverified-scope

## Occurrences

- 2026-10-23 juz-ide-api-1 (TS-SEC-D0-FOLLOWUPS-001) run `wf_dece482e-cce` warstwa `infrastructure:retry-const` — GO weryfikatora z unverified_scope=auth-error.mapper.ts (plik 1099 linii współdzielony z wcześniejszymi jednostkami, diff względem HEAD zawiera hunki innych warstw) → 3 próby → ESCALATE_AND_HALT cause=machine; obejście: --overrides zawężające zakres oceny do hunków jednostki, wznowienie 1x GO
- 2026-10-19 juz-ide (TS-SEC-D0-BETA-HARDENING-001) warstwa `testing:tests-geo-revoke` — Weryfikator zwraca GO z niepustym unverified_scope przy checks tylko typecheck; silnik eskaluje jako machine (też testing:pr1-tests). Obejście: overrides tests:false, bramka końcowa i tak uruchamia pełne checks.
