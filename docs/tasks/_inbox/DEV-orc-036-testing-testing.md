---
id: DEV-orc-036-testing-testing
status: dismissed
dismissed_reason: >
  Projektowe — jednostka za duża (4 niepowiązane drzewa katalogów), ten sam wzorzec co wcześniejszy
  domain-ports split. Samo-rozwiązane podziałem na 4 pod-jednostki. Nie błąd silnika.
trigger: halt
rule_ref: ORC-036
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 1
projects:
  - grant-flow
---

# DEV-orc-036-testing-testing

## Occurrences

- 2026-09-27 grant-flow (TS-RATE-003) run `wf_37341c23-2bc` warstwa `testing:testing` — Layer testing:testing ESCALATE_AND_HALT after 2 consecutive silent deaths (empty results) — scope too large for a single agent's tool-call budget: 4 unrelated directory trees (domain, application, infrastructure, authorization __tests__) in one pass. Some files got written before the deaths (rate-card.aggregate.spec.ts, rate-card-entry.entity.spec.ts, 3 of 4 application handler specs, ACL adapter integration spec, repository event-map spec, persona-permissions catalog spec) but NONE were ever actually verified (typecheck/test never ran to completion in either dead attempt). Split testing:testing into 4 sub-units by directory (testing-domain, testing-application, testing-infrastructure, testing-authorization), same pattern as the earlier domain-ports split. Confirmed 2 genuine remaining gaps by disk inspection: application/queries/list-rate-card-entries has no __tests__ at all, and infrastructure/persistence has no kysely-rate-card-query.repository.integration.spec.ts (this context's convention: every query repository — department/team/contractor/employee — has one).
