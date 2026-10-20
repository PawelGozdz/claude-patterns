---
id: DEV-halt-unverified-scope
status: proposed
trigger: halt
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-19
last_seen: 2026-10-19
occurrences: 1
projects:
  - juz-ide
---

# DEV-halt-unverified-scope

## Occurrences

- 2026-10-19 juz-ide (TS-SEC-D0-BETA-HARDENING-001) warstwa `testing:tests-geo-revoke` — Weryfikator zwraca GO z niepustym unverified_scope przy checks tylko typecheck; silnik eskaluje jako machine (też testing:pr1-tests). Obejście: overrides tests:false, bramka końcowa i tak uruchamia pełne checks.
