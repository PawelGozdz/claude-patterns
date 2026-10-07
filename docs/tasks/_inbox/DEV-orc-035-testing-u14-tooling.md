---
id: DEV-orc-035-testing-u14-tooling
status: promoted
resolution: >
  Naprawione jako ORC-096 (2026-10-03): git add -N z niedopasowanym wzorcem przerywał w całości i nowy plik testu nie był liczony; teraz ls-files -o | xargs git add -N.
trigger: agent_note
rule_ref: ORC-035
first_seen: 2026-10-03
last_seen: 2026-10-03
occurrences: 1
projects:
  - ai-os-bot
---

# DEV-orc-035-testing-u14-tooling

## Occurrences

- 2026-10-03 ai-os-bot (BOT-024) run `wf_1e4dd9ec-4c9` warstwa `testing:u14-tooling` — Sonda ORC-035 dała zero przyrostu bloków wykonywalnych dla u14, choć warstwa dodała nieśledzony scripts/tooling.test.ts (19 testów, zielone, vitest include rozszerzony o scripts/**). Podejrzenie: sonda nie liczy nowych (untracked) plików testowych. Halt cause=code mógł być fałszywym alarmem.
