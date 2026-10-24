---
id: DEV-orc-062-infrastructure-u3-infra
status: promoted
resolution: >
  Przyczyna w konfiguracji projektu: typecheck:api w marketing-hub nie budował
  packages/contracts ani libs/ddd (types: dist/index.d.ts). Skrypt przebudowuje je teraz przez
  tsc -b przed typecheckiem API (package.json, niezacommitowane w repozytorium projektu);
  typecheck:api zielony. Silnik bez zmian.
trigger: blocked_by_prior
category: infra
sources:
  - orchestrate
rule_ref: ORC-062
first_seen: 2026-10-24
last_seen: 2026-10-24
occurrences: 1
projects:
  - marketing-hub
---

# DEV-orc-062-infrastructure-u3-infra

## Occurrences

- 2026-10-24 marketing-hub (TS-MH-027) run `wf_4fd89694-ef0` warstwa `infrastructure:u3-infra` — Sonda typecheck apps/api nie przebudowuje packages/contracts (types: dist/index.d.ts): zmiana kontraktu w src daje fałszywy czerwony TS2353, implementer słusznie raportuje brak zmian w kodzie
