---
id: DEV-orc-082-domain
status: dismissed
dismissed_reason: >
  ORC-082 zadziałał zgodnie z regułą: błąd TS w neighborhood-group.aggregate.ts leżał w PEŁNYCH dirs warstwy domain (poza zawężonym layers_scope), więc plik jest jej własny i nie podlega odroczeniu. Przyczyną był zbyt wąski layers_scope analizy TS-SEC-MAP-GROUP-PIN-001 (agregat implementujący zmieniany port insertFromGroup nie wszedł do zakresu). Obejście: override zakresu domain, zastosowane w przebiegu.
trigger: blocked_by_prior
category: plan
sources:
  - orchestrate
rule_ref: ORC-082
first_seen: 2026-10-18
last_seen: 2026-10-18
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-orc-082-domain

## Occurrences

- 2026-10-18 juz-ide-api-2 (TS-SEC-MAP-GROUP-PIN-001) run `wf_db145b3f-cb3` warstwa `domain` — machine: błąd TS poza layers_scope (aggregate), ORC-082 nie odroczył
