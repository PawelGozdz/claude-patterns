---
id: DEV-orc-035-presentation
status: proposed
trigger: halt
rule_ref: ORC-035
first_seen: 2026-10-05
last_seen: 2026-10-05
occurrences: 1
projects:
  - juz-ide-mobile-app
---

# DEV-orc-035-presentation

## Occurrences

- 2026-10-05 juz-ide-mobile-app (DS012-BROKEN-LINKS-ENDPOINTS-BUGFIX-001) run `wf_16b276bc-363` warstwa `presentation` — Fałszywy alarm sondy przyrostu testów: po GO weryfikatora (unverified_scope) pętla reverify nie wywołuje implementera, więc sonda mierzy przyrost testów względem poprzedniej próby = 0 (presentation-checks-3 newTestBlocks:0), choć poprzednia próba miała newTestBlocks:9. Warstwa zatrzymana jako ESCALATE_AND_HALT cause:code. Obejście: --overrides layers.presentation.tests=false.
