---
id: DEV-agent_note-sonda-bramki-koncowej-uruchamia-tylko-l1-test-tes
status: dismissed
dismissed_reason: >
  Config projektu (3.1): grant-flow .claude/config/runtime.yml:146 ma final_gate.checks
  [typecheck, test, validate:br:api, build], bez L2/L3 i test:visual wymaganych przez D8.
  Sonda robi to, co jej wpisano. Do dopisania w lokalnym bloku monorepo-layers-grant-flow.yml.
trigger: agent_note
category: config
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-25
last_seen: 2026-10-25
occurrences: 1
projects:
  - grant-flow
---

# DEV-agent_note-sonda-bramki-koncowej-uruchamia-tylko-l1-test-tes

## Occurrences

- 2026-10-25 grant-flow (TS-UI-010) run `wf_c352741c-b42` warstwa `final-gate` — Sonda bramki końcowej uruchamia tylko L1 (test/test:api bez configów L2/L3) i nie uruchamia test:visual, choć D8 wymaga L2/L3 i test:visual; bramka musiała sama uruchomić L2, L3 i Playwright (~20 min, 4 z 50 wywołań).
