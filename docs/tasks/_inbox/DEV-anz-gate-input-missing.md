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
  develop i ponowne index-decisions.mjs. 2026-10-21 marketing-hub (TS-MH-022):
  kolekcja code_marketing_hub była w knowledge.json, ale nie w Qdrancie —
  dopisana do reseed.config.json (origin/develop, apps/api/src, apps/web/src,
  packages/contracts/src, libs) i zaindeksowana (2380 fragmentów), retrieve_code
  działa. 2026-10-22 iam (TS-SSO-065): kolekcji code_iam nie było w
  reseed.config.json — dopisana (origin/develop, src) i zaindeksowana (1923
  fragmenty). Otwarta zostaje część aegis-flow (brak docs/adr/ — decyzja
  projektu). 2026-10-23 aegis-flow (TS-001): knowledge.json deklaruje
  code_aegis_flow, ale kolekcji nie ma w reseed.config.json, a runtime.yml nie
  ma knowledge.collection (ANL-009). Projekt jest w Pythonie (app, engine,
  daemon), więc wymaga decyzji, które katalogi indeksować; wpisać kolekcję i
  blok knowledge albo świadomie zostać bez RAG.
trigger: analyze_gate
category: config
sources:
  - analyze
rule_ref: ANZ-GATE-INPUT-MISSING
first_seen: 2026-10-17
last_seen: 2026-10-23
occurrences: 6
projects:
  - juz-ide-api-2
  - aegis-flow
  - marketing-hub
  - iam
reopened_at: 2026-10-20
reopened_from_status: promoted
---

# DEV-anz-gate-input-missing

## Occurrences

- 2026-10-23 juz-ide-api-2 (TS-SEC-SP-LOCATION-001) — decisions-index.json: needs_scope_check=false i scope=null dla BDR-083/089/090/096 mimo częściowych uchyleń opisanych w nagłówkach BDR; korpus strategy-fit w runtime.yml kończy się na BDR-090 (drift do BDR-099)
- 2026-10-23 aegis-flow (TS-001) — runtime.yml nie ma bloku knowledge.collection (ANL-009), a .claude/config/knowledge.json ma collection=code_aegis_flow; RAG pominięty w TS-001 (rag: skipped), ta sama luka co w TS-004
- 2026-10-22 iam (TS-SSO-065-admin-allowlist-sciezek) — knowledge.json wskazuje kolekcję code_iam, której nie ma w indeksie MCP (retrieve_code zwraca błąd); runtime.yml nie ma knowledge.collection — RAG niedostępny dla projektu iam
- 2026-10-21 marketing-hub (TS-MH-022) — runtime.yml knowledge.collection=code_marketing_hub nie istnieje w daemonie knowledge-retriever (dostępne: code_ai_gateway, code_grant_flow, code_juz_ide_api, ...); retrieve_code zwraca ERROR, analiza bez RAG kodu
- 2026-10-20 aegis-flow (TS-003) — CLAUDE.md (Documentation) wskazuje docs/adr/, a katalog nie istnieje; TS-003 wymaga decyzji w ADR (MVP tokeny vs OIDC), analiza nie ma gdzie sprawdzić precedensu ani wskazać numeru kolejnego ADR
- 2026-10-17 juz-ide-api-2 (TS-SEC-MAP-GROUP-PIN-001) — decisions-index.json nie zawiera BDR-081..084: galaz refactor/TS-SEC-MAP-GROUP-PIN-001 jest 5 commitow za origin/develop, bramka decision-gate dziala na nieaktualnym indeksie
