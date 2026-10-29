---
id: DEV-orc-042-api-execute-route
status: dismissed
dismissed_reason: >
  Zgodne z regułą: wspólny rdzeń, strażnik AST i testy leżą w dirs innych jednostek TS-008
  (engine/, tests/), więc warstwa app/ słusznie je pominęła (ORC-042).
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: ORC-042
first_seen: 2026-10-28
last_seen: 2026-10-28
occurrences: 1
projects:
  - aegis-flow
---

# DEV-orc-042-api-execute-route

## Occurrences

- 2026-10-28 aegis-flow (TS-008) run `wf_bd4d9051-6b0` warstwa `api:execute-route` — Wspólny rdzeń zakazanych kluczy (D3, engine/), strażnik AST (D10), przepisanie testów (D15) i EXECUTE_REJECTED w klasie dostawy leżą poza app/; pominięte w tej warstwie.
