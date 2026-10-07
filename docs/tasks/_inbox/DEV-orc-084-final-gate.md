---
id: DEV-orc-084-final-gate
status: promoted
resolution: >
  Pokryte ORC-098 (2026-10-04): przy skonfigurowanych final_gate.checks, zerze naruszeń i zielonej sondzie silnika GO z unverified_scope kończy przebieg jako GO z lukami zamiast NO_GO.
trigger: no_go
rule_ref: ORC-084
first_seen: 2026-10-03
last_seen: 2026-10-03
occurrences: 1
projects:
  - grant-flow
---

# DEV-orc-084-final-gate

## Occurrences

- 2026-10-03 grant-flow (TS-TIME-READALL-001) run `wf_3cf56434-6ca` warstwa `final-gate` — Bramka końcowa NO_GO wymuszone wyłącznie przez unverified_scope (pełny L1/L3, dep:validate), zero własnych naruszeń; wcześniej NO_GO z kodu (entryDate string) naprawione.
