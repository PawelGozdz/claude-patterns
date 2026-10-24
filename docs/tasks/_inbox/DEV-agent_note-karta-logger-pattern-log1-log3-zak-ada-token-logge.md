---
id: DEV-agent_note-karta-logger-pattern-log1-log3-zak-ada-token-logge
status: promoted
resolution: >
  Przeniesione do TASK-ORCH-CARDS-STACK-MISMATCH-001 (logger-pattern zakłada token
  LOGGER_SERVICE, którego marketing-hub nie ma).
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-12
last_seen: 2026-10-12
occurrences: 1
projects:
  - marketing-hub
---

# DEV-agent_note-karta-logger-pattern-log1-log3-zak-ada-token-logge

## Occurrences

- 2026-10-12 marketing-hub (TS-MH-019) run `wf_a48df385-38b` warstwa `infrastructure:scope-guard` — Karta logger-pattern LOG1-LOG3 zakłada token LOGGER_SERVICE, którego marketing-hub nie ma (repo loguje przez nestjs-pino Logger)
