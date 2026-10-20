---
id: DEV-orc-082-infrastructure-discovery-infra
status: promoted
resolution: >
  Naprawione 2026-10-18 jako ORC-108: przy remisie rangi segmentu (infrastructure/ i __tests__/ w infrastructure/**/__tests__/) wygrywa warstwa z tests: true, więc czerwony typecheck w starych specach jest odraczany do testing zamiast blokować infra. Eval: owner-test-layer-wins-segment-tie-for-nested-tests-dir.
trigger: blocked_by_prior
category: other
sources:
  - orchestrate
rule_ref: ORC-082
first_seen: 2026-10-18
last_seen: 2026-10-18
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-orc-082-infrastructure-discovery-infra

## Occurrences

- 2026-10-18 juz-ide-api-2 (TS-SEC-MAP-GROUP-PIN-001) run `wf_db145b3f-cb3` warstwa `infrastructure:discovery-infra` — machine: stare specy w __tests__ przypisane do infra wg specyficzności, rola zabrania ich ruszać; BLOCKED_BY_PRIOR
