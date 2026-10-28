---
id: DEV-orc-044-domain
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
rule_ref: ORC-044
first_seen: 2026-10-25
last_seen: 2026-10-25
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-044-domain

## Occurrences

- 2026-10-25 juz-ide-api-1 (TS-SEC-SP-LOCATION-001) run `wf_f2e28f55-899` warstwa `domain` — Zakres warstwy domain obejmuje error-codes.ts, ale regula DE3 wymaga wpisu w mapperze kontekstu (infrastruktura) w tym samym diffie. W warstwie domain wpisy dla D_SO_ADDRESS_CHOICE_REQUIRED i D_SO_ADDRESS_ANCHOR_UNVERIFIED nie mogly powstac, wiec DE3 zostal do zamkniecia w infrastrukturze.
