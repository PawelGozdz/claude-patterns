---
id: DEV-no_go-finalgate-no-go-wymuszony-wy-acznie-przez-unverifi
status: promoted
resolution: >
  Pokryte ORC-098 (2026-10-04): przy skonfigurowanych final_gate.checks, zerze naruszeń i zielonej sondzie silnika GO z unverified_scope kończy przebieg jako GO z lukami zamiast NO_GO.
trigger: no_go
rule_ref: null
first_seen: 2026-10-01
last_seen: 2026-10-01
occurrences: 1
projects:
  - ai-gateway
---

# DEV-no_go-finalgate-no-go-wymuszony-wy-acznie-przez-unverifi

## Occurrences

- 2026-10-01 ai-gateway (TS-AIG-018) run `wf_9b5406a4-5b4` — finalGate NO_GO wymuszony wyłącznie przez unverified_scope (zero własnych naruszeń; wszystkie 4 bramki zielone, 280 testów): weryfikator bramki końcowej nie przeglądał diffów testów i nie sprawdził architecture.md §6; ORC-084 stageForReview
