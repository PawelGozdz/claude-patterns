---
id: DEV-aud-env-deny
status: dismissed
dismissed_reason: >
  Naprawione w projekcie 2026-10-20: framework-polityczny/.claude/settings.json dostał
  permissions.deny z Read(./.env) i Read(./.env.*); audit-projects nie zgłasza już
  AUD-ENV-DENY.
trigger: setup_drift
category: config
sources:
  - audit
rule_ref: AUD-ENV-DENY
first_seen: 2026-10-14
last_seen: 2026-10-14
occurrences: 1
projects:
  - framework-polityczny
---

# DEV-aud-env-deny

## Occurrences

- 2026-10-14 framework-polityczny — permissions.deny nie obejmuje odczytu .env (brak Read(.env))
