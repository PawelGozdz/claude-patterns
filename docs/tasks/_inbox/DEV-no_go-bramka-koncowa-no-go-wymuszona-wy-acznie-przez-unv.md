---
id: DEV-no_go-bramka-koncowa-no-go-wymuszona-wy-acznie-przez-unv
status: promoted
resolution: >
  Manifesty zależności (package.json/lockfile) wchodzą do zakresu warstwy, gdy analiza wymaga zależności — ORC-087 (2026-10-01). Sam NO_GO z unverified_scope przeszedł przez stageForReview (ORC-084).
trigger: no_go
rule_ref: null
first_seen: 2026-10-01
last_seen: 2026-10-01
occurrences: 1
projects:
  - ai-gateway
---

# DEV-no_go-bramka-koncowa-no-go-wymuszona-wy-acznie-przez-unv

## Occurrences

- 2026-10-01 ai-gateway (TS-AIG-013) run `wf_fee8a5db-245` — Bramka końcowa NO_GO wymuszona wyłącznie przez unverified_scope (zero własnych naruszeń, sonda zielona); wcześniejszy przebieg stanął na BLOCKED_BY_PRIOR: zakres warstwy implementation (src/) nie obejmuje package.json/pnpm-lock.yaml, więc zatwierdzona zależność prom-client nie mogła zostać dodana
