---
id: DEV-orc-035-testing
status: promoted
resolution: >
  ORC-131: deltaGateFails nie wyzwala się, gdy wcześniejsza próba tej warstwy w przebiegu
  zmierzyła przyrost bloków > 0 (zero po dodatnim to sprzeczność pomiaru). Przyczyna
  sprzeczności (praca zacommitowana między próbami albo błąd sondy) to wniosek z kodu, bez
  dziennika przebiegu wf_04685e97-c0f.
trigger: no_go
category: verifier
sources:
  - orchestrate
rule_ref: ORC-035
first_seen: 2026-10-24
last_seen: 2026-10-24
occurrences: 1
projects:
  - juz-ide-api
---

# DEV-orc-035-testing

## Occurrences

- 2026-10-24 juz-ide-api (TS-SEC-SP-LOCATION-001) run `wf_04685e97-c0f` warstwa `testing` — Bramka przyrostu testów dała fałszywy ESCALATE_AND_HALT (cause:code) po przejściu naprawczym, które tylko zmieniało nazwy/asercje (0 nowych bloków), mimo że ta sama warstwa dodała 111 bloków i weryfikator dał GO; obejście: layers.testing.tests=false
