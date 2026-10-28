---
id: DEV-orc-128-domain-consent-domain
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
rule_ref: ORC-128
first_seen: 2026-10-25
last_seen: 2026-10-25
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-128-domain-consent-domain

## Occurrences

- 2026-10-25 juz-ide-api-1 (TS-SEC-SP-PIN-CONSENT-001) run `wf_54f43d33-66c` warstwa `domain:consent-domain` — Kody błędów i nazwy zdarzeń (error-codes.ts, event-names.enum.ts) nie należały do żadnej jednostki analizy; BLOCKED_BY_PRIOR z czerwonego typecheck
