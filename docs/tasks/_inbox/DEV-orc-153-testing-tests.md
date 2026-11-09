---
id: DEV-orc-153-testing-tests
status: proposed
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: ORC-153
first_seen: 2026-11-08
last_seen: 2026-11-08
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-153-testing-tests

## Occurrences

- 2026-11-08 juz-ide-api-1 (TS-AUTH-DEACTIVATION-MAIL-OUTBOX-001) warstwa `testing:tests` — Brak testu L2 (rollback komendy = brak wiadomosci w outboxie) i brak testu erasure 'nieodebrany wiersz bez adresu' (TM par.6 pkt 2): plik *.integration.spec.ts poza units analizy; analiza oznaczala L2 jako opcjonalny.
