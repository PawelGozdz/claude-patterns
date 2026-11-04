---
id: DEV-orc-116-testing-gates-guard
status: proposed
trigger: agent_note
category: infra
sources:
  - orchestrate
rule_ref: ORC-116
first_seen: 2026-11-03
last_seen: 2026-11-03
occurrences: 1
projects:
  - ai-gateway
---

# DEV-orc-116-testing-gates-guard

## Occurrences

- 2026-11-03 ai-gateway (TS-AIG-095) run `wf_c3b32ff7-3b3` warstwa `testing:gates-guard` — Sonda testów ślepa: scoped-tests pomija nowy plik jednostkowy architecture.gates.test.ts (polityka allowUnit:false), więc bramki nie dowiodły zielonego wyniku testu straży.
