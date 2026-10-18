---
id: DEV-agent_note-security-e2e-verifier-lokalna-definicja-wymaga-t
status: promoted
resolution: >
  Część o kartach cross-layer CV/ZOD/TP niestosowalnych do płaskiego Fastify przeniesiona do
  TASK-ORCH-CARDS-STACK-MISMATCH-001. Część o narzędziach: lokalna definicja
  security-e2e-verifier w iam wymaga Task(Explore), czego nie ma w tools; to config projektu
  (3.1), centralna definicja ma tryb pracy bez delegowania.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-15
last_seen: 2026-10-15
occurrences: 1
projects:
  - iam
---

# DEV-agent_note-security-e2e-verifier-lokalna-definicja-wymaga-t

## Occurrences

- 2026-10-15 iam (TS-SSO-061) run `wf_ee4513b8-ddd` warstwa `final-gate` — security-e2e-verifier (lokalna definicja) wymaga Task(Explore), ale jej tools go nie zawierają; karty cross-layer CV/ZOD/TP z DDD/NestJS nie dotyczą płaskiego Fastify
