---
id: DEV-agent_note-karty-regu-z-patterns-always-conventions-pattern
status: promoted
resolution: >
  Zebrane w TASK-ORCH-CARDS-STACK-MISMATCH-001 (2026-10-18): karty reguł DDD/NestJS z patterns.always trafiają do projektów o innym stosie; zadanie ma hipotezy (patterns.remove w bloku potomnym, podział kart, layers_skip, _summary) i kryteria ukończenia. Ten rekord to ai-os-bot BOT-036 (conventions, security-invariants, safe-error-propagation, testing-pyramid, zod-schema).
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-18
last_seen: 2026-10-18
occurrences: 1
projects:
  - ai-os-bot
---

# DEV-agent_note-karty-regu-z-patterns-always-conventions-pattern

## Occurrences

- 2026-10-18 ai-os-bot (BOT-036) run `wf_ad1ba10c-c01` warstwa `testing` — Karty reguł z patterns.always (conventions-pattern CV*, security-invariants SI*, safe-error-propagation SEP*, testing-pyramid, zod-schema-validation) pochodza z kontekstu NestJS-DDD/HTTP i nie maja zastosowania w ai-os-bot (node-ts-claude-api); weryfikatorzy warstwy testing i bramka koncowa zglosily deviation_note, nie mogac ich zweryfikowac. Rozwazyc zawezenie patterns.always w bloku ./bot-panel albo patterns_exclude na stale.
