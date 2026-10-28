---
id: DEV-agent_note-eventmap-rp6-rp9-i-wpis-mappera-de3-dla-taskupda
status: promoted
resolution: >
  ANL-046 (2026-10-28): /analyze wpisuje rejestry kodów błędów, zdarzeń i komunikatów
  (error-codes.ts, event-names.enum.ts, eventMap, mapper błędów, słownik apps/web) do dirs
  jednostki albo jednostki wiringu. Rozszerzenie ANL-045, reguła tylko w prompcie
  (docs/decisions/orchestrate-rule-history.md#anl-046).
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-25
last_seen: 2026-10-25
occurrences: 1
projects:
  - grant-flow
---

# DEV-agent_note-eventmap-rp6-rp9-i-wpis-mappera-de3-dla-taskupda

## Occurrences

- 2026-10-25 grant-flow (TS-UI-010) run `wf_c352741c-b42` warstwa `domain` — eventMap (RP6/RP9) i wpis mappera DE3 dla TaskUpdatedEvent leżą poza warstwą domain; implementer domeny zgłosił je jako zakres infrastructure.
