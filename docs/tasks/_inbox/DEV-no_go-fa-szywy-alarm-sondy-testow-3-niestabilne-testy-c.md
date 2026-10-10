---
id: DEV-no_go-fa-szywy-alarm-sondy-testow-3-niestabilne-testy-c
status: promoted
resolution: >
  Naprawione jako ORC-103 (2026-10-10): sonda uruchamia padające pliki raz osobno; zgodna lista plików + zielony ponowny bieg = testy zielone z ostrzeżeniem (testsRerunPassed).
trigger: no_go
rule_ref: null
first_seen: 2026-10-08
last_seen: 2026-10-08
occurrences: 1
projects:
  - grant-flow
---

# DEV-no_go-fa-szywy-alarm-sondy-testow-3-niestabilne-testy-c

## Occurrences

- 2026-10-08 grant-flow (TS-PROJ-COMPANY-001) run `wf_d2eb9423-339` warstwa `testing` — Fałszywy alarm sondy testów: 3 niestabilne testy czasowe/entropii (shared/security, shared/validation) czerwone pod obciążeniem, zielone w izolacji 53/53; obejście layers.testing.tests=false
