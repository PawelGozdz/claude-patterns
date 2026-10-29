---
id: DEV-orc-062-testing-test-cc
status: dismissed
dismissed_reason: >
  Czerwień spoza taska (geo guardiany po merge innego taska, jsend/zod) to stan drzewa, nie
  błąd silnika: ORC-062 celowo staje na czerwonej sondzie bez zmian implementera.
  Nieodtwarzalne 2026-10-29 w bliźniaku juz-ide-api-4: src/shared/geo 15 plików, 225 testów
  zielone. Obejście (--overrides checks) było poprawną decyzją człowieka.
trigger: blocked_by_prior
category: infra
sources:
  - orchestrate
rule_ref: ORC-062
first_seen: 2026-10-28
last_seen: 2026-10-28
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-orc-062-testing-test-cc

## Occurrences

- 2026-10-28 juz-ide-api-2 (TS-GROUPS-REACTION-COUNTS-001) run `wf_280402c1-da4` warstwa `testing:test-cc` — test-cc: sonda pełnego vitest czerwona na 3 plikach spoza taska (geo guardiany po merge innego taska, jsend/zod); zatrzymanie wymagało --overrides checks warstw testowych i finalGate
