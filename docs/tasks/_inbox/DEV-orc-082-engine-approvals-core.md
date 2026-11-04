---
id: DEV-orc-082-engine-approvals-core
status: proposed
trigger: blocked_by_prior
category: plan
sources:
  - orchestrate
rule_ref: ORC-082
first_seen: 2026-11-03
last_seen: 2026-11-03
occurrences: 1
projects:
  - aegis-flow
---

# DEV-orc-082-engine-approvals-core

## Occurrences

- 2026-11-03 aegis-flow (TS-018) run `wf_ef7c6330-bcc` warstwa `engine:approvals-core` — units[]: engine:approvals-core (approve_config.py) woła sygnatury loaderów zmieniane dopiero przez późniejszą jednostkę engine:loaders; czerwień w pliku własnym warstwy nie podlega odroczeniu, a implementer słusznie zgłosił poza zakresem. Obejście: --overrides layers.engine:approvals-core.checks=[make lint].
