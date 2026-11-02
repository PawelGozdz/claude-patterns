---
id: DEV-orc-111-testing-generated-types
status: promoted
resolution: >
  ORC-148 (2026-10-31): expandUnits nie kopiował units[].repair do pod-warstwy, więc szablon i
  --overrides go nie widziały; każda warstwa w wyjściu prepare ma teraz pole repair (eval
  units-repair-flag-reaches-the-layer).
trigger: no_go
category: other
sources:
  - orchestrate
rule_ref: ORC-111
first_seen: 2026-10-31
last_seen: 2026-10-31
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-orc-111-testing-generated-types

## Occurrences

- 2026-10-31 juz-ide-api-2 (TS-SEC-SP-LOCATION-CONTRACT-001) run `wf_51b73b1b-102` warstwa `testing:generated-types` — units[].repair:true z analizy jest walidowane przez prepare, ale nie trafia do warstwy (prepare.json layers[].repair undefined, emitowany skrypt nie ma pola), a --overrides odrzuca layers.<id>.repair jako nieznany klucz; jednostka regenerująca typy dostała fałszywy ESCALATE z bramki przyrostu testów ORC-035. Obejście: layers.<id>.tests=false.
