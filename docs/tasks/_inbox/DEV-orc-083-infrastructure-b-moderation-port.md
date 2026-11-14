---
id: DEV-orc-083-infrastructure-b-moderation-port
status: proposed
trigger: agent_note
category: scope
sources:
  - orchestrate
rule_ref: ORC-083
first_seen: 2026-11-14
last_seen: 2026-11-14
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-orc-083-infrastructure-b-moderation-port

## Occurrences

- 2026-11-14 juz-ide-api-2 (TS-TOOLING-NO-THROW-ACL-ADAPTERS-001) run `wf_52e57e25-06b` warstwa `infrastructure:B-moderation-port` — ERROR_HTTP_STATUS i JSDoc błędu D_MOD_DISC_UNSUPPORTED_REQUEST mówiły 400, zmierzony status to 500; poprawka leżała w warstwie domain, poza zakresem jednostki B-moderation-port. Naprawione rundą po bramce końcowej.
