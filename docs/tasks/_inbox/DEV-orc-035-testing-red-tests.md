---
id: DEV-orc-035-testing-red-tests
status: promoted
resolution: >
  Naprawione jako ORC-105 (2026-10-17): sonda przyrostu testów liczy teraz Pythona (`def test…(`) obok JS/Dart z jednej tabeli TEST_LANGS w CORE szablonu; pliki towarzyszące test_x.py i x_test.py też. Eval: test-block-regex-counts-python-js-and-dart-blocks, probe-prompt-counts-python-test-defs-in-one-line w tests/flow-evals/orchestrate-script/run.js.
trigger: agent_note
category: other
sources:
  - orchestrate
rule_ref: ORC-035
first_seen: 2026-10-17
last_seen: 2026-10-17
occurrences: 1
projects:
  - aegis-flow
---

# DEV-orc-035-testing-red-tests

## Occurrences

- 2026-10-17 aegis-flow (TS-005) run `wf_9cea179a-1e5` warstwa `testing:red-tests` — Sonda przyrostu testów (grep it(/test(/describe() nie rozpoznaje def test_ w Pythonie: newTestBlocks=0 mimo realnych testów RED, fałszywy ESCALATE_AND_HALT.
