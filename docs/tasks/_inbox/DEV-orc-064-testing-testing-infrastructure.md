---
id: DEV-orc-064-testing-testing-infrastructure
status: dismissed
dismissed_reason: >
  DRUGIE wystąpienie tej samej kategorii co DEV-orc-064-application-application.md (plik
  wiring/rejestracji poza dirs KAŻDEJ jednostki — tam domain/repositories/, tu
  organization.module.ts). Samo-naprawione dodaniem 10. jednostki
  infrastructure-module-wiring. Nie błąd silnika, ale DWA wystąpienia na jednym tasku sugerują,
  że warto rozważyć wzmocnienie ORC-064 o wykrywanie brakującego pokrycia (nie tylko złego
  formatu units[]) — do zrobienia, jeśli powtórzy się w INNYM projekcie.
trigger: halt
rule_ref: ORC-064
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 1
projects:
  - grant-flow
---

# DEV-orc-064-testing-testing-infrastructure

## Occurrences

- 2026-09-27 grant-flow (TS-RATE-003) run `wf_3a111809-3a2` warstwa `testing:testing-infrastructure` — Layer testing:testing-infrastructure surfaced a blocking production bug via 3 independent attempts: organization.module.ts never registers providers for RATE_CARD_COMMAND_REPOSITORY/RATE_CARD_QUERY_REPOSITORY (confirmed by grep: zero occurrences; confirmed at runtime by NestJS 'Nest could not find Symbol(RATE_CARD_QUERY_REPOSITORY) element' when the new integration test tried app.get() on it). Root cause: same class of units[] scope gap as the earlier domain/repositories/ gap (ORC-064/DEV-orc-064) — infrastructure-persistence's dirs create the concrete Kysely repository classes but do not include organization.module.ts, and infrastructure-acl's dirs DO include organization.module.ts but that unit's role (register ACL adapter + OnModuleInit service) never mentioned wiring the repository provider pair, so it added the ACL adapter to providers but not the two repository tokens. Every other repository pair in this same module (Department, Team, Contractor, Employee) has both a command and query provider entry; RateCard has neither. This is why both the new query-repository integration spec and the pre-existing (already-written, never-run) rate-card-acl.adapter.integration.spec.ts would fail identically at runtime — not a test-authoring problem, a wiring gap. Fixed by adding a 10th unit 'infrastructure-module-wiring' (dirs=[organization.module.ts]) positioned after authorization-catalog and before testing-domain/testing-infrastructure.
