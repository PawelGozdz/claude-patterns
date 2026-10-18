---
id: DEV-orc-098-final-gate
status: promoted
resolution: >
  Naprawione w części jako ORC-106 (2026-10-17): ta sama przyczyna co DEV-orc-103-testing (lista
  padających plików niezgodna z podsumowaniem runnera blokowała finalGapsAcceptable).
  NIEZWERYFIKOWANE: wątek marketing-hub (sonda ślepa na --prefix apps/api/tools, pretest
  przebudowuje contracts równolegle) nie został odtworzony; wróci jako nowe wystąpienie.
trigger: no_go
category: verifier
sources:
  - orchestrate
rule_ref: ORC-098
first_seen: 2026-10-10
last_seen: 2026-10-12
occurrences: 2
projects:
  - marketing-hub
  - grant-flow
---

# DEV-orc-098-final-gate

## Occurrences

- 2026-10-12 grant-flow (TS-UI-006) run `wf_f4a4221d-7a0` warstwa `final-gate` — Bramka końcowa NO_GO machine z samego unverified_scope (checks.tests=fail z flaky testu DoS security-vulnerability-tests.spec.ts, zero własnych naruszeń); finalGapsAcceptable nie przepuścił, bo sonda testów czerwona — ten sam brak co testsRerunPassed/testFailPaths
- 2026-10-10 marketing-hub (TS-MH-007) run `wf_95e444a9-329` warstwa `final-gate` — Bramka końcowa NO_GO cause=machine: sonda czerwona, ręczne powtórki zielone; sonda ślepa na --prefix apps/api/tools (pretest przebudowuje contracts równolegle)
