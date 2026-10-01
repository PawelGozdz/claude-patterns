---
id: DEV-orc-062-application-evaluation-acl-application
status: dismissed
dismissed_reason: >
  Zbadane 2026-09-27 — ORC-062/ORC-041/042 zadziałały zgodnie z projektem: 2 realne błędy
  import/order leżą w innej, już-GO'd warstwie tego samego przebiegu (application:
  knowledge-application), implementer warstwy evaluation-acl poprawnie odmówił naprawy cudzych
  plików. Nie błąd silnika — marketing-hub musi zdecydować (osobna poprawka importów w
  knowledge-application, albo świadomy override zakresu), to działanie poza claude-patterns.
trigger: blocked_by_prior
rule_ref: ORC-062
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-062-application-evaluation-acl-application

## Occurrences

- 2026-09-27 marketing-hub (TS-MH-006) run `wf_8fd41f0b-f53` warstwa `application:evaluation-acl-application` — Sonda lint:check:api czerwona: 2 REALNE błędy (nie warningi) import/order w apps/api/src/contexts/knowledge/application/commands/{append-research-facts,create-research-entry}/handler.ts:9-10 — pliki należą do warstwy application:knowledge-application (już GO w tym przebiegu), nie do application:evaluation-acl-application (zakres: contexts/evaluation/application/acl/, 1 plik, bez naruszeń). Implementer warstwy evaluation-acl odmówił poprawy cudzych plików (ORC-041/042). Wymaga decyzji człowieka: albo osobna poprawka importów w warstwie knowledge-application, albo override zakresu.
