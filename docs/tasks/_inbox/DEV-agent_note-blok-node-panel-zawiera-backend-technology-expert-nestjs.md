---
id: DEV-agent_note-blok-node-panel-zawiera-backend-technology-expert-nestjs
status: promoted
resolution: >
  Naprawione w docs/tasks/TASK-PANEL-NODE-ADVISOR-001.md (2026-10-17): agent
  backend-technology-expert przepisany na stack-aware (czyta runtime.yml, CLAUDE.md, ADR),
  bez wbudowanych założeń o NestJS/BullMQ/Redis. Lokalny drop w ./fp-node jest już zbędny.
trigger: agent_note
rule_ref: null
first_seen: 2026-10-13
last_seen: 2026-10-13
occurrences: 1
projects:
  - framework-polityczny
---

# DEV-agent_note-blok-node-panel-zawiera-backend-technology-expert-nestjs

## Occurrences

- 2026-10-13 framework-polityczny (setup claude-patterns, przegląd `.claude/`) — blok `node` (czysty Node/TS, bez NestJS) wnosi do panelu /analyze agenta `backend-technology-expert`, opisanego pod NestJS, BullMQ i Redis — rady mogą być niezgodne ze stackiem (u nas pg-boss + Kysely); wycięte lokalnie przez `./fp-node` (`extends: node`, `drop: true`)
