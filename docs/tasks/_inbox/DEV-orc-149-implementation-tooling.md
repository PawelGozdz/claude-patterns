---
id: DEV-orc-149-implementation-tooling
status: proposed
trigger: agent_note
category: infra
sources:
  - orchestrate
rule_ref: ORC-149
first_seen: 2026-11-03
last_seen: 2026-11-03
occurrences: 1
projects:
  - ai-gateway
---

# DEV-orc-149-implementation-tooling

## Occurrences

- 2026-11-03 ai-gateway (TS-AIG-095) run `wf_c3b32ff7-3b3` warstwa `implementation:tooling` — Hook block-unscoped-tests blokuje agentowi pnpm test:coverage, a jednostka tooling wymaga pomiaru (D5) jako warunku zmiany check; przebieg bez człowieka nie może jej domknąć.
