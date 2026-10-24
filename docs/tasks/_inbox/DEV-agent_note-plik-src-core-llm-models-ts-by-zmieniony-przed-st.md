---
id: DEV-agent_note-plik-src-core-llm-models-ts-by-zmieniony-przed-st
status: dismissed
dismissed_reason: >
  Silnik zadziałał poprawnie: plik brudny przed startem i spoza zakresu taska nie trafił do
  stage a (ORC-042/090/124). Reszta to sprawa projektu ai-os-bot: zmiana DEFAULT_MODEL wymaga
  osobnej karty z wpisem w cenniku costTracker.
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-24
last_seen: 2026-10-24
occurrences: 1
projects:
  - ai-os-bot
---

# DEV-agent_note-plik-src-core-llm-models-ts-by-zmieniony-przed-st

## Occurrences

- 2026-10-24 ai-os-bot (BOT-040) run `wf_3d2c554f-dd5` — Plik src/core/llm/models.ts był zmieniony przed startem przebiegu (DEFAULT_MODEL na claude-haiku-5-5) i nie należy do taska; nowego modelu nie ma w cenniku costTracker, więc koszt liczy się cennikiem zapasowym. Plik nie trafił do stage'a; zmiana modelu wymaga osobnej karty z wpisem w cenniku.
