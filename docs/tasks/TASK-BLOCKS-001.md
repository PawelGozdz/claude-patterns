---
id: TASK-BLOCKS-001
title: 'System kompozycji bloków stacku: pilot na juz-ide-api-4'
type: task
status: ready
created_date: 2026-08-10
---

# TASK-BLOCKS-001 — System kompozycji bloków stacku: pilot na juz-ide-api-4

> **▶ STATUS: READY — ADR 0008 zaakceptowany 2026-08-10 (OQ1-OQ7 rozstrzygnięte).**
>
> Fazy F1-F3 to budowa obok istniejącego systemu (zero ryzyka dla innych repo);
> F4 jest właściwym pilotem; F5-F6 dopiero po go. Uwaga na czas pilota: poprawki
> procesu DDD muszą trafiać w DWA miejsca (preset dla starych repo + bloki dla
> api-4) — zaakceptowany koszt przejściowy z OQ6.

**Źródło:** [`docs/adr/0008-stack-blocks-composition.md`](../adr/0008-stack-blocks-composition.md)
(status `proposed`, 2026-08-10) — D1-D7, OQ1-OQ7 otwarte.
**Priorytet:** średni-wysoki — blokuje sensowny onboarding `../sso`; doraźne odblokowanie
sso (siódmy profil `_stack-defaults/nestjs.yml`) możliwe niezależnie od tego tasku.

## Cel

Jeden `/analyze` i jeden `/orchestrate` sterowane kompozycją bloków z `project.yml`
(`stack_blocks:`), zmaterializowaną do `.claude/config/runtime.yml`. Pilot wyłącznie na
`juz-ide-api-4`; pozostałe repo jadą na starych komendach do decyzji o migracji.

## Zasada bezpieczeństwa pilota

1. `/analyze-ddd`, `/orchestrate-ddd`, `presets/`, `_stack-defaults/` — **nietknięte**
   do końca F4.
2. Nowe silniki mają twardą bramkę: **brak `runtime.yml` = odmowa startu**. Symlinki
   propagują komendy globalnie, ale poza pilotem są martwe.
3. Rollback pilota: `rm .claude/config/runtime.yml` w juz-ide-api-4. Nic więcej.

## Fazy

### F1 — Schemat bloków + dekompozycja nestjs-ddd (bez zmiany zachowania)

- [ ] Katalog `blocks/` + schemat (ADR D1): `nestjs.yml`, `kysely.yml`,
      `ddd/core.yml`, `ddd/cqrs.yml`, `ddd/events.yml`, `ddd/acl.yml`
      (granice wg OQ1) + alias `ddd` → pełny zestaw.
- [ ] Aliasy profili: `_aliases.yml` mapujące `nestjs-ddd` → `[nestjs, ddd, kysely]`
      (pozostałe 5 profili dopiero w F6).
- [ ] **Test równoważności** (bramka wyjścia F1): skrypt porównujący sklejenie bloków
      `[nestjs, ddd, kysely]` z dzisiejszym `_stack-defaults/nestjs-ddd.yml` +
      `presets/nestjs-ddd.yml` — ten sam zbiór wzorców always/trigger, agentów
      w slotach, hooków, bramek. Różnice wypisane jawnie; każda wymaga decyzji
      człowieka (zamierzona vs regresja).

### F2 — Materializacja w setup-project.sh

- [ ] Parsowanie `stack_blocks` (uwaga: `yml_list` czyta tylko listy inline —
      udokumentować format w `templates/project.yml.example`, jak przy `broadcast:`).
- [ ] Resolver zależności `requires:` (brakująca zależność = twardy błąd z komunikatem).
- [ ] Sklejanie: unia `patterns.always` (dedup), konkatenacja `triggers`, sloty,
      budżety (konflikt wg OQ3), adnotacja `source:` przy każdej pozycji.
- [ ] Zapis `.claude/config/runtime.yml` z `schema_version`, datą, hashem plików
      źródłowych (relacja do ADR 0007).
- [ ] Obsługa bloków lokalnych `./nazwa` z `.claude/blocks/` (ADR D6).
- [ ] Cap/ostrzeżenie na sumę `always` (wg OQ4).

### F3 — Silniki /analyze i /orchestrate (globalne skille)

- [ ] `commands/analyze.md` — szkielet: discovery → panel ze slotów runtime.yml
      (aktywacja `when:`) → synteza → artefakt → `exit` z runtime.yml (PAUSE gdy blok
      ddd/core). Przenosi hardening z `/analyze-ddd`: liście bez Task, streszczenia
      międzystage'owe zamiast pełnych outputów, weryfikacja nazwanych symboli przed
      zapisem, dowód użycia RAG we frontmatterze.
- [ ] `commands/orchestrate.md` (nowa wersja obok starej, podmiana w F6) — pętla
      warstw ze slotów, verify/fix, bramka końcowa ze slotu.
- [ ] Budżety: automatyczny inject miękkiego limitu do promptów + `maxTurns`/`effort`
      per slot + reguły lint czytające runtime.yml (ADR D4).
- [ ] Bramka wejścia obu komend: brak runtime.yml → odmowa z instrukcją.

### F4 — Pilot na juz-ide-api-4 (właściwy test)

- [x] `project.yml` api-4: `stack_blocks: [nestjs, ddd, kysely]` + materializacja →
      runtime.yml (2026-08-10, hash 82066e1e252a — identyczny z testem w repo).
      UWAGA: project.yml api-4 jest śledzony gitem i WSPÓLNY dla bliźniaków
      (api-1..4) — NIE commitować zmiany w czasie pilota, bo stack_blocks
      rozpropaguje się na pozostałe instancje. runtime.yml nieśledzony
      (rozważ wpis w .gitignore repo juz-ide-api).
- [ ] **2-3 realne taski** pełnym cyklem `/analyze` → approval → `/orchestrate`.
- [ ] Obserwacje do zebrania: trafność doboru panelu (aktywacje `when:`), zachowanie
      budżetów (czy miękki limit ratuje output przed klifem), koszt vs stara bramka,
      kolizje triggers (OQ7).

- [x] Wznowienia po przepełnieniu kontekstu (2026-08-10, przed pierwszym
      przebiegiem): `/orchestrate-blocks` czyta i aktualizuje `layers_done:`
      we frontmatter artefaktu (checkpoint per warstwa GO); wznowienie pomija
      zapisane warstwy, final_gate zawsze na końcu.

**Kryteria go (wszystkie):**
- [ ] wynik taska nie gorszy niż analogiczny na starej bramce (ocena człowieka);
- [ ] zero regresji bramki approval (implementacja nie ruszyła bez `status: approved`);
- [ ] budżety zadziałały co najmniej raz „miękko" (częściowy raport zamiast martwego
      agenta) albo nie było okazji;
- [ ] runtime.yml czytelny na tyle, że człowiek umie z niego powiedzieć, czemu dany
      agent był albo nie był w panelu.

**No-go →** porzucamy: `rm runtime.yml`, `blocks/` zostaje w historii gita, stare
komendy nigdy nie przestały działać.

### F5 — Seeding block-aware (po go z F4)

- [ ] `reseed-patterns.sh`: odwrotny indeks blocks/*.yml → tag `blocks: []` na
      chunkach; walidacja wiszących ścieżek (raport zamiast cichej omisji).
- [ ] `retrieve_patterns`: parametr `blocks:` (boost vs twardy filtr wg OQ2).
- [ ] `setup-project.sh`: `stack_blocks` dopisywane do `.claude/config/knowledge.json`;
      komendy przekazują je w wywołaniach.
- [ ] Spot-check: zapytanie z projektu na TypeORM nie zwraca w top-N wzorców Kysely.

### F5b — Canon awareness (decyzja 2026-08-10, po pilocie F4)

Intencja człowieka: agenci analizy ORAZ implementacji mają mieć kanon projektu
(docs/product, docs/strategy, docs/business, BUSINESS_RULES.yaml, ...) „z tyłu
głowy" — wyłapywać odstępstwa i ESKALOWAĆ, nie decydować samowolnie.

- [ ] Schemat: opcjonalna sekcja `canon:` w blokach i project.yml (ścieżki +
      `when:` jak przy panelach — np. docs/business/ doczytywany tylko przy
      taskach pricing/monetization); materializer przepuszcza do runtime.yml.
- [ ] `/analyze`: streszczenie trafionego kanonu wstrzykiwane do panelu;
      synteza ma obowiązek porównać rekomendacje z kanonem — każde odstępstwo
      = BLOKUJĄCE `open_question` z cytatem źródła kanonu (nie cicha zgoda,
      nie cicha odmowa).
- [ ] `/orchestrate-blocks`: verifier w inner_loop dostaje digest kanonu;
      odstępstwo w kodzie = violation z odesłaniem do kanonu → fix albo
      ESCALATE_AND_HALT (agent nie rozstrzyga konfliktu z kanonem — człowiek).
- [ ] Higiena tokenów: kanon wchodzi jako STRESZCZENIE trafionych sekcji
      (trigger-scoped), nigdy całe pliki; ta sama zasada co Rule Cards.
- [ ] Granica z CLAUDE.md („impl skills do NOT consult business strategists")
      do zrewidowania: canon-check to weryfikacja zgodności, nie konsultacja
      strategiczna — doprecyzować rozróżnienie w CLAUDE.md przy wdrożeniu.

### F6 — Migracja całości (osobna decyzja człowieka)

- [ ] Aliasy pozostałych 5 profili; test równoważności per profil.
- [ ] `/analyze-ddd`, `/orchestrate-ddd` → deprecated aliasy na nowe komendy.
- [ ] Przy przejęciu nazwy `/orchestrate` przez silnik bloków: ZACHOWAĆ tryby
      narzędziowe search/validate/review jako tryby obok silnika implementacji
      (rekomendacja 2026-08-10) — implement-mode przejmuje silnik, reszta zostaje.
- [ ] Migracja rusza od razu po go z F4, repo pojedynczo, w kolejności:
      `juz-ide-api-1` → `juz-ide-api-2` → `juz-ide-api-3` → `iam` → `vytches-ddd`
      → pozostałe. Stare mechanizmy usuwane dopiero, gdy ostatnie repo przejdzie.
- [ ] Onboarding `../sso` z `stack_blocks: [nestjs, zod, typeorm]` (+ ewentualny blok
      lokalny `./sso-keycloak`) — pierwszy projekt bez `ddd`, drugi punkt danych dla
      granic bloków.
- [ ] Aktualizacja: `docs/ARCHITECTURE.md`, `templates/project.yml.example`,
      README-ki, `CLAUDE.md` sekcja o presetach.

## Ryzyka

| ryzyko | mitygacja |
|---|---|
| parser bash (`yml_get`) nie udźwignie `stack_blocks` | format inline udokumentowany; walidacja + czytelny błąd zamiast cichego złego parsowania |
| dryf runtime.yml względem bloków po ich edycji | hash źródeł w runtime.yml + ostrzeżenie (mechanizm ADR 0007) |
| dekompozycja zgubi coś z presetu nestjs-ddd | test równoważności F1 jako twarda bramka wyjścia z fazy |
| bloki `ddd/*` źle pocięte (OQ1) | granice rewidowane po F4, zanim powstanie więcej bloków |
| pilot na bliźniaku api-1 → wnioski nieprzenośne na projekty bez DDD | sso onboardowane w F6 jako pierwszy projekt bez `ddd` |
