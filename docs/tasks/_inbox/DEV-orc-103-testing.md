---
id: DEV-orc-103-testing
status: promoted
resolution: >
  Naprawione jako ORC-106 (2026-10-17): testFailPaths rozpoznaje prefiks projektu vitest
  workspace (|projekt|), a sonda zaczyna od rm -f /tmp/check-<warstwa>-*.log, więc stare logi z
  poprzednich przebiegów nie zawyżają listy padających plików. Eval:
  test-fail-paths-handles-vitest-workspace-prefix,
  probe-clears-stale-check-logs-before-running-checks.
trigger: blocked_by_prior
category: other
sources:
  - orchestrate
rule_ref: ORC-103
first_seen: 2026-10-12
last_seen: 2026-10-12
occurrences: 1
projects:
  - grant-flow
---

# DEV-orc-103-testing

## Occurrences

- 2026-10-12 grant-flow (TS-UI-006) run `wf_f4a4221d-7a0` warstwa `testing` — Sonda warstwy testing: testsFlakyUnderLoad nie zadziałał mimo testsRerunPassed=true — testFailPaths() glob /tmp/check-testing-*.log zbiera stare logi z innych przebiegów (18 ścieżek vs testFilesFailed=1) i nie rozpoznaje prefiksu vitest workspace |projekt|; flaky test DoS poza zakresem dał BLOCKED_BY_PRIOR
