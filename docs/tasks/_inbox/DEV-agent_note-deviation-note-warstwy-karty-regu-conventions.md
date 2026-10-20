---
id: DEV-agent_note-deviation-note-warstwy-karty-regu-conventions
status: promoted
resolution: >
  Zebrane w TASK-ORCH-CARDS-STACK-MISMATCH-001 (2026-10-18): karty reguł DDD/NestJS z patterns.always trafiają do projektów o innym stosie; zadanie ma hipotezy (patterns.remove w bloku potomnym, podział kart, layers_skip, _summary) i kryteria ukończenia. Ten rekord to iam TS-SSO-062 (zadania Caddyfile/bash/python/CI). Część o ślepej sondzie warstwy caddy to konfiguracja iam: warstwa bez package.json potrzebuje checks jako komend dosłownych, np. `caddy validate`.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-18
last_seen: 2026-10-18
occurrences: 1
projects:
  - iam
---

# DEV-agent_note-deviation-note-warstwy-karty-regu-conventions

## Occurrences

- 2026-10-18 iam (TS-SSO-062) run `wf_e01d7669-032` warstwa `testing:e2e` — deviation_note warstwy: karty reguł (conventions, repository-pattern itd.) nie mają zastosowania do zadań na Caddyfile/bash/python/CI; implementer testing:e2e użył tylko testing-pyramid i IAM-A4/A5. Sonda warstwy caddy ślepa (checks skipped, platform/ bez package.json).
