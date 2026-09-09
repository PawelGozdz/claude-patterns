---
id: TASK-BLOCKS-001
title: 'System kompozycji bloków stacku: pilot na juz-ide-api-4'
type: task
status: done
created_date: 2026-08-10
updated_date: 2026-08-12
completed_date: 2026-08-12
---

# TASK-BLOCKS-001 — System kompozycji bloków stacku: pilot na juz-ide-api-4

> **▣ STATUS: DONE (2026-08-12).** Pilot przeszedł, migracja objęła wszystkie 10 repo,
> stary tor (`/analyze-ddd`, `/orchestrate-ddd`, `presets/`, `patterns/_stack-defaults/`,
> symlinki `preset.yml`) usunięto tego samego dnia — patrz
> [`docs/adr/0008-stack-blocks-composition.md`](../adr/0008-stack-blocks-composition.md)
> (status `implemented`) i commit `e72b36e`. Szczegóły i resztki: sekcja
> **„Zamknięcie (2026-09-07)"** na końcu pliku.
>
> Poniższa treść opisuje stan z 2026-08-10 i **jest historyczna** — odwołania do presetów,
> `/analyze-ddd`, `/orchestrate-ddd` i dwutorowości pilota nie opisują dzisiejszego repo.

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


---

## Zamknięcie (2026-09-07)

Task stał ze statusem `ready` przez miesiąc po tym, jak jego przedmiot został wdrożony —
znaleziony przez audyt `docs/audits/2026-09-07-repo-audit.md` (§2.5, pozycja K69
w `TASK-KAIZEN-002`). Zamykany z datą faktycznego wykonania, nie datą odkrycia.

### Co zostało zrobione

| faza | stan | dowód |
|---|---|---|
| F1 — schemat bloków, dekompozycja `nestjs-ddd` | zrobione | `blocks/` (20 plików + `ddd/`), `blocks/_aliases.yml` (`nestjs-ddd → [nestjs, ddd, kysely]`) |
| F2 — materializacja | zrobione, ale **nie** w `setup-project.sh` | wydzielone do `scripts/materialize-runtime.mjs`; `setup-project.sh:759-809` tylko wykrywa `stack_blocks` i woła materializer. Odstępstwo od planu, świadome: parsowanie kompozycji w bashu było źródłem ryzyka opisanego w sekcji „Ryzyka" |
| F3 — silniki `/analyze` i `/orchestrate` | zrobione | `commands/analyze.md`, `commands/orchestrate.md` — bramka „brak `runtime.yml` = odmowa startu" na miejscu |
| F4 — pilot na `juz-ide-api-4` | zrobione, **go** | ADR 0008 status `implemented (2026-08-12)`, commit `e72b36e` |
| F5b — canon awareness | zrobione | `blocks/governance.yml` (`canon`, `canon_inject`, `canon-check` w panelu) |
| F6 — migracja całości | zrobione dla 10 repo | ADR 0008: „wdrożone we wszystkich 10 repozytoriach; stary tor usunięty tego samego dnia" |

### Czego nie zrobiono (nie blokuje zamknięcia)

Trzy grupy resztek. Żadna nie należy do pilota — pilot był o tym, czy kompozycja bloków
działa, i odpowiedź jest twierdząca. Wszystkie trafiają do `TASK-KAIZEN-002` jako osobne
pozycje, bo mają własne uzasadnienie i własny zakres:

1. **F5 — seeding block-aware: nietknięte w całości.** `reseed-patterns.sh` nie taguje
   chunków blokami, `retrieve_patterns` nie ma parametru `blocks:`,
   `.claude/config/knowledge.json` nie dostaje `stack_blocks`. Skutek jest dokładnie ten,
   który ADR 0008 wskazał jako problem #5: projekt na TypeORM nadal może dostać w wynikach
   wzorce Kysely, bo retrieval nie zna kompozycji wołającego. Filtrowanie
   `scope`/`project` działa, filtrowanie po blokach nie istnieje.
2. **F6 — aliasy dla pozostałych profili.** `_aliases.yml` ma cztery wpisy
   (`ddd`, `nestjs-ddd`, `flutter-clean-arch`, `typescript-library`). Brakuje
   `node-kysely`, `nextjs-app`, `sveltekit`, `python-ml`, mimo że bloki dla nich istnieją.
   Projekty na tych profilach składają bloki wprost, więc nic nie jest zepsute — brakuje
   tylko skrótu.
3. **F6 — onboarding `../sso`.** Katalog `/opt/projects/sso` nie istnieje. To był drugi
   punkt danych dla granic bloków (pierwszy projekt bez `ddd`) i cały wyzwalacz ADR 0008.
   Rolę drugiego punktu przejął `iam` (płaski serwis) i `vytches-ddd` (biblioteka),
   więc potrzeba zniknęła sama.

Aktualizacja `docs/ARCHITECTURE.md`, `README.md` i `CLAUDE.md` po ADR 0008 — ostatni punkt
F6 — jest już rozpisana osobno jako K67, K70 i K71 w `TASK-KAIZEN-002`. Nie duplikować tutaj.
