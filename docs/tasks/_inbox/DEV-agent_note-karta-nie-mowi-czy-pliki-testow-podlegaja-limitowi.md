---
id: DEV-agent_note-karta-nie-mowi-czy-pliki-testow-podlegaja-limitowi
status: dismissed
dismissed_reason: >
  Limit 200-400 linii pochodzi z CLAUDE.md ai-gateway (linia 104), a nie z karty wzorca; czy dotyczy plików testowych, rozstrzyga projekt. ALLOWED_LABEL_NAMES poza zawężonym zakresem to zamierzone działanie layers_scope/units (ANL-037/038).
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-21
last_seen: 2026-10-21
occurrences: 1
projects:
  - ai-gateway
---

# DEV-agent_note-karta-nie-mowi-czy-pliki-testow-podlegaja-limitowi

## Occurrences

- 2026-10-21 ai-gateway (TS-AIG-102) run `wf_459d7f82-1a7` warstwa `testing:core-adapter-tests` — karta nie mowi czy pliki testow podlegaja limitowi 200-400 linii; ALLOWED_LABEL_NAMES poza zawezonym zakresem
