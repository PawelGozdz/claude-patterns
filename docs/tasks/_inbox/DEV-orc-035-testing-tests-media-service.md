---
id: DEV-orc-035-testing-tests-media-service
status: promoted
resolution: >
  Naprawione od ręki jako ORC-111: units[].repair true zwalnia jednostkę naprawczą z bramki
  przyrostu testów (docs/decisions/orchestrate-rule-history.md#orc-111). Obejście tests:false
  nie jest już potrzebne.
trigger: halt
category: test
sources:
  - orchestrate
rule_ref: ORC-035
first_seen: 2026-10-19
last_seen: 2026-10-19
occurrences: 1
projects:
  - juz-ide
---

# DEV-orc-035-testing-tests-media-service

## Occurrences

- 2026-10-19 juz-ide (TS-SEC-D0-BETA-HARDENING-001) warstwa `testing:tests-media-service` — Jednostka naprawcza (dopasowanie istniejących testów, bez nowych bloków) dostaje ESCALATE przez sondę przyrostu testów = 0. Obejście: overrides tests:false.
