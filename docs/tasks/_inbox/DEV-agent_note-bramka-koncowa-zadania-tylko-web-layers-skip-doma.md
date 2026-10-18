---
id: DEV-agent_note-bramka-koncowa-zadania-tylko-web-layers-skip-doma
status: promoted
resolution: >
  Przeniesione do TASK-ORCH-CARDS-STACK-MISMATCH-001 (zadanie tylko-web dostało karty warstwy
  API mimo layers_skip).
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-15
last_seen: 2026-10-15
occurrences: 1
projects:
  - grant-flow
---

# DEV-agent_note-bramka-koncowa-zadania-tylko-web-layers-skip-doma

## Occurrences

- 2026-10-15 grant-flow (TS-UI-007-dashboard) run `wf_216bd19d-ccc` warstwa `final-gate` — Bramka końcowa zadania tylko-web (layers_skip domain/application/infrastructure) dostała karty reguł warstwy API (aggregate, value-object, handlery, repository, rate-limit-guard, acl-registry, dto-mapper) bez powierzchni w apps/web; stosowały się tylko karty refine-spa i cross-layer.
