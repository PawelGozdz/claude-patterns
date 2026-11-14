---
id: DEV-orc-066-infrastructure-lint-rule-scope
status: proposed
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: ORC-066
first_seen: 2026-11-14
last_seen: 2026-11-14
occurrences: 1
projects:
  - juz-ide-api-8
---

# DEV-orc-066-infrastructure-lint-rule-scope

## Occurrences

- 2026-11-14 juz-ide-api-8 (TS-TOOLING-RULE-SCOPE-DECISIONS-001) run `wf_ca2529c1-886` warstwa `infrastructure:lint-rule-scope` — Karta repository-pattern i rules/nestjs-ddd/repository.md:3 zawężają RP12/N7 do cron/scheduler/job i application/services, a N7 (repository.md:24) mówi o każdej klasie poza infrastructure/repositories|persistence; karta niespójna sama ze sobą, zadanie przyjęło szerszy zakres N7 (D1).
