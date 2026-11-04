---
id: DEV-orc-149-testing
status: proposed
trigger: blocked_by_prior
category: infra
sources:
  - orchestrate
rule_ref: ORC-149
first_seen: 2026-11-03
last_seen: 2026-11-03
occurrences: 1
projects:
  - grant-flow
---

# DEV-orc-149-testing

## Occurrences

- 2026-11-03 grant-flow (TS-PROJ-WRITEOWN-002) run `wf_289102bf-58d` warstwa `testing` — Sonda warstwy testing zwróciła EXIT:1 przy 6/6 plikach i 68/68 testach zielonych: scoped-tests pomija pliki jednostkowe (test-guard allowUnit niewłączone), a niezerowy kod z pominięcia czyta jako czerwień. Wynik: BLOCKED_BY_PRIOR cause=machine. Obejście: --overrides layers.testing.tests=false. Silnik nie powinien traktować pominięcia plików unit jako fail.
