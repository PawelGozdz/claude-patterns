---
id: DEV-k116
status: proposed
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: K116
first_seen: 2026-11-07
last_seen: 2026-11-07
occurrences: 1
projects:
  - claude-patterns
---

# DEV-k116

## Occurrences

- 2026-11-07 claude-patterns (TASK-KAIZEN-002) — Żaden wzorzec nie opisuje izolacji bazy w testach. `patterns/testing/` ma wzorzec dla Redisa (`redis-test-isolation-pattern.md`), ale nie dla bazy; `e2e-hybrid-fixture-pattern.md` (linie 61 i 378) wymienia `DatabaseCleaner` bez wskazania, gdzie go opisano, a po usunięciu `context-isolation-pattern.md` (K89) odsyłacz z `golevelup-mock-pattern.md` został bez celu. Do zrobienia: `testing/database-isolation-pattern.md` napisany z realnego kodu juz-ide-api (przez `/add-pattern`, z kartą, README, METADATA i reseedem; `Scope: project-specific`, dopóki nie przyjmie go drugi projekt), podlinkowany z obu wzorców. Przy okazji w `architecture/bullmq-queue-pattern.md` numeracja MUST DO powtarza 15-20 (linie 330-335, pierwsze użycie 15-17 na liniach 280-288); zmiana wzorca wymaga reseedu i odświeżenia karty.
