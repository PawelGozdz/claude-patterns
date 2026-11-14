---
id: DEV-aclerror-no-d
status: proposed
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: ACLERROR-NO-D
first_seen: 2026-11-14
last_seen: 2026-11-14
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-aclerror-no-d

## Occurrences

- 2026-11-14 juz-ide-api-2 (TS-TOOLING-NO-THROW-ACL-ADAPTERS-001) — ACLError z biblioteki ddd-acl ma kod EXECUTION_ERROR bez prefiksu D_ i bez wpisu w mapperze, więc DomainErrorHandler.canHandle() go odrzuca i klient dostaje generyczny błąd. Karta acl-registry.md/error-mapper.md nie mówi, jak traktować błędy z executeCore (Result.fail(ACLError)).
