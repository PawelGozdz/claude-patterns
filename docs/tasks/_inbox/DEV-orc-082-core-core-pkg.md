---
id: DEV-orc-082-core-core-pkg
status: promoted
resolution: >
  Konfiguracja framework-polityczny (3.1), nie silnik. Naprawione 2026-10-18: lint:boundaries usunięty z checks warstwy core w .claude/blocks/fp-modular-monolith.yml (depcruise skanuje apps/, którego w tej warstwie jeszcze nie ma); zostaje w worker, web i final_gate. runtime.yml zmaterializowany. ORC-082 bez zmian: dotyczy czerwonego typecheck w plikach późniejszych warstw, nie braku katalogu.
trigger: blocked_by_prior
category: other
sources:
  - orchestrate
rule_ref: ORC-082
first_seen: 2026-10-17
last_seen: 2026-10-17
occurrences: 1
projects:
  - framework-polityczny
---

# DEV-orc-082-core-core-pkg

## Occurrences

- 2026-10-17 framework-polityczny (FP-003) warstwa `core:core-pkg` — lint:boundaries (depcruise packages apps scripts) w checks warstwy core czerwony: apps/ powstaje dopiero w warstwach worker i web (kolejność z D9); obejście przez --overrides layers.<id>.checks
