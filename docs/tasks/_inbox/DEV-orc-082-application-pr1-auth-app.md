---
id: DEV-orc-082-application-pr1-auth-app
status: promoted
resolution: >
  Naprawione od ręki jako ORC-112: przy remisie własności pliku między jednostkami jednej
  warstwy (wspólny gruby dirs) rozstrzyga scope.dirs, więc odroczenie ORC-082 działa bez
  ręcznych --overrides (docs/decisions/orchestrate-rule-history.md#orc-112).
trigger: blocked_by_prior
category: other
sources:
  - orchestrate
rule_ref: ORC-082
first_seen: 2026-10-19
last_seen: 2026-10-19
occurrences: 1
projects:
  - juz-ide
---

# DEV-orc-082-application-pr1-auth-app

## Occurrences

- 2026-10-19 juz-ide (TS-SEC-D0-BETA-HARDENING-001) warstwa `application:pr1-auth-app` — Gruby dirs warstw + layers_scope: [] dają remisy własności plików (layerMatchScore): czerwień typecheck z plików późniejszych warstw blokowała wcześniejszą warstwę. Obejście: --overrides z zawężonymi dirs per jednostka. Węższy scope.dirs powinien wygrywać z grubym dirs tej samej warstwy.
