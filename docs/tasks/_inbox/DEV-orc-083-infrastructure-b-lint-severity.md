---
id: DEV-orc-083-infrastructure-b-lint-severity
status: proposed
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: ORC-083
first_seen: 2026-11-14
last_seen: 2026-11-14
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-orc-083-infrastructure-b-lint-severity

## Occurrences

- 2026-11-14 juz-ide-api-2 (TS-TOOLING-NO-THROW-ACL-ADAPTERS-001) run `wf_52e57e25-06b` warstwa `infrastructure:B-lint-severity` — Analiza (D6/D10) zakładała, że znacznik LINT-EXCEPTION wycisza juz/acl-no-throw, ale reguła w tools/lint-ddd/rules/infrastructure.mjs nie miała withExceptions; poprawka wymagała pliku spoza layers_scope jednostki. Naprawione w przebiegu.
