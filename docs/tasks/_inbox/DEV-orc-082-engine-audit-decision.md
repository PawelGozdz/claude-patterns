---
id: DEV-orc-082-engine-audit-decision
status: promoted
resolution: >
  Naprawione 2026-10-18 jako ORC-107 (typecheckErrorPaths czyta mypy i pyright, testFailPaths i testFailExpectedCount czytają pytest FAILED, sonda zbiera te linie) i ORC-109 (--overrides checks.byLayer odrzucane z komunikatem; to ono było przyczyną „cache starej sondy”: nadpisanie nie zmieniało promptu). Evale: typecheck-error-paths-parse-mypy-and-pyright, typecheck-red-python-later-layer-is-deferred, pytest-failed-lines-are-deferred-by-test-count, probe-prompt-collects-mypy-lines-and-pytest-failed, overrides-reject-derived-checks-by-layer.
trigger: blocked_by_prior
category: other
sources:
  - orchestrate
rule_ref: ORC-082
first_seen: 2026-10-18
last_seen: 2026-10-18
occurrences: 1
projects:
  - aegis-flow
---

# DEV-orc-082-engine-audit-decision

## Occurrences

- 2026-10-18 aegis-flow (TS-019) run `wf_5c1bef35-220` warstwa `engine:audit-decision` — ORC-082 nie odracza czerwonego typechecku w projekcie Python: typecheckErrorPaths rozpoznaje tylko błędy tsc (.ts + 'error TS'), a mypy zwraca 0 ścieżek, więc BLOCKED_BY_PRIOR mimo że dag_runner.py należy do późniejszej warstwy runner-store. Ponadto resumeFromRunId po zmianie checks przez --overrides odtworzył z cache starą czerwoną sondę (0 agentów, 9 ms). Ta sama luka w parserze dotyczy ORC-099 (pytest FAILED path::test).
