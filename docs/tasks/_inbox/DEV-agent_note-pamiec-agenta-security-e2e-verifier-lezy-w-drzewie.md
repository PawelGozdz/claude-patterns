---
id: DEV-agent_note-pamiec-agenta-security-e2e-verifier-lezy-w-drzewie
status: promoted
resolution: >
  ORC-139, uzupełnienie (2026-10-29): hash drzewa pomija .claude/agent-memory, więc zapis
  pamięci weryfikatora w trakcie bramki końcowej nie unieważnia GO (orchestrate.template.mjs,
  TREE_HASH_EXCLUDES; eval tree-hash-binding).
trigger: agent_note
category: config
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-28
last_seen: 2026-10-28
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-agent_note-pamiec-agenta-security-e2e-verifier-lezy-w-drzewie

## Occurrences

- 2026-10-28 juz-ide-api-2 (TS-GROUPS-REACTION-COUNTS-001) run `wf_280402c1-da4` warstwa `final-gate` — Pamięć agenta security-e2e-verifier leży w drzewie repo (.claude/agent-memory/), zapis w trakcie bramki końcowej unieważnił werdykt (ORC-139) i wymusił powtórkę bramki
