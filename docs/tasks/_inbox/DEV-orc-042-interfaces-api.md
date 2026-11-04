---
id: DEV-orc-042-interfaces-api
status: proposed
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: ORC-042
first_seen: 2026-11-03
last_seen: 2026-11-03
occurrences: 1
projects:
  - pcu
---

# DEV-orc-042-interfaces-api

## Occurrences

- 2026-11-03 pcu (TASK-062) warstwa `interfaces:api` — interfaces:api: implementer nie wie, czy trasy w episodes.py (list/create/update/delete) mają require_api_key; sprawdzone: mają (episodes.py:94,122,154,165), ale prompt nie dał mu tego faktu, a poprawka wycieku w parse-script wymaga zmian w persistence.py i script_persistence.py, czyli w katalogach innych warstw (runda naprawcza ORC-103 bez zmian w drzewie)
