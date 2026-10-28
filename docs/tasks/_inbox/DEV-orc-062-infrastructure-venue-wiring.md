---
id: DEV-orc-062-infrastructure-venue-wiring
status: promoted
resolution: >
  ANL-046 (2026-10-28): /analyze wpisuje rejestry kodów błędów, zdarzeń i komunikatów
  (error-codes.ts, event-names.enum.ts, eventMap, mapper błędów, słownik apps/web) do dirs
  jednostki albo jednostki wiringu. Rozszerzenie ANL-045, reguła tylko w prompcie
  (docs/decisions/orchestrate-rule-history.md#anl-046).
trigger: blocked_by_prior
category: plan
sources:
  - orchestrate
rule_ref: ORC-062
first_seen: 2026-10-28
last_seen: 2026-10-28
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-orc-062-infrastructure-venue-wiring

## Occurrences

- 2026-10-28 juz-ide-api-2 (TS-EVENT-VENUE-001) run `wf_0c90f72c-4d2` warstwa `infrastructure:venue-wiring` — venue-wiring: typed allocation error needs new LocalHeroErrorCode member in src/shared/domain/errors/error-codes.ts, which no unit's dirs cover (layers_scope empty)
