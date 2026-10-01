---
id: DEV-orc-064-application-application
status: dismissed
dismissed_reason: >
  Potwierdza wartość ORC-064 — brakująca jednostka domain/repositories/ w units[] analizy,
  samo-naprawione dodaniem 7. jednostki. Nie nowy błąd silnika; patrz też
  DEV-orc-064-testing-testing-infrastructure.md — ta sama kategoria (wiring/rejestracja poza
  dirs jakiejkolwiek jednostki) powtórzyła się w tym samym tasku, warto rozważyć wzmocnienie
  walidacji ORC-064 (dziś łapie tylko ŹLE sformatowane units[], nie BRAKUJĄCE pokrycie), jeśli
  pojawi się trzeci raz.
trigger: halt
rule_ref: ORC-064
first_seen: 2026-09-26
last_seen: 2026-09-26
occurrences: 1
projects:
  - grant-flow
---

# DEV-orc-064-application-application

## Occurrences

- 2026-09-26 grant-flow (TS-RATE-003) run `wf_59594f03-a9e` warstwa `application:application` — Layer application:application ESCALATE_AND_HALT after 3 attempts: implementer correctly identified that IRateCardCommandRepository/IRateCardQueryRepository ports do not exist and are out of its own layers_scope.dirs (application/commands, application/queries only). Root cause: none of the analysis's original 6 units[] included domain/repositories/ in dirs, so the repository port interfaces (this repo's established convention: domain/repositories/*.repository.ts, e.g. department.repository.ts, contractor.repository.ts) had no owning unit at all. Fixed by adding a 7th unit 'domain-ports' (layer domain, dirs=[domain/repositories/]) between domain and application in the analysis frontmatter units[] list, ordered before application (consumer) and infrastructure-persistence (Kysely implementation of the ports).
