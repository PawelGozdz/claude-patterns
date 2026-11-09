---
id: DEV-anz-layer-mismatch-infrastructure
status: proposed
resolution: >
  Blok monorepo-layers: warstwa infrastructure obejmuje teraz apps/api/tools/
  (katalog MCP, generator katalogu, guard). Zmaterializowane w marketing-hub i
  grant-flow, verify-project-setup OK. Ponowne otwarcie 2026-10-28 (grant-flow):
  ANL-053 (2026-10-29): /analyze wpisuje do dirs jednostki zmieniającej
  sygnaturę portu, komendy albo zdarzenia także implementację i wołających z
  późniejszych warstw; reguła tylko w prompcie
  (docs/decisions/orchestrate-rule-history.md#anl-053). Dwa projekty:
  juz-ide-api-4, grant-flow.
trigger: analyze_note
category: plan
sources:
  - analyze
rule_ref: ANZ-LAYER-MISMATCH
first_seen: 2026-10-24
last_seen: 2026-11-07
occurrences: 4
projects:
  - marketing-hub
  - grant-flow
  - juz-ide-api-6
  - juz-ide-api-1
reopened_at: 2026-11-07
reopened_from_status: promoted
---

# DEV-anz-layer-mismatch-infrastructure

## Occurrences

- 2026-11-07 juz-ide-api-1 (TS-DEPS-002) warstwa `infrastructure` — TS-DEPS-002 (bump zależności + dokumentacja): warstwy domain/application/testing bez pracy, a pliki package.json, pnpm-lock.yaml i docs/ leżą poza dirs każdej warstwy (jednostka wymusza layer: infrastructure). Brak warstwy 'config/deps' w runtime.yml.
- 2026-11-07 juz-ide-api-6 (TS-MOD-REPORT-INTAKE-001-engagement-report-to-moderation-queue) warstwa `infrastructure` — runtime.yml orchestrate.layers (domain/application/infrastructure/testing) nie ma warstwy na zmiany dokumentacji i reguł security wymagane przez AC1-AC6 (docs/security/rules/*, usunięcie pliku luki); jednostka docs-sync wpisana w warstwę infrastructure
- 2026-10-28 grant-flow (TS-PROJ-WRITEOWN-002) warstwa `infrastructure` — monorepo-layers-grant-flow: warstwa infrastructure (dirs apps/api/src/app/) zawiera kontroler, który przy zmianie sygnatury komend musi być w dirs warstwy application (typecheck:api po application); layer domain ma dirs apps/api/src/ obejmujące cały kod API, więc przydział plików zależy od najdłuższego dopasowania
- 2026-10-24 marketing-hub (TS-MH-028) warstwa `infrastructure` — apps/api/tools/ (katalog MCP, workspace pnpm: generator katalogu, guard.ts, marketing.catalog.json) nie należy do żadnej warstwy runtime.yml orchestrate.layers (infrastructure.dirs ma infrastructure/, apps/api/src/app/, apps/api/src/shared/, packages/contracts/); zmiana kontraktu wymaga regeneracji katalogu, więc analiza musiała dopisać apps/api/tools/ do dirs jednostki
