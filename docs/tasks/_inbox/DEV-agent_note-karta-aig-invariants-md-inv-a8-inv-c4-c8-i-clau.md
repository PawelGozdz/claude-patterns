---
id: DEV-agent_note-karta-aig-invariants-md-inv-a8-inv-c4-c8-i-clau
status: dismissed
dismissed_reason: >
  Karta projektowa ai-gateway (3.2): aig-invariants.md (INV-A8, INV-C4/C8) i CLAUDE.md nie
  opisują jeszcze modułu src/alarm/. Aktualizacja razem z TS-AIG-104 w repo ai-gateway, razem
  z regułą alarm w architecture.test.ts.
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-28
last_seen: 2026-10-28
occurrences: 1
projects:
  - ai-gateway
---

# DEV-agent_note-karta-aig-invariants-md-inv-a8-inv-c4-c8-i-clau

## Occurrences

- 2026-10-28 ai-gateway (TS-AIG-104) run `wf_451d6c4c-9a7` warstwa `implementation:alarm-module` — Karta aig-invariants.md (INV-A8, INV-C4/C8) i CLAUDE.md nie znają modułu src/alarm/ ani webhook-notifier.ts w REVEAL_ALLOWLIST; kod odwołuje się do reguły alarm w architecture.test.ts, której jeszcze nie ma
