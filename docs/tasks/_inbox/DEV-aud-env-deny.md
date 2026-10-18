---
id: DEV-aud-env-deny
status: proposed
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
