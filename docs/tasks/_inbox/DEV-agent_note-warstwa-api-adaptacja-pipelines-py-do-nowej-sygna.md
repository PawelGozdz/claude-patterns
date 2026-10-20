---
id: DEV-agent_note-warstwa-api-adaptacja-pipelines-py-do-nowej-sygna
status: dismissed
dismissed_reason: >
  Ustalenie dotyczy kodu aegis-flow (TS-019): pipelines.py odmontowany zamiast adaptowany (guardrail i Principal poza korzeniem kompozycji, D7/D8), a inline POST /execute w app/main.py nadal zwraca 200 queued. To decyzja projektu do zadania HTTP, zapisana w TS-019.report.md; nie wada wzorców ani silnika.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-18
last_seen: 2026-10-18
occurrences: 1
projects:
  - aegis-flow
---

# DEV-agent_note-warstwa-api-adaptacja-pipelines-py-do-nowej-sygna

## Occurrences

- 2026-10-18 aegis-flow (TS-019) run `wf_3a5c22ec-f69` warstwa `api` — Warstwa api: adaptacja pipelines.py do nowej sygnatury wymagałaby guardraila i Principal poza korzeniem kompozycji (D7, D8), więc router odmontowany; inline /execute w app/main.py nadal zwraca 200 queued.
