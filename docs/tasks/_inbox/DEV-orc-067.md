---
id: DEV-orc-067
status: promoted
resolution: >
  Krok 4 (ORC-067: git add, potem git status) zadziałał tak, jak zaprojektowano i naprawił
  rozbieżność; silnik sam niczego nie stage'uje, a nowe pliki były tylko git add -N z sond
  (ORC-096). Zduplikowane ścieżki bezwzględne usunięte w ORC-125 (finalFileList).
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: ORC-067
first_seen: 2026-10-23
last_seen: 2026-10-23
occurrences: 1
projects:
  - ai-os-bot
---

# DEV-orc-067

## Occurrences

- 2026-10-23 ai-os-bot (BOT-041) run `wf_88100bcf-827` — Raport silnika: 'staged, not committed — 63 plików', a git diff --cached po przebiegu = 0 plików (nowe pliki tylko jako git add -N); lista 'staged' zawiera też zdublowane ścieżki bezwzględne. Krok 4 (git add + git status) musiał naprawić stan ręcznie.
