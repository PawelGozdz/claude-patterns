---
id: DEV-orc-153-application-handlers
status: proposed
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: ORC-153
first_seen: 2026-11-08
last_seen: 2026-11-08
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-153-application-handlers

## Occurrences

- 2026-11-08 juz-ide-api-1 (TS-AUTH-DEACTIVATION-MAIL-OUTBOX-001) warstwa `application:handlers` — Typ payloadu outboxa importowany bezposrednio z outbox-event-payloads.ts, bo barrel queues/index.ts jest poza zakresem warstwy i go nie eksportuje; analiza nie przewidziala pliku barrel w units.
