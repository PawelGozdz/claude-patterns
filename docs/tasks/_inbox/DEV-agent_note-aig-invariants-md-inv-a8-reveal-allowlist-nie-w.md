---
id: DEV-agent_note-aig-invariants-md-inv-a8-reveal-allowlist-nie-w
status: dismissed
dismissed_reason: >
  Karta projektowa ai-gateway (3.2): aig-invariants.md jest lokalna i nie zna jeszcze
  webhook-notifier.ts w REVEAL_ALLOWLIST. Aktualizacja razem z TS-AIG-104 w repo ai-gateway.
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-28
last_seen: 2026-10-28
occurrences: 1
projects:
  - ai-gateway
---

# DEV-agent_note-aig-invariants-md-inv-a8-reveal-allowlist-nie-w

## Occurrences

- 2026-10-28 ai-gateway (TS-AIG-104) run `wf_451d6c4c-9a7` warstwa `implementation:core-port` — aig-invariants.md (INV-A8, REVEAL_ALLOWLIST) nie wymienia przyszłego alarm/webhook-notifier.ts jako miejsca .reveal() adresu kanału alarmów; karta do aktualizacji razem z TS-AIG-104
