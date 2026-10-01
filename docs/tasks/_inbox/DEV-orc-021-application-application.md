---
id: DEV-orc-021-application-application
status: dismissed
dismissed_reason: >
  Naprawione w silniku pod numerem ORC-075, nie ORC-021 — ten numer w historii reguł tego
  repo już oznacza coś innego ("warstwa tests:true → implementer dostaje minimalny input, nie
  treść kodu"), niepowiązanego z treścią tego zgłoszenia; kolizja numeracji po stronie
  przebiegu grant-flow, nie duplikat. scopeBlock(layer, a) sprawdza teraz a.layers pod kątem
  innych jednostek z tests: true i dopisuje do wyjątku "pliki towarzyszące" zastrzeżenie: gdy
  katalog brakującego testu pokrywa taka jednostka, to JEJ praca, nie luka tej warstwy. Patrz
  docs/decisions/orchestrate-rule-history.md#orc-075; eval:
  scope-block-defers-companion-test-to-sibling-testing-unit w
  tests/flow-evals/orchestrate-script/run.js.
trigger: halt
rule_ref: ORC-021
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 1
projects:
  - grant-flow
---

# DEV-orc-021-application-application

## Occurrences

- 2026-09-27 grant-flow (TS-RATE-003) run `wf_f021138d-f34` warstwa `application:application` — Layer application:application ESCALATE_AND_HALT after 3 attempts, final verdict NO_GO: verifier repeatedly flagged missing __tests__/handler.spec.ts companion files for 4 new handlers as an in-scope, blocking violation (testing-pyramid-pattern.md TP1/N5 + conventions-pattern.md CV5 companion-file rule), even though (a) domain-application-implementer's own role card explicitly forbids writing tests ('NEVER write tests, ALWAYS delegate to @test-implementer') and had no Task tool in this per-layer invocation to perform that delegation, and (b) this same task's units[] already has a separate downstream 'testing:testing' unit whose dirs explicitly cover application/**/__tests__/ — i.e. test authoring for these exact handlers is already owned by a later unit in the same pipeline run. All actual production-code rule-card checks (CQRS shape, D14/D15 actor sourcing, no userId on command) passed on attempt 1 with zero findings. The per-layer verify prompt for a non-testing unit does not appear to account for a downstream tests:true/testing unit already covering the same dirs, causing the companion-file rule to fire regardless. Resolved for this run by accepting the code-quality GO and marking application:application done via layers_done, deferring test-file creation to the already-scheduled testing:testing unit later in the same pipeline (not skipping test coverage — just correcting which unit owns it).
