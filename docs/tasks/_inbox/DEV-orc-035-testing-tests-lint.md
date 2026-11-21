---
id: DEV-orc-035-testing-tests-lint
status: proposed
trigger: no_go
category: infra
sources:
  - orchestrate
rule_ref: ORC-035
first_seen: 2026-11-15
last_seen: 2026-11-15
occurrences: 1
projects:
  - juz-ide-api-3
---

# DEV-orc-035-testing-tests-lint

## Occurrences

- 2026-11-15 juz-ide-api-3 (TS-ARCH-RP12-SHARED-JOBS-001) run `wf_bc039e69-6f3` warstwa `testing:tests-lint` — Fałszywy alarm bramki przyrostu testów: tools/lint-ddd/tests/db-token-scope.test.mjs to skrypt z asercjami top-level (assert.ok/equal/match, pętle for) bez bloków test/it; diff ma +108 linii asercji, sonda zmierzyła 0 bloków.
