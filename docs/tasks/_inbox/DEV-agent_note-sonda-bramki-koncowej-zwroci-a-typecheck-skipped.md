---
id: DEV-agent_note-sonda-bramki-koncowej-zwroci-a-typecheck-skipped
status: promoted
resolution: >
  Częściowo naprawione jako ORC-116: skipped zadeklarowanej kontroli w sondzie bramki końcowej
  trafia do report.warnings (docs/decisions/orchestrate-rule-history.md#orc-116). Przyczyna
  samego skipped (typecheck:scripts albo nazwa skryptu w pakiecie) leży w checks.finalGate
  ai-gateway i wymaga sprawdzenia w tamtym projekcie.
trigger: agent_note
category: typecheck
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-12
last_seen: 2026-10-12
occurrences: 1
projects:
  - ai-gateway
---

# DEV-agent_note-sonda-bramki-koncowej-zwroci-a-typecheck-skipped

## Occurrences

- 2026-10-12 ai-gateway (TS-AIG-094) run `wf_671169fb-f18` warstwa `final-gate` — Sonda bramki końcowej zwróciła typecheck: skipped; ręczny pnpm typecheck czerwony (TS2578 w src/usage/budget-guard.test.ts), bramka dała GO
