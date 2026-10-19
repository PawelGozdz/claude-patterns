---
id: DEV-anz-gate-input-missing
status: promoted
resolution: >
  Plik decisions-index.json istniał, więc to nie ANZ-GATE-INPUT-MISSING: gałąź refactor/TS-SEC-MAP-GROUP-PIN-001 była 5 commitów za origin/develop, a indeks (gitignorowany, budowany z drzewa roboczego) nie miał BDR-081..084. Naprawione 2026-10-18 w silniku: scripts/index-decisions.mjs ostrzega na stderr o wpisach rejestru obecnych tylko na origin/develop lub origin/main (ANL-012, uzupełnienie w orchestrate-rule-history.md). W projekcie: merge/rebase na develop i ponowne index-decisions.mjs.
trigger: analyze_gate
category: config
sources:
  - analyze
rule_ref: ANZ-GATE-INPUT-MISSING
first_seen: 2026-10-17
last_seen: 2026-10-17
occurrences: 1
projects:
  - juz-ide-api-2
---

# DEV-anz-gate-input-missing

## Occurrences

- 2026-10-17 juz-ide-api-2 (TS-SEC-MAP-GROUP-PIN-001) — decisions-index.json nie zawiera BDR-081..084: galaz refactor/TS-SEC-MAP-GROUP-PIN-001 jest 5 commitow za origin/develop, bramka decision-gate dziala na nieaktualnym indeksie
