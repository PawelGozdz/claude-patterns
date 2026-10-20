---
id: DEV-anz-layer-mismatch-testing
status: promoted
resolution: >
  Konfiguracja ai-os-bot (3.1). Naprawione 2026-10-18: .claude/blocks/bot-verifiers.yml, warstwa testing ma dirs [src/, scripts/] (tooling.test.ts leży w scripts/), runtime.yml zmaterializowany. eslint.config.js nadal wkleja właściciel, bo hook config-protection blokuje agentom edycję i żadna warstwa tego nie zmieni.
trigger: analyze_note
category: other
sources:
  - analyze
rule_ref: ANZ-LAYER-MISMATCH
first_seen: 2026-10-17
last_seen: 2026-10-17
occurrences: 1
projects:
  - ai-os-bot
---

# DEV-anz-layer-mismatch-testing

## Occurrences

- 2026-10-17 ai-os-bot (BOT-036) warstwa `testing` — runtime.yml orchestrate.layers majq dirs [src/]; task BOT-036 (straznik lintu) dotyka tez eslint.config.js (poza src/, hook config-protection blokuje agentom edycje - wkleja wlasciciel, BOT-A1) i scripts/*.test.ts. Brak warstwy na prace konfiguracyjna/narzedziowa; obejscie przez layers_scope i reczny krok wlasciciela.
