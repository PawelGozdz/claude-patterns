---
id: DEV-anz-layer-mismatch
status: proposed
resolution: >
  Oba wystąpienia to luki regexów `when` w konfiguracji projektów (3.1),
  naprawione 2026-10-18: ai-gateway .claude/blocks/aig-panel.yml (threat-model:
  budżet, poison, inject, identity, tożsam; ai-specialist: budżet, koszt) oraz
  framework-polityczny .claude/blocks/fp-modular-monolith.yml
  (boundary-analysis: tabel, właściciel, ownership); runtime.yml
  zmaterializowane. Dwa etapy tech-analysis (nextjs, node) są celowe i opisane w
  blocks/nextjs.yml („Nie scalać ani nie dropować”). Trzecie wystąpienie
  (ai-gateway TS-AIG-100, 2026-10-18): regexy `when` w aig-panel.yml rozszerzone
  o dostawc, anthropic, wydat (threat-model) oraz dostawc, anthropic, sdk, wydat
  (ai-specialist); runtime.yml zmaterializowane. Sloty i tak uruchomiły się wg
  ANL-020. Czwarte wystąpienie (aegis-flow TS-020, 2026-10-18): threat-model w
  blocks/python.yml łapał tylko angielskie auth/token/secret; regex rozszerzony
  o cors, principal oraz uwierzytel, autoryzac, tożsam, poświadcz; runtime.yml
  aegis-flow zmaterializowany (pcu i my-intelligence dostaną zmianę przy
  następnym materialize). Piąte wystąpienie (framework-polityczny FP-005,
  2026-10-20): sloty nextjs-architecture-expert i nextjs-quality-verifier w
  blocks/nextjs.yml nie miały `when:` i szły przy każdym zadaniu; dodany `when:`
  (web, komponent, stron, routing, layout, formularz, ui, css, seo, middleware,
  app router, server action), runtime.yml framework-polityczny zmaterializowany
  (jedyny adopter bloku), verify OK. Regex boundary-analysis zna już `tabel`,
  więc luka z tego zgłoszenia dotyczyła sformułowania zadania, nie słownika;
  slot można uruchomić wg ANL-020. Szóste wystąpienie (aegis-flow TS-001,
  2026-10-23): task wyłącznie dokumentacyjny, wszystkie 6 warstw w layers_skip.
  ORC-129: prepare ostrzega, że żadna warstwa nie jest uruchamiana i
  /orchestrate nie ma czego wykonać. Trafienie create_when na słowa z tekstu
  taska rozstrzyga layers_skip z powodem.
trigger: analyze_note
category: plan
sources:
  - analyze
rule_ref: ANZ-LAYER-MISMATCH
first_seen: 2026-10-12
last_seen: 2026-11-07
occurrences: 16
projects:
  - ai-gateway
  - framework-polityczny
  - aegis-flow
  - pcu
  - juz-ide-api-2
  - marketing-hub
  - juz-ide-api-1
  - juz-ide-api-4
reopened_at: 2026-10-28
reopened_from_status: promoted
---

# DEV-anz-layer-mismatch

## Occurrences

- 2026-11-07 juz-ide-api-1 (TS-DEPS-002) — TS-DEPS-002 (bump zależności i rejestr supresji, pliki w korzeniu repo): wszystkie 4 warstwy orchestrate.layers bez pracy, a sloty panelu tech-analysis, ddd-modeling, impl-analysis, pattern-fit nie mają when: i nie mają czego oceniać; analiza uruchomiła tylko decision-gate i tech-analysis-specialist
- 2026-11-07 juz-ide-api-4 (TS-INFRA-E2E-001) — Panel analyze ma sloty bez when: (ddd-modeling, impl-analysis, pattern-fit), ktore nie maja przedmiotu analizy dla zadania recznego bez zmian w repo (zakres_plikow pusty, wszystkie 4 warstwy w layers_skip). Pominieto je swiadomie i odnotowano w Uwagi; brak mechanizmu sita dla taskow bez kodu (ANL-018 dotyczy tylko type refactor|bugfix|chore).
- 2026-11-05 ai-gateway (TS-AIG-123) — Kompozycja aig-layers nie ma warstwy na dokumenty/runbooki; drugi task z rzędu (TS-AIG-122, 123) całkowicie w layers_skip
- 2026-11-05 juz-ide-api-1 (TS-DOCS-QUESTIONS-GAPS-FILES-001) — Panel analyze (blok ddd/core) ma sloty bez when: ddd-modeling, impl-analysis, pattern-fit, tech-analysis-specialist; task dokumentacyjno-narzedziowy (scripts/ i docs/) nie ma agregatow ani handlerow, wiec pominieto je bez wartosci dodanej. Warstwy orchestrate (domain/application/infrastructure/testing) tez nie pasuja.
- 2026-11-04 ai-gateway (TS-AIG-122) — Zadanie decyzyjne/dokumentowe (aneks ADR, karty KANBAN, TM): kompozycja aig-layers ma tylko warstwy implementation i testing z dirs src/, więc obie idą do layers_skip, a praca dokumentowa nie ma warstwy ani weryfikatora; to samo w TS-AIG-118
- 2026-11-02 framework-polityczny (FP-009) — FP-009 to spike bez kodu (dane w data/seed/ i docs/04); żadna z warstw db/core/worker/web/testing nie ma pracy, wszystkie w layers_skip
- 2026-11-02 marketing-hub (TS-MH-029) — Panel analyze (runtime.yml) ma sloty backendowe bez when: (backend-technology-expert, ddd-modeling, impl-analysis, pattern-fit); task webowy TS-MH-029 nie dotyka domeny/aplikacji/infrastruktury, 4 sloty pominięte
- 2026-10-31 juz-ide-api-2 (TS-SEC-SP-LOCATION-OWNER-CHECK-001) — runtime.yml orchestrate.layers nie ma warstwy z dirs dla docs/ ani BUSINESS_RULES.yaml; zadanie wymaga obowiazkowej aktualizacji security-gaps.md i BUSINESS_RULES.yaml w tym samym commicie, wiec jednostke docs-sync trzeba wpisac do warstwy infrastructure z dirs spoza jej wzorca
- 2026-10-28 aegis-flow (TS-008) — minor_fixes (ANL-039) dotyczące docs/ i project-orchestration/ nie mają warstwy w runtime.yml orchestrate.layers (dirs: config/, engine/, workers/docker/, app/, daemon/, tests/), więc implementer ich nie ruszy (ORC-042); poprawki dokumentów z analizy wymagają ręcznego zastosowania
- 2026-10-28 pcu (TASK-062) — Sloty sveltekit (tech-analysis, impl-analysis) w analyze.panel nie mają when:, więc wchodzą przy każdym tasku, także backendowym bez frontendu (TASK-062); pominięte ręcznie
- 2026-10-23 aegis-flow (TS-001) — TS-001 to task wyłącznie dokumentacyjny (docs/, project-orchestration/): żadna warstwa z runtime.yml orchestrate.layers nie obejmuje docs/, więc wszystkie 6 warstw trafia do layers_skip, a /orchestrate nie ma czego wykonać; jednocześnie create_when warstw engine i config trafia na słowa z tekstu taska (audyt, LLM, guardrail), choć praca ich dirs nie dotyka
- 2026-10-20 framework-polityczny (FP-005) — Panel zawiera sloty nextjs-architecture-expert i nextjs-quality-verifier bez when:, a task ingestion nie dotyka apps/web; pominięte recznie. Regex when: boundary-analysis nie lapie nowych tabel w infra.sources
- 2026-10-18 aegis-flow (TS-020) — slot threat-model: regex when: (python block) nie trafia na polskie 'uwierzytelnienie/uwierzytelniania', 'cors', 'principal' — zadanie HTTP z tożsamością i CORS uruchomione ręcznie wg ANL-020
- 2026-10-18 ai-gateway (TS-AIG-100) — aig-panel.yml: when: dla threat-model i ai-specialist nie trafia w zadanie o błędach dostawcy LLM (brak 'dostawc', 'anthropic', 'sdk', 'limit wydatk'); sloty uruchomione wg ANL-020
- 2026-10-18 framework-polityczny (FP-004) — slot boundary-analysis (blok ./fp-modular-monolith): regex when zna 'nowa tabela', a task 'Każda tabela ma właściciela' nie trafia mimo ryzyka własności tabel; dodatkowo dwa sloty o tym samym id tech-analysis (nextjs, ./fp-node) są nierozróżnialne w telemetrii
- 2026-10-12 ai-gateway (TS-AIG-094) — aig-panel: when: slotów threat-model i ai-specialist zawiera 'budget', ale nie polską formę 'budżet'; task TS-AIG-094 (budżet) trafił tylko przez 'LLM'/'cost' — regex do uzupełnienia o 'budżet|koszt'
