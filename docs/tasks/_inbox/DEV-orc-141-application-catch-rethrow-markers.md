---
id: DEV-orc-141-application-catch-rethrow-markers
status: proposed
trigger: no_go
category: other
sources:
  - orchestrate
rule_ref: ORC-141
first_seen: 2026-11-13
last_seen: 2026-11-13
occurrences: 1
projects:
  - juz-ide-api-8
---

# DEV-orc-141-application-catch-rethrow-markers

## Occurrences

- 2026-11-13 juz-ide-api-8 (TS-TOOLING-HANDLER-NO-THROW-001) run `wf_d461b9d9-d86` warstwa `application:catch-rethrow-markers` — reclassifyMinor/BEHAVIOR_NET zamienia GO weryfikatora na NO_GO, bo minor_finding o komentarzu w kodzie zawiera słowo 'throw' (fałszywy pozytyw heurystyki); warstwa kończy ESCALATE po 3 próbach mimo zielonej sondy i pustych violations.
