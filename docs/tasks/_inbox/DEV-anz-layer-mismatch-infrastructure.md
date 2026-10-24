---
id: DEV-anz-layer-mismatch-infrastructure
status: promoted
resolution: >
  Blok monorepo-layers: warstwa infrastructure obejmuje teraz apps/api/tools/ (katalog MCP,
  generator katalogu, guard). Zmaterializowane w marketing-hub i grant-flow,
  verify-project-setup OK.
trigger: analyze_note
category: plan
sources:
  - analyze
rule_ref: ANZ-LAYER-MISMATCH
first_seen: 2026-10-24
last_seen: 2026-10-24
occurrences: 1
projects:
  - marketing-hub
---

# DEV-anz-layer-mismatch-infrastructure

## Occurrences

- 2026-10-24 marketing-hub (TS-MH-028) warstwa `infrastructure` — apps/api/tools/ (katalog MCP, workspace pnpm: generator katalogu, guard.ts, marketing.catalog.json) nie należy do żadnej warstwy runtime.yml orchestrate.layers (infrastructure.dirs ma infrastructure/, apps/api/src/app/, apps/api/src/shared/, packages/contracts/); zmiana kontraktu wymaga regeneracji katalogu, więc analiza musiała dopisać apps/api/tools/ do dirs jednostki
