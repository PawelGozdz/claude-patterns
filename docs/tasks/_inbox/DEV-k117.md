---
id: DEV-k117
status: proposed
trigger: agent_note
category: config
sources:
  - orchestrate
rule_ref: K117
first_seen: 2026-11-07
last_seen: 2026-11-07
occurrences: 1
projects:
  - claude-patterns
---

# DEV-k117

## Occurrences

- 2026-11-07 claude-patterns (TASK-KAIZEN-002) — Sync vendorowanych skilli marketingu stoi od 2026-05-07 (plugin 1.9.0, upstream 2.11.1). Upstream przemianował 20 z 42 skilli (katalog i `name:`), a `product-marketing-context` stał się `product-marketing` z innym plikiem wyjściowym (`.agents/product-marketing.md`). Mapa przemianowań leży w `skills/marketing/UPSTREAM_VERSION` (blok „sync blocked, 2026-09-07"), stan niezmieniony na develop 2026-11-07. Sync trzeba zastosować razem z przepięciem `agents/universal/marketing-strategist.md`, `commands/marketing.md`, `skills/marketing/README.md`, `patterns/marketing/` i `templates/product-marketing-context.md`, bo sam `sync-marketing-skills.sh` skasowałby 20 katalogów i zostawił wiszące referencje. Przy nazwach skilli obowiązuje zasada deprecation notice z CLAUDE.md.
