---
id: DEV-anz-layer-mismatch-testing
status: promoted
resolution: >
  Konfiguracja ai-os-bot (3.1). Naprawione 2026-10-18: .claude/blocks/bot-verifiers.yml,
  warstwa testing ma dirs [src/, scripts/] (tooling.test.ts leży w scripts/), runtime.yml
  zmaterializowany. eslint.config.js nadal wkleja właściciel, bo hook config-protection
  blokuje agentom edycję i żadna warstwa tego nie zmieni. Drugie wystąpienie
  (framework-polityczny FP-005c, 2026-10-22): testy L2 pakietu sources leżą w
  packages/sources/test/, które należą do dirs warstwy core (packages/sources/), więc obejmuje
  je jednostka core; to zakres analizy, a nie luka konfiguracji (testing dirs [test/,
  __tests__/] pasuje do ścieżki przez dopasowanie podciągu).
trigger: analyze_note
category: other
sources:
  - analyze
rule_ref: ANZ-LAYER-MISMATCH
first_seen: 2026-10-17
last_seen: 2026-10-22
occurrences: 2
projects:
  - ai-os-bot
  - framework-polityczny
reopened_at: 2026-10-22
reopened_from_status: promoted
---

# DEV-anz-layer-mismatch-testing

## Occurrences

- 2026-10-22 framework-polityczny (FP-005c) warstwa `testing` — runtime.yml: warstwa testing ma dirs [test/, __tests__/], a testy L2 pakietu sources leżą w packages/sources/test/ (poza dirs); trzeba je wpisać do jednostki warstwy core
- 2026-10-17 ai-os-bot (BOT-036) warstwa `testing` — runtime.yml orchestrate.layers majq dirs [src/]; task BOT-036 (straznik lintu) dotyka tez eslint.config.js (poza src/, hook config-protection blokuje agentom edycje - wkleja wlasciciel, BOT-A1) i scripts/*.test.ts. Brak warstwy na prace konfiguracyjna/narzedziowa; obejscie przez layers_scope i reczny krok wlasciciela.
