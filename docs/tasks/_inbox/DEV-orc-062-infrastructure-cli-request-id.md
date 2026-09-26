---
id: DEV-orc-062-infrastructure-cli-request-id
status: promoted
resolution: >
  BLOCKED_BY_PRIOR tu było poprawnym działaniem (ORC-062 złapało odziedziczoną czerwień,
  zatrzymało zamiast budować dalej). Prawdziwa przyczyna — GO na testing:l1-l2 mimo 11
  czerwonych testów — naprawiona jako ORC-069 (docs/decisions/orchestrate-rule-history.md
  #orc-069). Dodatkowo: sonda testing nie sprawdzała lintu (checks: ["test:api"] bez
  lint:check:api) — dodane 2026-09-26 w marketing-hub/.claude/blocks/layers-monorepo.yml.
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-09-26
last_seen: 2026-09-26
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-062-infrastructure-cli-request-id

## Occurrences

- 2026-09-26 marketing-hub (TS-MH-010) run `wf_4ae6812e-b6c` warstwa `infrastructure:cli-request-id` — Warstwa testing:l1-l2 dostała GO mimo 11 czerwonych testów i 4 błędów lint w swoich plikach (sonda l1-l2 bez lint:check:api; weryfikator unverified_scope) — czerwień spadła na kolejną jednostkę jako BLOCKED_BY_PRIOR.
