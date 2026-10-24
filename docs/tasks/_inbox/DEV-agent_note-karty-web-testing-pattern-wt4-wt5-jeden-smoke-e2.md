---
id: DEV-agent_note-karty-web-testing-pattern-wt4-wt5-jeden-smoke-e2
status: promoted
resolution: >
  Karty refine-spa/web-testing-pattern (WT4, WT5): L3 to smoke plus dodatkowe scenariusze
  przewidziane decyzją analizy, a katalog L3 wynika z playwright.config.ts projektu
  (apps/web/test/e2e nie jest naruszeniem). Karta web-security-invariants (N5): flagi
  VITE_FEATURE_* i publiczne adresy własnego originu nie są sekretami, reguła ESLint ma
  dopuszczać je listą nazw. Reguła ESLint w grant-flow (WS6-N5) to konfiguracja projektu.
trigger: agent_note
category: pattern_card
sources:
  - orchestrate
rule_ref: null
first_seen: 2026-10-22
last_seen: 2026-10-22
occurrences: 1
projects:
  - grant-flow
---

# DEV-agent_note-karty-web-testing-pattern-wt4-wt5-jeden-smoke-e2

## Occurrences

- 2026-10-22 grant-flow (TS-UI-009) run `wf_dbfdcd1a-768` warstwa `web:web-e2e` — Karty web-testing-pattern WT4/WT5 (jeden smoke, e2e w apps/web/e2e/) nie pasują do ustawienia projektu (apps/web/test/e2e, wiele scenariuszy wg D9); ESLint/WS6-N5 nie odróżnia flag VITE_ od sekretów
