---
id: DEV-agent_note-threat-model-dubluje-sie-przy-nextjs-z-node
status: dismissed
dismissed_reason: >
  Zachowanie zaprojektowane, nie błąd: etapy z różnych bloków o tym samym output i
  skip_if_exists są dozwolone (kolizja tylko non-blocking), więc drugi etap nie kosztuje.
  Zostaje potencjalny szum ANZ-STAGE-SKIPPED w inboxie (commands/analyze.md, krok 4) —
  opcje opisane w docs/tasks/TASK-PANEL-NODE-ADVISOR-001.md, czekają na decyzję.
trigger: agent_note
rule_ref: null
first_seen: 2026-10-13
last_seen: 2026-10-13
occurrences: 1
projects:
  - framework-polityczny
---

# DEV-agent_note-threat-model-dubluje-sie-przy-nextjs-z-node

## Occurrences

- 2026-10-13 framework-polityczny (setup claude-patterns, przegląd `.claude/`) — kompozycja `[nextjs, node, ...]` daje w runtime.yml dwa etapy `threat-model` (jeden z `nextjs` z `\b`, drugi z `node` z szerszym `when`) — materializacja ich nie scala; wycięte lokalnie przez `./fp-node` (`drop: true`)
