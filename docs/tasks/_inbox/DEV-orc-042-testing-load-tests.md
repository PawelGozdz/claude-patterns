---
id: DEV-orc-042-testing-load-tests
status: dismissed
dismissed_reason: >
  Błąd planu naprawiony w analizie projektu (3.1): jednostka load-tests ma teraz
  vitest.config.ts w dirs z jawnym wyjątkiem dopisania jednej linii include. Przypadek objęty
  ANL-044 (katalog nowych testów musi być w include runnera, plik configu do dirs jednostki)
  od 2026-10-24; ta analiza go nie zastosowała.
trigger: agent_note
category: plan
sources:
  - orchestrate
rule_ref: ORC-042
first_seen: 2026-10-30
last_seen: 2026-10-30
occurrences: 1
projects:
  - juz-ide-api-1
---

# DEV-orc-042-testing-load-tests

## Occurrences

- 2026-10-30 juz-ide-api-1 (TS-SEC-USER-BLOCK-001) run `wf_d17eb321-a0a` warstwa `testing:load-tests` — Plan: vitest.config.ts nie obejmował test/load/__tests__/ i nie był w dirs jednostki load-tests; specy L1 nieuruchamialne, 3 próby i halt.
