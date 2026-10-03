---
id: DEV-no_go-final-gate-z-silnika-2x-bez-werdyktu-brak-structu
status: promoted
resolution: >
  Naprawione jako ORC-092 (2026-10-03): maxTurns 60 w definicjach weryfikatorów i bramek (centralnych i lokalnych), plus ostrzeżenie w orchestrate-prepare. To też przyczyna cichych bramek końcowych z DEV-orc-056.
trigger: no_go
rule_ref: null
first_seen: 2026-10-03
last_seen: 2026-10-03
occurrences: 1
projects:
  - iam
---

# DEV-no_go-final-gate-z-silnika-2x-bez-werdyktu-brak-structu

## Occurrences

- 2026-10-03 iam (TS-SSO-056) run `wf_1a61c8ae-2af` — final-gate z silnika 2x bez werdyktu (brak StructuredOutput): security-e2e-verifier kończy na twardym limicie 20 tur z definicji agenta, budgets.final-gate z --overrides go nie podnosi; bramkę wykonano ręcznie (2 weryfikatorów, tekst)
