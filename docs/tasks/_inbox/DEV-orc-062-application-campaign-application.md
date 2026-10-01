---
id: DEV-orc-062-application-campaign-application
status: dismissed
dismissed_reason: >
  Working as intended — ORC-062 poprawnie zatrzymał się na czerwonym lincie poza zakresem tej
  warstwy (shared/security/validation), implementer odmówił naprawy cudzych plików. Decyzja
  właściciela shared/security potrzebna w marketing-hub, nie błąd silnika.
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-062-application-campaign-application

## Occurrences

- 2026-09-27 marketing-hub (TS-MH-006) run `wf_8fd41f0b-f53` warstwa `application:campaign-application` — Sonda lint:check:api czerwona (62 problems, 3 errors) w apps/api/src/shared/{response/testing,security,validation}/** i apps/api/test/shared/turnstile-fetch-mock.ts — pliki spoza dirs warstwy application:campaign-application (application/). Implementer odmówił naprawy poza zakresem (ORC-041/042), sonda pozostaje czerwona, przebieg zatrzymany do decyzji człowieka.
