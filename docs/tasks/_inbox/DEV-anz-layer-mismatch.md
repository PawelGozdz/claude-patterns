---
id: DEV-anz-layer-mismatch
status: promoted
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
  następnym materialize).
  Piąte wystąpienie (framework-polityczny FP-005, 2026-10-20): sloty
  nextjs-architecture-expert i nextjs-quality-verifier w blocks/nextjs.yml nie miały
  `when:` i szły przy każdym zadaniu; dodany `when:` (web, komponent, stron, routing,
  layout, formularz, ui, css, seo, middleware, app router, server action), runtime.yml
  framework-polityczny zmaterializowany (jedyny adopter bloku), verify OK. Regex
  boundary-analysis zna już `tabel`, więc luka z tego zgłoszenia dotyczyła sformułowania
  zadania, nie słownika; slot można uruchomić wg ANL-020.
trigger: analyze_note
category: other
sources:
  - analyze
rule_ref: ANZ-LAYER-MISMATCH
first_seen: 2026-10-12
last_seen: 2026-10-20
occurrences: 5
projects:
  - ai-gateway
  - framework-polityczny
  - aegis-flow
reopened_at: 2026-10-20
reopened_from_status: promoted
---

# DEV-anz-layer-mismatch

## Occurrences

- 2026-10-20 framework-polityczny (FP-005) — Panel zawiera sloty nextjs-architecture-expert i nextjs-quality-verifier bez when:, a task ingestion nie dotyka apps/web; pominięte recznie. Regex when: boundary-analysis nie lapie nowych tabel w infra.sources
- 2026-10-18 aegis-flow (TS-020) — slot threat-model: regex when: (python block) nie trafia na polskie 'uwierzytelnienie/uwierzytelniania', 'cors', 'principal' — zadanie HTTP z tożsamością i CORS uruchomione ręcznie wg ANL-020
- 2026-10-18 ai-gateway (TS-AIG-100) — aig-panel.yml: when: dla threat-model i ai-specialist nie trafia w zadanie o błędach dostawcy LLM (brak 'dostawc', 'anthropic', 'sdk', 'limit wydatk'); sloty uruchomione wg ANL-020
- 2026-10-18 framework-polityczny (FP-004) — slot boundary-analysis (blok ./fp-modular-monolith): regex when zna 'nowa tabela', a task 'Każda tabela ma właściciela' nie trafia mimo ryzyka własności tabel; dodatkowo dwa sloty o tym samym id tech-analysis (nextjs, ./fp-node) są nierozróżnialne w telemetrii
- 2026-10-12 ai-gateway (TS-AIG-094) — aig-panel: when: slotów threat-model i ai-specialist zawiera 'budget', ale nie polską formę 'budżet'; task TS-AIG-094 (budżet) trafił tylko przez 'LLM'/'cost' — regex do uzupełnienia o 'budżet|koszt'
