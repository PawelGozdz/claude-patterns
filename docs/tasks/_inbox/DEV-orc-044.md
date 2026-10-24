---
id: DEV-orc-044
status: proposed
resolution: >
  Znana, otwarta decyzja konfiguracji ai-os-bot: blok bot-panel dokłada do patterns.always
  karty ze stacku NestJS-DDD (conventions, security-invariants, safe-error-propagation,
  testing-pyramid), a bot-invariants.md (21 KB) nie ma karty skróconej. Wymaga decyzji
  właściciela, które karty zostają i kto streszcza bot-invariants.md; tagi api:* nie
  odfiltrują ich (ORC-122), bo warstwy ai-os-bot nie mają tagów.
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: ORC-044
first_seen: 2026-10-23
last_seen: 2026-10-23
occurrences: 1
projects:
  - ai-os-bot
---

# DEV-orc-044

## Occurrences

- 2026-10-23 ai-os-bot (BOT-041) run `wf_88100bcf-827` — Karty wzorców conventions, security-invariants, safe-error-propagation, logger-pattern-plain i testing-pyramid pochodzą ze stacku NestJS-DDD, nie node-ts-claude-api; weryfikatorzy 3 z 4 warstw zgłosili w deviation_note, że nie mogli ich zastosować. Dodatkowo bot-invariants.md nie ma karty skróconej (do promptu poszło 18 KB).
