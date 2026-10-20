---
id: DEV-orc-062-testing-sources-tests
status: dismissed
dismissed_reason: >
  Config projektu (3.1), nie silnik: testy L2 framework-polityczny (db-l2, sources-l2) czytają
  DATABASE_URL z process.env (global-setup.ts), a bramka nie ma .env, więc sonda jest czerwona mimo
  działającego Postgresa. Jednorazowo naprawione --overrides checks (komenda z DATABASE_URL z
  .env.example). Na stałe: analiza zadań z testami L2 ma wpisywać checks jako komendę dosłowną z
  DATABASE_URL=postgres://fp:fp_local_dev@127.0.0.1:5432/fp (dane lokalne z .env.example).
trigger: blocked_by_prior
category: other
sources:
  - orchestrate
rule_ref: ORC-062
first_seen: 2026-10-20
last_seen: 2026-10-20
occurrences: 1
projects:
  - framework-polityczny
---

# DEV-orc-062-testing-sources-tests

## Occurrences

- 2026-10-20 framework-polityczny (FP-005) run `wf_53302ff1-8ed` warstwa `testing:sources-tests` — testing: sonda test:l2 czerwona, brak .env i DATABASE_URL w srodowisku bramki mimo dzialajacego Postgresa; naprawa przez --overrides checks (komenda dosłowna z DATABASE_URL)
