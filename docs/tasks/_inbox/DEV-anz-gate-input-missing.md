---
id: DEV-anz-gate-input-missing
status: proposed
resolution: >
  Plik decisions-index.json istniał, więc to nie ANZ-GATE-INPUT-MISSING: gałąź
  refactor/TS-SEC-MAP-GROUP-PIN-001 była 5 commitów za origin/develop, a indeks
  (gitignorowany, budowany z drzewa roboczego) nie miał BDR-081..084. Naprawione
  2026-10-18 w silniku: scripts/index-decisions.mjs ostrzega na stderr o wpisach
  rejestru obecnych tylko na origin/develop lub origin/main (ANL-012,
  uzupełnienie w orchestrate-rule-history.md). W projekcie: merge/rebase na
  develop i ponowne index-decisions.mjs.
trigger: analyze_gate
category: config
sources:
  - analyze
rule_ref: ANZ-GATE-INPUT-MISSING
first_seen: 2026-10-17
last_seen: 2026-10-20
occurrences: 2
projects:
  - juz-ide-api-2
  - aegis-flow
reopened_at: 2026-10-20
reopened_from_status: promoted
---

# DEV-anz-gate-input-missing

## Occurrences

- 2026-10-20 aegis-flow (TS-003) — CLAUDE.md (Documentation) wskazuje docs/adr/, a katalog nie istnieje; TS-003 wymaga decyzji w ADR (MVP tokeny vs OIDC), analiza nie ma gdzie sprawdzić precedensu ani wskazać numeru kolejnego ADR
- 2026-10-17 juz-ide-api-2 (TS-SEC-MAP-GROUP-PIN-001) — decisions-index.json nie zawiera BDR-081..084: galaz refactor/TS-SEC-MAP-GROUP-PIN-001 jest 5 commitow za origin/develop, bramka decision-gate dziala na nieaktualnym indeksie
