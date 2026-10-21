---
id: DEV-agent_note-claude-local-md-w-claude-config-a-layers-scope-po
status: promoted
resolution: >
  orchestrate-prepare ostrzega teraz, gdy `dirs` jednostki albo `layers_scope` zawiera samą nazwę pliku, której nie ma w korzeniu repo (CLAUDE-LOCAL.md leży w .claude/config/); ANL-038 przypomina, że `dirs` to ścieżki od korzenia. Druga część notatki (INV-A5 a odmowa ANTHROPIC_API_KEY w dev/test) to karta projektu ai-gateway, w analizie TS-AIG-102 rozstrzygnięta w D9.
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

# DEV-agent_note-claude-local-md-w-claude-config-a-layers-scope-po

## Occurrences

- 2026-10-21 ai-gateway (TS-AIG-102) run `wf_459d7f82-1a7` warstwa `implementation:docs-annex` — CLAUDE-LOCAL.md w .claude/config a layers_scope podaje sama nazwe; karta INV-A5 nie rozstrzyga odmowy ANTHROPIC_API_KEY w dev/test
