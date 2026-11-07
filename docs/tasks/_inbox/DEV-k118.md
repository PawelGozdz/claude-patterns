---
id: DEV-k118
status: proposed
trigger: agent_note
category: config
sources:
  - orchestrate
rule_ref: K118
first_seen: 2026-11-07
last_seen: 2026-11-07
occurrences: 1
projects:
  - claude-patterns
---

# DEV-k118

## Occurrences

- 2026-11-07 claude-patterns (TASK-KAIZEN-002) — Cztery skille-kopie z ECC mają żywych konsumentów i nie mają decyzji: `database/postgres-patterns`, `database/database-migrations`, `infrastructure/docker-patterns`, `infrastructure/deployment-patterns` (frontmatter `origin: ECC`, brak `UPSTREAM_VERSION`; sprawdzone 2026-11-07). Są linkowane po kategoriach z `project.yml` w 3-8 satelitach, a ADR 0009 nie obejmuje skilli. Do rozstrzygnięcia przez właściciela: retire z przepięciem kategorii na `ecc:*` w `project.yml` satelitów, albo jawny fork z `UPSTREAM_VERSION` i skryptem synchronizacji jak `rules/common` (K87, `scripts/sync-ecc-rules.sh`). Każdy z wariantów dotyka repozytoriów satelitów albo skryptów synchronizacji, więc to osobne zadanie.
