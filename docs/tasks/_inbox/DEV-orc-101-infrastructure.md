---
id: DEV-orc-101-infrastructure
status: dismissed
dismissed_reason: >
  Nieścisłość w brzmieniu decyzji D13(2) projektu juz-ide-api-1 (map_markers bez is_active,
  migracja 337 robi DELETE); tekst decyzji wyrównano ręcznie po przebiegu. Nie błąd silnika.
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: ORC-101
first_seen: 2026-10-25
last_seen: 2026-10-25
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-101-infrastructure

## Occurrences

- 2026-10-25 juz-ide-api-1 (TS-SEC-SP-LOCATION-001) run `wf_227011ec-5e9` warstwa `infrastructure` — D13(2) mowi o 'dezaktywacji' wierszy map_markers OFFERING i activity_feed_items, ale map_markers nie ma kolumny is_active; migracja 337 robi DELETE. Tekst decyzji wyrownany recznie po przebiegu.
