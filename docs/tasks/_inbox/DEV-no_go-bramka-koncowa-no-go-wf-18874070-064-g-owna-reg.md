---
id: DEV-no_go-bramka-koncowa-no-go-wf-18874070-064-g-owna-reg
status: dismissed
dismissed_reason: >
  Working as intended — bramka końcowa zrobiła dokładnie to, po co istnieje: złapała regresję
  MIĘDZY warstwami (dwa nowe moduły nigdy niedopięte do app.module.ts) i realny VETO
  bezpieczeństwa (DREAD 10, brak filtra brandId/dataClass), których żadna pojedyncza warstwa
  nie widziała. Nie błąd silnika — potrzebna nowa jednostka "wiring+security-fix" w
  marketing-hub, decyzja człowieka o kształcie.
trigger: no_go
rule_ref: null
first_seen: 2026-09-27
last_seen: 2026-09-27
occurrences: 1
projects:
  - marketing-hub
---

# DEV-no_go-bramka-koncowa-no-go-wf-18874070-064-g-owna-reg

## Occurrences

- 2026-09-27 marketing-hub (TS-MH-006) run `wf_18874070-064` — Bramka końcowa NO_GO (wf_18874070-064). Główna regresja MIĘDZY warstwami: CampaignsApiModule i ResearchApiModule (oba nowe w tej gałęzi) nigdy nie zostały dopięte do apps/api/src/app.module.ts (imports) ani ich error-mappery do DOMAIN_ERROR_MAPPERS — obie jednostki infrastructure zgłosiły to jako 'GAP poza dirs jednostki' (samozgłoszone w research-api.module.ts:17-21 i knowledge/BUSINESS_RULES.yaml:47-52), ale żadna kolejna jednostka (w tym dwie warstwy testing) tego nie domknęła, bo leżało poza ich dirs. Skutek: całe /api/campaigns i /api/research są martwe na produkcji (404), L2/L3 czerwone, L1 (1028 testów) tego nie widzi. Dodatkowo realny VETO bezpieczeństwa: TM-MH-006-008 (DREAD 10 HIGH) brak filtra brandId/dataClass w wyszukiwaniu knowledge — rola CONTRACTOR może czytać restricted wpisy wszystkich marek, mitygacja M6 z threat modelu nie zaimplementowana. Plus format:check czerwony (prettier) i brak L3 dla /api/research. To NIE jest do naprawy w istniejących jednostkach (ich dirs nie obejmują app.module.ts) — potrzebna nowa jednostka 'wiring+security-fix' w kolejnym przebiegu, decyzja człowieka o kształcie.
