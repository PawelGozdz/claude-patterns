---
id: DEV-orc-042-testing-tests-api-db
status: proposed
dismissed_reason: >
  Zgodnie z ORC-042: test replace_episode_scenes leży w zakresie warstwy
  API-testów, a weryfikator zasugerował lokalizację poza zawężeniem
  (tests/test_db/ nie istnieje). Implementer słusznie pominął pozycję; sugestia
  weryfikatora była błędna, nie silnik. 2026-11-03.
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: ORC-042
first_seen: 2026-11-02
last_seen: 2026-11-03
occurrences: 2
projects:
  - pcu
reopened_at: 2026-11-03
reopened_from_status: dismissed
---

# DEV-orc-042-testing-tests-api-db

## Occurrences

- 2026-11-03 pcu (TASK-062) warstwa `testing:tests-api-db` — testing:tests-api-db: strażnik SEP7 dopuszcza cztery pliki legacy z wyciekiem str(exc) (actors, character_gen, ingest, visual); poprawki poza zakresem TASK-062, wymagają osobnego zadania
- 2026-11-02 pcu (TASK-062) warstwa `testing:tests-api-db` — testing:tests-api-db: implementer pominął pozycję, bo test replace_episode_scenes (tests/test_api/test_script_persistence.py) leży w zakresie warstwy API-testów, a weryfikator sugerował lokalizację poza zawężeniem warstwy (tests/test_db/ nie istnieje)
