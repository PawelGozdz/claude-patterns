---
id: DEV-orc-149-testing-w2-tests
status: proposed
trigger: agent_note
category: config
sources:
  - orchestrate
rule_ref: ORC-149
first_seen: 2026-11-13
last_seen: 2026-11-13
occurrences: 1
projects:
  - juz-ide-api-8
---

# DEV-orc-149-testing-w2-tests

## Occurrences

- 2026-11-13 juz-ide-api-8 (TS-TOOLING-HANDLER-NO-THROW-001) run `wf_51b24f20-c0b` warstwa `testing:w2-tests` — hook block-unscoped-tests blokuje 'pnpm test <pliki>' mimo allowUnit:true w .claude/test-guard.json (dopuszcza tylko test:e2e/integration/l2/l3); implementer nie mogl uruchomic L1, weryfikacje przejela sonda silnika
