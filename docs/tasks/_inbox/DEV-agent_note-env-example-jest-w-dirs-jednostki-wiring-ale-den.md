---
id: DEV-agent_note-env-example-jest-w-dirs-jednostki-wiring-ale-den
status: promoted
resolution: >
  ORC-138 (2026-10-28): ANL-038 nie każe już wpisywać .env.example do dirs, a
  orchestrate-prepare ostrzega o każdym wpisie .env* w dirs jednostki lub layers_scope
  (docs/decisions/orchestrate-rule-history.md#orc-138).
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-28
last_seen: 2026-10-28
occurrences: 1
projects:
  - ai-gateway
---

# DEV-agent_note-env-example-jest-w-dirs-jednostki-wiring-ale-den

## Occurrences

- 2026-10-28 ai-gateway (TS-AIG-104) run `wf_451d6c4c-9a7` warstwa `implementation:wiring` — .env.example jest w dirs jednostki wiring, ale deny rule na .env* blokuje agentom odczyt i zapis; 3 próby kończą NO_GO z tego samego powodu (cause=code wg silnika, realnie konflikt zakresu z uprawnieniami)
