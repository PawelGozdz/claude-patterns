---
id: DEV-orc-plan-web-dict
status: promoted
resolution: >
  ANL-046 (2026-10-28): /analyze wpisuje rejestry kodów błędów, zdarzeń i komunikatów
  (error-codes.ts, event-names.enum.ts, eventMap, mapper błędów, słownik apps/web) do dirs
  jednostki albo jednostki wiringu. Rozszerzenie ANL-045, reguła tylko w prompcie
  (docs/decisions/orchestrate-rule-history.md#anl-046).
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: ORC-PLAN-WEB-DICT
first_seen: 2026-10-24
last_seen: 2026-10-24
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-plan-web-dict

## Occurrences

- 2026-10-24 marketing-hub (TS-MH-028) — D10 pomija warstwę web, ale nowy kod błędu CAMPAIGN_* wymaga wpisu w słowniku komunikatów apps/web (strażnik error-messages.spec.ts czyta error-codes.ts z api); żadna jednostka nie miała tego pliku w dirs, web L1 czerwony w bramce końcowej
