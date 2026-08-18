# TASK-RAG-003 — wersjonowanie patternów + per-project best_practices + multi-stack infra (Filar 3)

> **✅ STATUS: DONE (2026-07-03)** — zakres ZWĘŻONY do sekcji 0 (research → plan schematu →
> implementacja → seed → evale regresji → code review), wykonany w całości: `types.ts`/`schema.ts`/
> `store-qdrant.ts`/`index.ts`/`global-indexer.ts`/`markdown-chunker.ts` zmienione i zreviewowane
> (0 critical/high, 3 medium naprawione), 20 równoległych agentów wyekstrahowało 853 chunki z
> `LLMGUIDE.md`+`llm-context.md` (0 błędów walidacji) do `data/library-reference/*.json`,
> `library_reference_global` zaseedowane (982 chunki, `lib_version:"0.30.0"`), oba evale L1 zielone
> (`tests/flow-evals/retrieval` hit@5=0.85 — wykryta i naprawiona realna regresja E01/E02/E04;
> `tests/flow-evals/library-reference-schema` 14/14). Szczegóły: sekcje 0/0.1/0.2/0.3 niżej.
>
> **NIE ukończone, ŚWIADOMIE POZA tym zamknięciem** — oryginalny zakres tego pliku (Filar 3) był
> szerszy niż to, co faktycznie zrealizowano: sekcja 0a (examples-as-contract w vytches-ddd —
> kierunek potwierdzony, cross-ref do `VD-006-example-coverage-matrix.md` w vytches-ddd, backlog,
> nieuruchomiony), sekcja 1 (`knowledge-pins.json` — blocker architektoniczny opisany przy sekcji 1
> niżej: model `recreate()` nie przechowuje historii wersji), sekcje 2-4 (best_practices bramka,
> multi-stack, storage) — WSZYSTKIE nietknięte. Przy podjęciu tego wątku otwórz NOWY task
> (np. `TASK-RAG-004`) obejmujący 0a/1/2/3/4 zamiast wznawiać ten plik — wzorem jak TASK-RAG-002
> zwęził swój zakres i wskazał kontynuację na TASK-RAG-003.
>
> Poprzedni banner (READY, 2026-07-02): wszystkie 3 twarde prerequisites ODBLOKOWANE —
> (1) TASK-OBS-001 done, (2) Rule Card fix SP3a/SP3b+N4 done (51ef956), (3) eval RAG-002 przeszedł
> próg (hit@5=0.85). Projekt szczegółowy: ADR 0005.

**Źródło:** `docs/tasks/TASK-RAG-002.analysis.md` (status: approved, 2026-07-02) — Filar 3, decyzje D3/D4/D5, odpowiedzi Q5/Q6.
**Prerequisite (twarde):**
1. TASK-OBS-001 done (bez observability żaden dłuższy przebieg nie jest bezpieczny).
2. TASK-AGENT-CONFORMANCE-001: **Rule Card fix (split SP3 + reguła N4)** — warunek D5(a);
   na dzisiejszych kartach bramka best_practices wykluczy dobre pliki (6/8 fałszywych SP3)
   i wpuści złe (N4: `@BusinessRule` bez delegacji — 5/8 agregatów).
3. TASK-RAG-002 (zwężony): eval przeszedł próg — nie rozbudowujemy retrievalu, którego wartość
   nie została udowodniona.

## Zakres

### 0a. KIERUNEK POTWIERDZONY (user, 2026-07-03): examples-as-contract
User zleca w repo vytches-ddd korpus przykładów: każdy feature na poziomach
(quickstart 1-2 linijki → core → advanced → exhaustive-config) + KOMBINACJE feature'ów
(serwis domenowy+polityki, CQRS handler+resilience, agregat+specyfikacje…) — „biblioteka
jako żywy organizm". Decyzje ustalone:
- [ ] **Meta W plikach przykładów, nie w naszym configu** (kontrakt samoopisujący): nagłówek
      JSDoc `@example-meta` z `feature`, `level: quickstart|core|advanced|exhaustive`,
      `combines: []` + konwencja katalogów `examples/<feature>/NN-*.ts`,
      `examples/combinations/<a>+<b>/`. Kolejne biblioteki (flutter, shared-lib) wpinają się
      zero-configiem.
- [ ] **`buildExamplesIndex()` czyta meta z plików** (zamiast ręcznej mapy `vytchesLevels`
      w global.config.json — do wycofania po migracji).
- [ ] **Kombinacje**: `kind: example` + `tags` z ≥2 feature'ami — szwy między elementami to
      główne miejsce naruszeń (fanout-w-handlerze = błąd szwu, nie elementu).
- [ ] **Przykłady WYKONYWALNE w CI biblioteki** (min. tsc --noEmit, docelowo testy) — inaczej
      korpus dryfuje od API i RAG serwuje nieaktualne sygnatury (klasa ANTI-SPOOF). Bonus:
      gwarancja D5-style (battle-tested, per release) + docs dla ludzi z tego samego źródła.
- [ ] **Macierz pokrycia jako spec** (features × poziomy × kombinacje, odhaczane komórki) —
      „wyczerpanie opcji" mierzalne; per komórka golden-query do evalu.
- [ ] **`anti_pattern` per feature** — pierwsi kandydaci: fanout-w-handlerze eventu domenowego,
      deep-import zamiast publicznego barrela (oba z realnych incydentów 2026-07).
- [ ] Golden-set kombinacyjny + eval PRZED poleganiem na korpusie (próg jak w RAG-002).

> **🔗 CROSS-REFERENCE (2026-07-03):** `vytches-ddd/project-orchestration/tasks/VD-006-example-
> coverage-matrix.md` (status: backlog, jeszcze NIE przez `/analyze-ddd`) to najpewniej **wehikuł
> wykonawczy tej sekcji po stronie vytches-ddd** — matrix feature×poziom×kombinacja generowany ze
> stanu repo, testy compile-and-run rozszerzające wzorzec `examples/policies/`, CI fail na
> niezgodność. Dwie rzeczy do pilnowania, gdy VD-006 ruszy:
> 1. **Niezgodność nazw poziomów:** VD-006 używa `quick-start/intermediate/advanced` (3), nasz
>    schemat RAG (sekcja 0.1, już zaimplementowany) to `quickstart/core/advanced/exhaustive` (4) —
>    będzie potrzebne mapowanie analogiczne do `LEGACY_EXAMPLE_LEVEL_MAP` w `global-indexer.ts`.
> 2. **`global-indexer.ts::gatherExampleChunks()` ma dziś zahardkodowane `SUITES = ["quickstart",
>    "domain-services", "policies"]`** — jeśli VD-006 przebuduje strukturę `examples/` (np. na
>    `examples/<feature>/NN-*.ts` + `examples/combinations/<a>+<b>/`, jak zakładał ten plan), ten
>    kod trzeba przepisać na dynamiczne odkrywanie katalogów (już przewidziane w oryginalnym planie
>    0.1, krok 5, ale niezrobione). Warto też rozważyć konsumowanie matrixa z VD-006 jako ground-
>    truth dla `combines`/`level` zamiast dzisiejszego wnioskowania przez LLM przy ekstrakcji.

### 0. RESEARCH (przed seedem — zgłoszone przez usera 2026-07-03): korpus konceptów @vytches/ddd
Obecne `library_reference_global` = tylko PRZYKŁADY użycia (129 chunków). Brak wiedzy o API
surface i semantyce modułów biblioteki — dowody: bug VB-003 (forFeature DI wiring — implementerzy
nie znają rejestracji handlerów local-vs-global bus), historyczny ANTI-SPOOF (stara sygnatura
z training data). Research ma rozstrzygnąć PRZED seedem:
- [x] **Co seedować** (patrz R1 poniżej): publiczne API (`.d.ts` + JSDoc) + docs/README + kurowane
      noty konceptowe z repo vytches-ddd — raczej NIE surowe internals (ryzyko: agent uczy się
      deep-importów, antywzorzec widziany w feature-handler-registrar.ts).
- [x] **Model treści** (R2): `kind: concept|api` w istniejącej kolekcji (schema ma kind/tags/level)
      vs osobna kolekcja; rozszerzenie `vytchesLevels` o koncepty mniej/bardziej zaawansowane.
- [x] **Wersjonowanie chunków** (R3): `lib_version` w payload + reseed przy release biblioteki
      (spięcie z pinem knowledge-pins.json, sekcja 1).
- [x] **Golden-set biblioteczny** (R4): zapytania o API/koncepty (np. rejestracja handlera w
      forFeature, sygnatura PolicyBuilder.must) — eval PRZED wpięciem, próg jak w RAG-002.
- [x] **Routing** (R5): kiedy implementer pyta RAG o bibliotekę vs czyta node_modules — reguła
      decyzyjna do sekcji decision-rule implementerów.
- [x] **Auto-reseed globalnych kolekcji** (R6) przy zmianie `patterns/**` (dziś ręczny `seed:global`
      — ta sama klasa dyscypliny, która zawodzi; hook freshness obsługuje tylko kod projektów).

#### 0. DECYZJA PODZIAŁU ODPOWIEDZIALNOŚCI (user, 2026-07-03)
User zauważył: `LLMGUIDE.md` (19 plików) NIE mają 100% pokrycia wszystkich use-case'ów — luka
istnieje. **Rozstrzygnięcie: uzupełnienie treści (LLMGUIDE.md bogatsze/pełniejsze per paczka)
NIE jest zadaniem tego repo** — to osobny task/agent PO STRONIE REPO `vytches-ddd`, tam już
tworzony, prowadzony przez agentów, którzy znają bibliotekę lepiej (autorstwo treści).
**claude-patterns buduje WYŁĄCZNIE infrastrukturę-odbiorcę**: schema (`kind:concept|api`,
`lib_version`), model wersjonowania/pinningu (sekcja 1), model łączenia elementów/kombinacji
(wspólny z `combines`/tags sekcji 0a — jeden model łączenia dla examples I concepts, nie dwa
osobne), i pipeline seedu, który przyjmie cokolwiek `vytches-ddd` wyprodukuje (dziś i po
wzbogaceniu). **Konsekwencja dla kolejności:** infra (schema + pipeline) może i powinna powstać
NIEZALEŻNIE od stanu treści — nie czekamy na 100% pokrycia LLMGUIDE.md, żeby zacząć budować
odbiorcę. Pierwszy realny seed i eval golden-setu (R4) i tak poczeka na wystarczające pokrycie
treści po stronie vytches-ddd, ale to nie blokuje prac schematowych tutaj.

#### 0.1 PLAN SCHEMATU (2026-07-03) — wspólny model `feature`/`combines` dla example I concept/api
Zakres: `mcp-server/knowledge-retriever/src/{types,schema,store-qdrant,markdown-chunker,
global-indexer,index}.ts`. Status: **ZAIMPLEMENTOWANE I ZASEEDOWANE (2026-07-03)** — patrz
"0.2 IMPLEMENTACJA + SEED" poniżej dla szczegółów wykonania (odbiegają miejscami od tego planu,
głównie w punkcie ekstrakcji `concept`/`api` — zamiast parsera frontmatter w `markdown-chunker.ts`
użyto ekstrakcji przez agenty LLM do plików JSON, patrz niżej dlaczego).
Model wspiera JEDNĄ kolekcję `library_reference_global` (R2) niezależnie od `kind`.

**Zmiany pól `Chunk`/`Hit` (`types.ts`):**
| Pole | Dziś | Propozycja | Uzasadnienie |
|---|---|---|---|
| `kind` | `code\|rule_card\|example\|anti_pattern` | + `concept`, `api` | R2 |
| `level` | `simple\|medium\|complex`, TYLKO examples, ręczna mapa `global.config.json::vytchesLevels` | `quickstart\|core\|advanced\|exhaustive` — WSPÓLNY enum dla `example` I `concept` | zgodne z decyzją sekcji 0a; `recreate()`-model (pełny rebuild kolekcji) = zero potrzeby migracji starych wartości, po prostu nowy enum od następnego seedu |
| `feature` (NOWE) | brak | `string` — pierwotna paczka/feature (np. `"policies"`, `"aggregates"`, `"domain-services"`) | zastępuje ad-hoc `SUITES=["quickstart","domain-services","policies"]` w `global-indexer.ts`, które dziś myli "poziom" z "nazwą katalogu"; 1:1 z nazwą paczki `@vytches/ddd` |
| `combines` (NOWE) | brak | `string[]` — inne feature'y, GDY chunk pokazuje kombinację (np. `feature:"policies"`, `combines:["events"]`) | dokładnie `combines: []` z JSDoc `@example-meta` sekcji 0a — TEN SAM model rozszerzony na `concept` (LLMGUIDE.md też opisuje kombinacje) |
| `lib_version` (NOWE) | brak | `string` — JEDNA wartość na cały seed-batch (Lerna fixed-mode, R3) | sekcja 1 (wersjonowanie) + demo "current vs latest" (success_criteria) |
| `tags` | wolny worek (nazwa biblioteki + stack + nazwa wzorca — różne znaczenie per kolekcja) | BEZ ZMIAN, ale przestaje dźwigać feature/combination — te mają teraz własne pola | rozdziela odpowiedzialności: `tags`=klasyfikacja/facetowanie ogólne, `feature`/`combines`=ustandaryzowany model kompozycji |

**Kontrakt wejściowy per typ źródła:**
- **example** (vytches-ddd, sekcja 0a): JSDoc `@example-meta` nagłówek pliku (`feature`, `level`,
  `combines: []`), katalogi `examples/<feature>/NN-*.ts` + `examples/combinations/<a>+<b>/`.
  `buildExamplesIndex()` przestaje czytać `global.config.json::vytchesLevels` (do wycofania) —
  parsuje meta wprost z pliku.
- **concept** (LLMGUIDE.md, ta sekcja): analogiczny nagłówek, ale w markdown — YAML frontmatter
  na górze pliku (`feature: <pkg>`), per-sekcji H2 opcjonalny override `level:` (np. "Quick
  Start"→quickstart, "Key API"→core, dedykowana sekcja "Combinations"/"Integration"→ wypełnia
  `combines`). Wymaga rozszerzenia `markdown-chunker.ts` o parser frontmatter (dziś tylko
  `tagsFromPath()` + split po H2/H3).
- **api** (`.d.ts`+JSDoc): `feature`=nazwa paczki (katalog), `level` domyślnie `"core"`,
  `combines` zwykle puste — najprostszy z trzech, mała dodatkowa logika.

**Zmiany w kodzie (do wykonania PO zatwierdzeniu planu):**
1. `types.ts` — `ChunkKind` +2, nowy enum `level`, `Chunk`/`Hit` +`feature`+`combines`+`lib_version`.
2. `schema.ts` — `PAYLOAD_INDEX_FIELDS` +`feature`+`lib_version` (+`combines`, jeśli chcemy
   filtrować po kombinacji — keyword-index na tablicy wspiera match-any w Qdrant).
3. `store-qdrant.ts` — `toHit()`+`add()` payload mapping +3 pola (mechaniczne, symetryczne).
4. `markdown-chunker.ts` — parser frontmatter (`feature`) + per-sekcja `level`/`combines`
   override, obok istniejącego `tagsFromPath()`.
5. `global-indexer.ts` — `buildExamplesIndex()` czyta `@example-meta` z plików zamiast
   `loadLevelMap()`; dynamiczne odkrywanie `examples/<feature>/` zamiast stałego `SUITES`;
   NOWE `buildConceptsIndex()` (LLMGUIDE.md + llm-context.md, kind=concept) i `buildApiIndex()`
   (`.d.ts`, kind=api) — obie piszą do TEJ SAMEJ kolekcji `library_reference_global`.
6. `index.ts` (MCP tools) — `retrieve_examples`: rozszerzyć `kind` enum o `concept`/`api`,
   `level` enum na nowy, dodać opcjonalne filtry `feature`/`combines`/`lib_version`;
   zaktualizować opis (dziś mówi tylko o "examples simple/medium/complex").

**Rozstrzygnięcia pod-pytań (user, 2026-07-03):**
- **Nazwa tool:** zostaje `retrieve_examples` — bez rename, opis+enum tylko rozszerzone.
- **`combines`:** zostaje OSOBNE pole (nie prefiks w `tags`). Doprecyzowanie semantyki pod kątem
  zrozumiałości dla konsumenta (agenta wywołującego tool) — user zwrócił uwagę, że samo pole nie
  wystarczy, liczy się jak jest UŻYWANE przy zapytaniu:
  - `feature` = pierwotny/kotwiczący feature chunka (1:1 z nazwą paczki). `combines` = pozostałe
    feature'y, które TEN SAM chunk demonstruje razem z `feature` (puste/brak = chunk
    jednofunkcyjny). Przykład: przykład łączący policy+event → `feature:"policies"`,
    `combines:["events"]`.
  - **Kluczowa decyzja projektowa (unika pułapki "szukam po drugiej stronie kombinacji i nic nie
    znajduję"):** filtr `feature` w `retrieve_examples` NIE sprawdza wyłącznie pola `feature` —
    dopasowuje chunk, gdy wartość filtra występuje w `feature` **LUB** w `combines` (Qdrant
    `should`, nie osobny 3-ci pole typu `allFeatures` — unika duplikacji danych, wystarczy
    smart filter-builder w `index.ts`/`store-qdrant.ts`). Efekt dla konsumenta: pytanie o
    "policies" zwraca ZARÓWNO czyste przykłady policy, JAK I kombinacje policy+events, bez
    konieczności zgadywania czy dany feature był "główny" czy "poboczny" w danym chunku.
  - `feature`/`combines` w wyniku (`Hit`) są nadal zwracane osobno (nie spłaszczone) — konsument
    widzi w metadanych, co było kotwicą, a co dołączonym elementem kombinacji; to wspiera macierz
    pokrycia z sekcji 0a (featureA×featureB jako odhaczalna komórka).
  - Dokumentacja w kodzie (do wpisania przy implementacji): JSDoc/komentarz przy `combines` w
    `types.ts` wprost z przykładem `feature:"policies", combines:["events"]` + adnotacja w opisie
    zod-param `feature` w `index.ts` ("matches this chunk's primary feature OR any feature it's
    combined with — see `combines`").

#### 0.2 IMPLEMENTACJA + SEED (2026-07-03) — WYKONANE

Wszystkie pliki `LLMGUIDE.md` w vytches-ddd zostały zaktualizowane po stronie tamtego repo (osobny
task VD-007, poza zakresem claude-patterns) — user potwierdził "up-to-date" i dał zielone światło
na realny seed. Zrealizowano:

**Kod (kroki 1-3, 6 z planu 0.1 — bez zmian względem planu):**
- `types.ts`: `ChunkKind` +`concept`+`api`; `level` → `quickstart|core|advanced|exhaustive`;
  `Chunk`/`Hit` +`feature?`+`combines?`+`lib_version?`.
- `schema.ts`: `PAYLOAD_INDEX_FIELDS` +`feature`+`combines`+`lib_version`.
- `store-qdrant.ts`: `toHit()`/`add()` payload mapping +3 pola.
- `index.ts`: `retrieve_examples` — `kind`/`level` enum rozszerzone, nowe param `feature`
  (OR-match `feature`↔`combines` przez Qdrant `should`, patrz `buildFilter()`) + `lib_version`;
  opis narzędzia zaktualizowany.

**Odstępstwo od planu (krok 4-5 — `markdown-chunker.ts` + `global-indexer.ts`):** plan zakładał
mechaniczny parser frontmatter (`feature:` na górze pliku + per-sekcja `level:`/`combines:`
override) w `markdown-chunker.ts`. W praktyce user (przy realnym czytaniu `validation/LLMGUIDE.md`)
zdecydował inaczej: `Anti-Patterns`/`Hidden Features` w LLMGUIDE.md używają pogrubionych akapitów
(nie nagłówków H3), a `Key API` to tabela — żaden z nich nie mapuje się czysto na H2/H3-split,
którym żyje `markdown-chunker.ts`. Zamiast rozbudowywać kruchy mechaniczny parser, user polecił
klasyfikację przez samego Claude'a (agenty LLM), nie przez regex. Wykonano jako:
1. 20 równoległych agentów (`general-purpose`) — jeden per paczka (19) + jeden dla
   `docs/llm-context.md` — czyta `LLMGUIDE.md`, klasyfikuje na chunki (Key API row→`api` per wiersz,
   Anti-Patterns/Hidden Features→pogrubiony-akapit-per-chunk, Patterns→`concept` per `### Pattern N`,
   Purpose+Quick Start→jeden chunk `Overview`), zapisuje jako JSON do
   `mcp-server/knowledge-retriever/data/library-reference/<pkg>.json` (commitowany artefakt w repo,
   NIE efemeryczny — patrz uzasadnienie niżej).
2. `global-indexer.ts`: `buildExamplesIndex()` → przemianowane na `buildLibraryReferenceIndex()`,
   które łączy TS-examples (stare `simple/medium/complex` z `global.config.json::vytchesLevels`
   przemapowane 1:1 na nowy enum: simple→quickstart, medium→core, complex→advanced) +
   `loadConceptChunks()` (czyta JSON-y z `data/library-reference/`) w JEDNYM `recreate()+add()`
   (recreate() czyści całą kolekcję — nie da się seedować dwóch źródeł do tej samej kolekcji
   osobnymi wywołaniami bez utraty pierwszego).
3. `markdown-chunker.ts` dostał tylko eksport `slugify()` (reużyty do generowania stabilnych `id`
   dla chunków z JSON) — BEZ parsera frontmatter, bo nie jest już potrzebny.
4. Osobny `buildApiIndex()` nad plikami `.d.ts` — POMINIĘTY (decyzja usera): Key API table z
   `LLMGUIDE.md` jest już kurowanym źródłem `kind=api`, drugi pipeline tworzyłby drugie źródło
   prawdy podatne na drift.

**Czemu JSON w repo, nie prosto do Qdranta:** ekstrakcja LLM jest kosztowna i niedeterministyczna —
JSON to zamrożony, wersjonowany wynik tej pracy (audytowalny, diffowalny, reużywalny bez ponownego
odpalania 20 agentów przy każdym re-seedzie/zmianie embeddera/resecie Qdranta). Dokładnie ten sam
wzorzec co `patterns/**/*.md` dla `patterns_global` — treść żyje jako plik w repo, Qdrant jest
w pełni odtwarzalną pochodną.

**Wyniki:**
- Walidacja strukturalna 20 plików JSON: **853 chunki, 0 błędów** (schemat pól, enumy `kind`/`level`,
  spójność `feature`==nazwa pliku, `combines` tylko znane nazwy paczek).
- Seed `library_reference_global`: **982 chunki** (853 concept/api/anti_pattern + ~129 TS-example),
  wszystkie ostemplowane `lib_version:"0.30.0"` (Lerna fixed-mode, `lerna.json`).
- `migrate.js --collection library_reference_global` — payload-indeksy `feature`/`combines`/
  `lib_version` założone.
- Sanity-check: `retrieve_examples({query:"combine specifications with AND/OR", feature:"validation"})`
  zwrócił poprawnie ZARÓWNO chunk z `feature:"validation"`, JAK I chunk z `docs/llm-context.md` bez
  `feature`, ale z `combines:["validation"]` — potwierdza działanie OR-match.
- Ciekawe znalezisko: `di` miał udokumentowany bug (stare nazwy `IContainer`/`Lifetime`/
  `ContainerError`) — agent ekstrakcji potwierdził, że w aktualnym pliku już naprawione, nic do
  korekty.

**Status repo:** zmiany w kodzie (`types.ts`, `schema.ts`, `store-qdrant.ts`, `index.ts`,
`global-indexer.ts`, `markdown-chunker.ts`) + nowy katalog `data/library-reference/` — NIEZACOMMITOWANE,
czekają na review usera.

#### 0.3 EVALE REGRESJI (2026-07-03) — WYKONANE

Dwa evale L1 (deterministyczne), oba w `tests/flow-evals/`:

1. **`retrieval/` (rozszerzony)** — semantyczny hit@K na golden-secie zapytań. Rozszerzenie: nowe
   pola `filter` (kind/level/feature MUST) i `expect_section` (substring na `hit.section`, potrzebne
   bo wiele chunków `concept`/`api` dzieli ten sam `source` = plik `LLMGUIDE.md`). **Wykryto realną
   regresję** przed poprawką: zapytania o konkretny plik-przykład (`E01`/`E02`/`E04`) zaczęły trafiać
   w treść `LLMGUIDE.md` zamiast we właściwy `.ts`, bo nowe 853 chunki konkurują semantycznie w tej
   samej kolekcji. Poprawka: przypięcie `filter:{kind:"example"}` w tych zapytaniach (to jest właśnie
   powód, dla którego dodaliśmy filtr `kind` — konsument który chce URUCHAMIALNY kod musi go użyć).
   Dodano 6 nowych zapytań (`C01`-`C06`) testujących `kind=api/concept/anti_pattern` +
   `level`/`feature`. Wynik po poprawce: **hit@5 = 0.85** (z 0.65 przed poprawką), wszystkie C01-C06
   trafiają w rank 1-2. (P06/P07/P14/P15 nadal MISS w `patterns_global` — preexistujący brak sprzed
   tej sesji, niezwiązany z RAG-003.)
2. **`library-reference-schema/` (nowy)** — czysto strukturalny, BEZ embeddera (tylko `count()` do
   Qdranta): dokładne liczności `kind`/`level` (snapshot 982/215/547/91/129 i 85/441/136/320),
   invarianty (`lib_version`/`tags` 100% wypełnione), i podłoga OR-match `combines` dla 3 paczek
   (walidacja, events, cqrs) — dokładnie ten sam filtr, którego używa `retrieve_examples({feature})`.
   Wszystkie 14 sprawdzeń: **PASS**.

Oba evale re-runowalne przy każdym przyszłym re-seedzie (`node tests/flow-evals/retrieval/run.js` /
`node tests/flow-evals/library-reference-schema/run.js`) jako bramka regresji. Nie zainstalowano
żadnych zewnętrznych pakietów eval — istniejąca konwencja repo (deterministyczne scorery, zero
zależności) okazała się wystarczająca i rozszerzalna.

#### 0. WYNIKI RESEARCHU (2026-07-03) — PROPOZYCJE, czekają na potwierdzenie usera

**R1 — Co seedować:** 19 paczek w `packages/*`, 303 pliki `.d.ts` (186×`@example`, 615×`@param`).
JSDoc nad `packages/nestjs/src/vytches-ddd.module.ts:190-222` (`forFeature()`) i
`packages/nestjs/src/constants.ts:50-82` (`LOCAL_EVENT_BUS`/`GLOBAL_*_BUS`) adresuje **wprost**
VB-003. Biblioteka ma już własną strategię "LLM-first docs" (`docs/adr/0026`): 19×
`LLMGUIDE.md` (3619 linii) + `docs/llm-context.md` (722 linie) — gotowy, kurowany materiał
`kind:concept`, prawie zero dodatkowej kuracji. `examples/` w repo źródłowym jest czyste (zero
deep-importów, tylko publiczne barrele) — anti-pattern deep-import to incydent z projektu-
-konsumenta, nie z tego repo (potrzebuje osobnej kuracji w sekcji 0a, nie stąd).
→ **Seedować**: `.d.ts`+JSDoc z `dist/` per paczka (`kind:api`) + `LLMGUIDE.md`/`llm-context.md`
(`kind:concept`) + root `README.md`. **NIE seedować**: `docs/README.md` (stały ~3mc vs release),
`docs/adr/*` hurtowo (wewnętrzne decyzje biblioteki, nie API-facing), surowe `src/`.

**R2 — Model treści:** `ChunkKind` w `mcp-server/knowledge-retriever/src/types.ts:3` to dziś
`"code"|"rule_card"|"example"|"anti_pattern"` — **`concept`/`api` NIE istnieją jeszcze**,
założenie zadania było nieaktualne. Infra (`PAYLOAD_INDEX_FIELDS`, keyword-index na `kind`) już
wspiera dodanie wartości bez zmiany schematu Qdrant. Wolumen mały (19 paczek, ~150-250 chunków
po chunkowaniu) — nie uzasadnia osobnej kolekcji.
→ **Rozszerzyć `ChunkKind`** o `"concept"|"api"`, zostać przy jednej kolekcji
`library_reference_global`. Do rozstrzygnięcia przy okazji: `level` w `types.ts:15` to
`"simple"|"medium"|"complex"`, INNE nazewnictwo niż `quickstart|core|advanced|exhaustive` z
sekcji 0a — ujednolicić albo trzymać osobny enum per `kind`.

**R3 — Wersjonowanie:** Lerna **fixed-mode** (`docs/CONVENTIONS.md:29`, potwierdzone: wszystkie
19 `package.json` = `0.30.0`) — jedna wersja dla całej biblioteki, nie per-paczka. Git tagi
`vX.Y.Z` spójne od `v0.27.0`.
→ **`lib_version` jednowartościowy dla całego batcha seedu**, spięty z git tagiem. Wymaga
dodania pola `lib_version` do `Chunk`/`Hit` w `types.ts` (dziś brak) — ten sam mechanizm pinningu
co sekcja 1 (`knowledge-pins.json`), inny "konsument" (biblioteka zewnętrzna, nie pattern).

**R4 — Golden-set biblioteczny (7 par, z lokalizacją prawdy):**
1. forFeature local-vs-global bus → `packages/nestjs/src/vytches-ddd.module.ts:190-222` +
   `docs/adr/0034-per-context-cqrs-bus-isolation.md` (**wprost VB-003**)
2. Local event bus injection → `packages/nestjs/src/constants.ts:50-54`
3. Global query/command bus z ACL service → `packages/nestjs/src/constants.ts:56-82`
4. `PolicyBuilder.must()` sygnatura → `packages/policies/src/builders/policy-builder.ts:65-68`
   + `packages/policies/LLMGUIDE.md:1-60`
5. OR-group w policy → `packages/policies/dist/builders/policy-builder.d.ts` (~linia 58)
6. Dlaczego CommandBus routing psuje się przy identycznych nazwach klas → `docs/adr/0034`
   sekcja "Root Cause" (keying po `constructor.name`)
7. Custom typed `EntityId` → `packages/contracts/src/domain/entity-id.implementation.ts:70`
   + `packages/aggregates/src/core/aggregate-root.ts:114`
   Każda para wymaga evalu przed wpięciem (próg jak RAG-002, hit@5≥0.85).

**R5 — Routing (RAG vs node_modules bezpośrednio):**
Pytaj RAG gdy: stabilne publiczne API z barrela, koncept/mechanizm z ADR/LLMGUIDE, wzorzec
kombinacji feature'ów (domena sekcji 0a). Czytaj `node_modules/@vytches/*` bezpośrednio gdy:
dokładna sygnatura w WERSJI PRZYPIĘTEJ projektu (RAG może serwować `latest`≠`current-in-project`
— to dokładnie mechanizm ANTI-SPOOF), wewnętrzna implementacja poza barrelem (deep-import — samo
w sobie anti-pattern, nie zachęcać), debugging zachowania w konkretnej zainstalowanej wersji.
→ **Reguła twarda**: jeśli `lib_version` chunka ≠ wersja w `package.json` konsumenta, agent
MUSI zweryfikować przez `node_modules/.../dist/*.d.ts` zamiast ufać RAG.

**R6 — Auto-reseed:** 8 GH Actions w vytches-ddd (`ci.yml`, `release.yml`, `github-release.yml`,
...). Release **ręczny z premedytacją** ("Manual releases only — enterprise best practice",
`docs/CONVENTIONS.md:16-17`: Claude uruchamia TYLKO `pnpm lerna version --yes`).
`github-release.yml` (trigger: `push tags v*`) to techniczny punkt zaczepienia dla przyszłego
webhooka, ale żyje w repo vytches-ddd, nie claude-patterns — dziś **brak jakiegokolwiek** hooka
nasłuchującego release'y stąd.
→ **Na start: ręczny krok**, ale dodać do `docs/RELEASE-GUIDE.md` w vytches-ddd checklistę
"reseed library_reference_global w claude-patterns" (ta sama klasa dyscypliny co dziś
`seed:global` — nie polegać na pamięci bez wsparcia narzędziowego). Docelowo: krok w
`github-release.yml` → webhook/cron w claude-patterns pollujący tagi. Nowa infra, NIE blocker
na wejście do seedu MVP.

**Kluczowe pliki referencyjne:** `docs/adr/0034-per-context-cqrs-bus-isolation.md` (VB-003),
`docs/adr/0026-llm-first-documentation-strategy.md` (uzasadnienie LLMGUIDE.md),
`packages/*/LLMGUIDE.md` (19 plików), `docs/CONVENTIONS.md:29` (fixed-versioning),
`.github/workflows/{release,github-release}.yml` (auto-reseed hook points) — wszystkie w
`/opt/projects/vytches-ddd`; `mcp-server/knowledge-retriever/src/{types,schema}.ts` w
claude-patterns (zmiany schematu wymagane: `ChunkKind` +`concept`+`api`, `Chunk`/`Hit`
+`lib_version`).

### 1. Wersjonowanie implementacji (Q5)
- [ ] Chunk dostaje `version` + `lib_version` + `status` (`current│deprecated│latest`).
- [ ] Pin per-projekt: **`.claude/config/knowledge-pins.json` W REPO PROJEKTU** — git-tracked,
      wersjonowany razem z kodem, który pinuje, przechodzi przez review.
- [ ] Retrieve zwraca **oba** warianty (current-in-project vs latest) z notką breaking-change →
      agent proponuje, człowiek decyduje.

> **⚠️ NOTATKA HANDOFF (2026-07-03, przed nową sesją) — NIEROZWIĄZANE NAPIĘCIE ARCHITEKTONICZNE:**
> `lib_version` (JEDNA wartość na cały seed-batch) już istnieje w `types.ts`/seedzie od sekcji 0.2 —
> ale to NIE wystarcza do "current vs latest", bo cały model seedowania to **`recreate()`** (pełne
> `deleteCollection`+`createCollection` w `store-qdrant.ts::recreate()`, wołane przez
> `global-indexer.ts::buildLibraryReferenceIndex()`/`buildPatternsIndex()` na starcie KAŻDEGO
> seedu) — **żadna historia wersji nie jest dziś przechowywana**, nowy seed usuwa poprzedni
> całkowicie. Zanim ruszy implementacja sekcji 1, trzeba ROZSTRZYGNĄĆ jedno z (research potrzebny,
> nietknięty w tej sesji):
> - **(a) multi-wersja w tej samej kolekcji** — `recreate()` przestaje być pełnym wipe'em; zamiast
>   tego seed usuwa/nadpisuje TYLKO chunki danej `lib_version`, stare wersje zostają obok (rośnie
>   rozmiar kolekcji liniowo z liczbą wersji, potrzebny mechanizm retencji/GC starych wersji).
> - **(b) osobne kolekcje per-wersja** (np. `library_reference_global_v0_29_0`) — konflikt z
>   obecnym założeniem "jedna kolekcja, filtrowanie przez pole" (schema.ts `COLLECTION_REGISTRY`).
> - **(c) bez trzymania starych embeddingów wcale** — "latest" = dzisiejszy seed (jak teraz),
>   "current"/pinned = tylko METADANE (numer wersji + odsyłacz do CHANGELOG.md/git tag w
>   vytches-ddd), "breaking change note" generowana z prozy changeloga, nie z diffu embeddingów.
>   Najtańsze, ale nie daje realnego retrievalu treści starej (pinniętej) wersji — tylko opis.
>
> Żadna opcja nie została jeszcze wybrana. To pierwsza rzecz do zrobienia w nowej sesji, ZANIM
> zacznie się pisać `knowledge-pins.json`/kod — inaczej ryzyko zaimplementowania czegoś, co trzeba
> będzie przerabiać po wyborze modelu. Kontekst poprzedniej sesji (seed/evale/review sekcji 0):
> patrz 0.1/0.2/0.3 wyżej + pamięć `rag-restructure-approved-2026-07.md`.

### 2. best_practices_<project> — deterministyczna bramka (D5)
- [ ] Bramka wejścia: AST `/conformance-check` (zero HARD-RULE) + stabilność git (N dni bez
      rewertu; N = parametr) + proweniencja (commit sha + timestamp).
- [ ] **Inwalidacja:** chunk niesie hash wersji Rule Carda; zmiana karty → re-run bramki nad
      kolekcją (inaczej kolekcja dryfuje od aktualnych reguł).
- [ ] **Sygnał negatywny:** wykluczaj pliki dotknięte później commitami `fix:`/revert.
- [ ] **Zasilanie:** job post-commit/cron, NIE hook postwrite (okno stabilności i tak wymaga
      czasu; bramka AST na każdym Write byłaby kosztowna).

### 3. Multi-stack infra (D4)
- [ ] Schema stack-agnostyczna (pola `stack`/`framework`/`layer` już w `types.ts`) — bez zmian
      schematu przy dodaniu flutter/shared-lib.
- [ ] Seed + eval na start TYLKO nestjs-ddd; inne stacki później.

### 4. Storage (D3)
- Qdrant zostaje (semantyka). Redis ODRZUCONY (wąskie gardło to pętle agentów, nie latencja
  retrievalu). Postgres TYLKO gdy pin JSON zacznie wymagać zapytań relacyjnych — nie spekulacyjnie.

## Kryterium sukcesu (success_criteria filar 3)
Demo „current vs latest" na jednym realnym wzorcu: pin w repo projektu, retrieve zwraca oba
warianty z notką breaking-change.
