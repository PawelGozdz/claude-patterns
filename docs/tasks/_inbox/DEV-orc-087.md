---
id: DEV-orc-087
status: promoted
resolution: >
  Naprawione jako ORC-094 (2026-10-03): hook block-subagent-commit (mechaniczny zakaz commitów subagentów przy świeżym orchestrating.json) + ostrzeżenie w raporcie, gdy sonda drzewa nie zwróci licznika commitów.
trigger: agent_note
rule_ref: ORC-087
first_seen: 2026-10-03
last_seen: 2026-10-03
occurrences: 1
projects:
  - ai-os-bot
---

# DEV-orc-087

## Occurrences

- 2026-10-03 ai-os-bot (BOT-024) run `wf_735cec47-7aa` — Mimo ZAKAZ COMMITOWANIA agenci (implementerzy/sondy, w tym haiku) zrobili 40 commitów (525d611..HEAD) zamiast staged-not-committed; report.warnings nie zawierał ostrzeżenia o commitach. Znacznik orchestrating.json został też nadpisany w trakcie przebiegu (session_id zmieniony).
