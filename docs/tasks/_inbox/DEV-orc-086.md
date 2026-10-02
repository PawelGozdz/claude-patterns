---
id: DEV-orc-086
status: promoted
resolution: >
  Naprawione jako ORC-087 (2026-10-01): bramka końcowa bez wyniku dostaje 1 ponowienie (werdykt po ~70% budżetu), dalej NO_GO machine + stageForReview. Przyczyna ciszy agenta nieustalona.
trigger: no_go
rule_ref: ORC-086
first_seen: 2026-10-01
last_seen: 2026-10-01
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-086

## Occurrences

- 2026-10-01 juz-ide-api-1 (TS-REP-FACET-TIER-EXPOSURE-001) run `wf_248b009b-5b1` — final-gate security-e2e-verifier failed silently twice (33 plików, max_tool_calls 38 -> 60), brak treści błędu w journalu; wymaga chunkingu bramki
