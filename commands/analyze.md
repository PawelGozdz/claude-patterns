---
name: analyze
description: |
  Generyczna faza RESEARCH/ANALIZY sterowana kompozycją bloków (ADR 0008).
  Czyta .claude/config/runtime.yml (bramka: brak pliku = odmowa startu), odpala
  panel advisory ze slotów bloków (aktywacja warunkowa `when:`), pisze artefakt
  analizy i kończy wg `analyze.exit` (PAUSE = twarda bramka approval, wnosi ją
  blok ddd/core). NIGDY nie implementuje.

  Usage: /analyze <TASK-ID> [--resume]
tools: Task, Read, Write, Edit, Grep, Glob, Bash
disallowedTools: MultiEdit, NotebookEdit
---

# /analyze — research sterowany runtime.yml (silnik szkielet+sloty)

**ZERO IMPLEMENTACJI.** Silnik nie zna żadnego stacku — wszystko, co stackowe, przychodzi
z `runtime.yml`.

Ten plik jest **rejestrem reguł**. Uzasadnienia (incydenty, daty, koszty) mieszkają
w `docs/decisions/orchestrate-rule-history.md`, sekcja „reguły ANL".

## Przebieg

```
0.  bramka runtime.yml → bez pliku i bez schema_version: 1 nie startujesz
0.a preflight drzewa   → git status/log: czego już nie trzeba robić
0.b dobór materiału    → wzorce + karty, RAG, karty decyzji, indeks decyzji
0.d kanon na żywo       → resolve-params.mjs: globy parametrów rozwijane teraz, nie z migawki setupu (ANL-042)
0.c telemetria: start  → telemetry-emit run-start (best-effort, niżej)
1.  panel              → sloty z analyze.panel W KOLEJNOŚCI, agenci jako LIŚCIE
1.a kontrola decyzji   → przesłanki (ANL-049) · karty (ANL-050) · wynik częściowy (ANL-051)
1.b otwarte pytania    → tylko z `analyze.resolve` (ANL-054..056, 060, niżej)
2.  artefakt           → project-orchestration/analysis/{TASK-ID}.analysis.md (jedyny Write)
2.a frontmatter        → verify-answer-sources.mjs <artefakt> --check-frontmatter, ZAWSZE (ANL-061)
3.  wyjście            → analyze.exit: PAUSE = STOP i czekaj na człowieka
3.a telemetria: koniec → telemetry-emit run-end (przed STOP z kroku 3)
3.b/3.c pytania, odpowiedź, utrwalenie → niżej (ANL-040/057/058)
4.  zgłoszenia         → odstępstwa MASZYNY do skrzynki claude-patterns (best-effort, niżej)
5.  zalążek wpisu      → temat wart wpisu → blog-seed-emit (best-effort, w tle, niżej)
```

## Telemetria przebiegu (best-effort, nie blokuje)

Panel to agenci narzędzia Agent, niewidoczni dla hooka metryk Workflow; bez tego kroku analiza nie zostawia danych (ADR 0012). Dwa wywołania i znacznik:

**Start** (0.c — po bramce i doborze materiału, PRZED pierwszym agentem panelu). Plan = id
slotów, które panel faktycznie uruchomi (po `when:` i sicie ANL-018), w kolejności:

```
node <claude-patterns>/scripts/telemetry-emit.mjs run-start --process analyze \
  --project {ABSOLUTNA ścieżka korzenia projektu} --task {TASK-ID} --plan "<slot>:panel,<slot>:panel,…"
```


Stdout to `runId` — wpisz go do frontmattera artefaktu jako `telemetry_run: <runId>` i zachowaj
na krok 3.a. `--project` MUSI być ścieżką (nie samą nazwą): hooki dopasowują agentów do przebiegu
po katalogu roboczym.

**Znacznik slotu** (ANL-041). `description` KAŻDEGO agenta panelu zaczyna się od `[slot:<id>]` (klucz slotu z `--plan`),
np. `[slot:security] Ocena ryzyk logowania`; agent bez znacznika (np. pomocniczy Explore) nie jest liczony jako krok panelu.

**Koniec** (3.a — po zapisie artefaktu, PRZED STOP z `analyze.exit: PAUSE`):

```
node <claude-patterns>/scripts/telemetry-emit.mjs run-end --process analyze \
  --project {ta sama ścieżka} --run-id {runId} --outcome <ok|halted|failed>
```

| Wynik | `--outcome` |
|---|---|
| artefakt gotowy, bez PAUSE (`ready`) | `ok` |
| `analyze.exit: PAUSE`, artefakt zapisany i czeka na człowieka | `ok` |
| przebieg przerwany po drodze (np. przed zapisem artefaktu) | `halted` |
| panel nie dał artefaktu (agent padł, bramka wejścia, błąd narzędzia) | `failed` |

PAUSE to zaplanowany koniec, nie awaria (ADR 0015 D5); `halted` zostaje dla przerwań; `--cause` przy `ok` pomijasz.
`run-end` sam dopisuje `skipped`/`unknown`; niezamknięty przebieg zamknie następny `run-start` jako `unknown`.
Błąd wywołania = zdanie w `## Uwagi`.

## Krok 4 — zgłoszenia do skrzynki (best-effort, nie blokuje)

Skrzynkę `claude-patterns/docs/tasks/_inbox/` karmi też analiza, nie tylko `/orchestrate`: błędy kompozycji,
które degradują PO CICHU (np. blokujący stage pominięty, bo inny zapisał jego `output:`).
Zgłaszasz tylko wady **maszyny** (bloki, runtime.yml, wzorce, agenci), nie ryzyka taska (te idą do artefaktu).

| Sytuacja | `--trigger` | `--rule` |
|---|---|---|
| stage dopasowany przez `when`, a pominięty (plik `output:` już istniał, zapisany przez inny stage) | `analyze_gate` | `ANZ-STAGE-SKIPPED` |
| agent ze slotu panelu nie istnieje albo nie zwrócił wyniku | `analyze_gate` | `ANZ-AGENT-MISSING` |
| stage/bramka wymaga pliku, którego w projekcie nie ma (np. `decisions-index.json`) | `analyze_gate` | `ANZ-GATE-INPUT-MISSING` |
| wzorzec z `{PATTERNS}` nie istnieje albo jest w innym języku/stosie niż projekt | `analyze_note` | `ANZ-PATTERN-MISMATCH` |
| kompozycja nie pasuje do taska (brak warstwy na pracę, warstwa obowiązkowa bez pracy) | `analyze_note` | `ANZ-LAYER-MISMATCH` |

```
node <claude-patterns>/scripts/report-deviation.mjs --project {nazwa} --source analyze \
  --trigger <analyze_gate|analyze_note> --rule <ANZ-…> --reason "<co, gdzie, jaki plik/stage>" \
  --task {TASK-ID} [--layer <id warstwy>]
```

Kategorię (`cause`) skrypt wyprowadza z reguły: `ANZ-LAYER-*` → `plan`, `ANZ-PATTERN-*` → `pattern_card`, reszta `ANZ-*` → `config`;
inna przyczyna → `--category <wartość z listy cause>`; `agent_note` bez `--category` to błąd użycia.

To (obok telemetrii) jedyny zapis poza listą zamkniętą niżej — do claude-patterns, nie do projektu. Błąd wywołania = jedno zdanie w `## Uwagi`.

**Co wolno zapisać — lista zamknięta.** Ograniczeniem jest ta lista, nie brak narzędzia:

1. `project-orchestration/analysis/{TASK-ID}.analysis.md` — artefakt analizy;
2. `docs/security/threat-models/TM-{TASK-ID}.md` — gdy odpala się stage `threat-model`;
3. **rejestr threat-modeli** (`docs/security/threat-models/index.md` lub odpowiednik),
   gdy projekt wymaga wiersza per TM.

4. **Po odpowiedzi człowieka (ANL-058)**: tylko ścieżki z configu (`resolution_sink`, `questions_dir`, `question_task_link`), po `resolve-finalize.mjs check-write`.

5. **Sekcja `## 🔒 Security Pre-Analysis` w pliku zadania** — wyłącznie ona (ANL-063).

Nic poza tym — żadnego pliku w `src/`, żadnego taska (poza pkt 4 i 5), żadnego ADR-a.

## Krok 5 — zalążek wpisu blogowego (best-effort, nie blokuje, ADR 0013)

Po zapisie artefaktu (i kroku 3.a) TY oceniasz, czy z analizy wynika temat na wpis (bez osobnego agenta).

1. `node <claude-patterns>/scripts/blog-seed-emit.mjs --project {ABSOLUTNA ścieżka} --check --run-id {runId}` —
   `"enabled": false` → koniec kroku, bez słowa w artefakcie (`skipped` zapisze skrypt). Z odpowiedzi weź `exclude_topics`
   (nie dotykasz) i `artifact_globs` (tych plików nie czytasz na potrzeby zalążka).
2. Podpowiedź: było napięcie (odrzucona alternatywa, zmiana zdania)? jest dowód (ADR, decyzja, metryka)? ktoś
   spoza projektu się nauczy? to nie rutyna (refaktor, podbicie zależności)? Brak tematu to normalny wynik, ale nie
   cisza: `blog-seed-emit.mjs --project {ścieżka} --no-topic --run-id {runId}` i koniec kroku (inaczej lejek nie odróżni
   „oceniono, brak" od „pominięto").
   Okazje: zatwierdzone `decisions[]` (`trigger: decision`), nowy ADR/BDR (`adr`), istotna dyskusja w panelu (`discussion`). Jeden zalążek na temat.
3. Payload wg `<claude-patterns>/schemas/blog-seed-payload-v1.schema.json` zapisz do pliku
   tymczasowego (np. `$TMPDIR`, poza projektem) i wywołaj W TLE:

```
node <claude-patterns>/scripts/blog-seed-emit.mjs --project {ścieżka} --payload <plik.json> --run-id {runId}
```

Treść BOGATA i bezpieczna: co rozważano, odrzucone opcje i dlaczego, niewiadoma w chwili decyzji, przebieg
(czas przeszły), liczby z pochodzeniem, `unknowns` zawsze niepuste. Etykiety: `fact` / `hypothesis` (Twoja) /
`inference` (z odpowiedzi autora). Bez prozy, scen, emocji i cytatów. `source.ref` to PRYWATNY wskaźnik
(np. `{TASK-ID}#decyzja-2`), skrypt go haszuje; identyfikatorów (ścieżki, hashe, ID, repo) nie wpisuj. Routing: test „czy wpis ma sens dla kogoś, kto nigdy nie użyje
produktu?" (tak → `personal`, nie → `product`) + `confidence` (`medium` → podaj `alt_angle` dla
drugiego bloga). Wynik/błąd skryptu nie zmienia artefaktu ani `--outcome`; kod ≠ 0 = jedno zdanie
w `## Uwagi`. Wejściem są tylko artefakty przebiegu — nie transkrypt rozmowy.

## Kroki 1.b, 3.b, 3.c (ANL-054..060)

Gdy `runtime.yml` ma `analyze.resolve` i zostały pytania spoza `MECHANICAL`: wykonaj 1.b, 3.b, 3.c wg `<claude-patterns>/docs/analyze-resolve.md`. Bez `analyze.resolve` pomiń.

## Klasyfikacja decyzji (ANL-047, ANL-048)

Każda decyzja w `decisions[]` i każde pytanie w `open_questions[]` dostaje klasę (`class`) i typ drzwi
(`door_type`). Pola są opcjonalne: artefakt bez nich przechodzi bramki jak dotąd. Klasyfikacja nie zmienia
kontraktu (`status: approved`, `answer: null` blokuje, `analyze.exit: PAUSE`), tylko mówi, co trafia do człowieka.

| `class` | Kiedy | Co robisz |
|---|---|---|
| `MECHANICAL` | jedna sensowna odpowiedź wynika z reguły, wzorca, karty decyzji albo istniejącego kodu | rozstrzygasz sam: wpis w `decisions[]` z `rationale` cytującym źródło. Pytania nie zadajesz |
| `TASTE` | rozsądni ludzie wybraliby różnie (nazwa, kolejność, kompromis koszt/prostota) | propozycja w `decisions[].choice` plus pytanie z `class: TASTE` i `decision: <id>`. Wszystkie TASTE oddajesz człowiekowi RAZEM, w jednej wiadomości |
| `USER_CHALLENGE` | analiza sugeruje zmianę kierunku albo zakresu, który ustalił użytkownik (cel taska, kryteria akceptacji, wcześniejsza odpowiedź, zatwierdzona decyzja) | nigdy sam. `decisions[].choice` zostaje przy kierunku użytkownika; propozycja zmiany żyje wyłącznie w pytaniu z `class: USER_CHALLENGE` |

`door_type: one-way` = trudne do cofnięcia: migracja danych, publiczne API albo kontrakt między serwisami,
usunięcie czegoś, czego nie odtworzy `git revert`, zmiana formatu zapisanych lub wysłanych danych.
`two-way` = cofa się zwykłym commitem. `one-way` ZAWSZE idzie do człowieka, także gdy `class: MECHANICAL`.

Wątpliwość rozstrzygasz w stronę człowieka: MECHANICAL czy TASTE → TASTE; TASTE czy USER_CHALLENGE →
USER_CHALLENGE; `one-way` czy `two-way` → `one-way`.

**Znacznik rekomendacji.** `options: [...]` w JEDNEJ linii (flow: hook `check-human-voice` tnie frontmatter po myślnikach), dokładnie jedna opcja z ` (recommended)` (`\(recommended\)\s*$`); brak tylko gdy `q` mówi, czemu nie ma podstaw do preferencji. `answer` = tekst opcji bez znacznika, nie „ok".

## Rejestr reguł

| ID | trigger | wymagana akcja | mechanizm | ref |
|---|---|---|---|---|
| ANL-001 | cały przebieg | zapisy wyłącznie z listy zamkniętej powyżej; zero implementacji | tylko prompt (`check-delegation` zna tylko pliki źródłowe) | — |
| ANL-002 | dopisanie wiersza do rejestru TM | `Edit` dozwolony wyłącznie do rejestrów z listy; `MultiEdit` zabroniony | frontmatter komendy | [ANL-002](docs/decisions/orchestrate-rule-history.md#anl-002) |
| ANL-003 | szukanie pliku/symbolu | `Grep`/`Glob` do CELOWANEGO szukania; szerokie przeczesywanie deleguj do Explore | tylko prompt | [ANL-003](docs/decisions/orchestrate-rule-history.md#anl-003) |
| ANL-004 | użycie `Bash` | wyłącznie deterministyczne i tylko-do-odczytu (indeks decyzji, `git log`/`status`); żadnych zapisów, instalacji ani testów. Wyjątek: `telemetry-emit`, `report-deviation` (zapis do claude-patterns, nie do projektu); `blog-seed-emit` — zapisuje wyłącznie do `stage/` repo blogów (ADR 0013); `verify-answer-sources`, `resolve-finalize` (zakres: ANL-058) | tylko prompt | — |
| ANL-005 | start | brak `.claude/config/runtime.yml` → STOP; `schema_version ≠ 1` → STOP z poleceniem ponownego setupu | tylko prompt | — |
| ANL-006 | przed rozpisaniem jednostek pracy | `git status --short` + `git log --oneline -15`, oraz ślad zadania POZA bieżącą gałęzią: `git branch -a --no-merged develop`, `git log --all --oneline --grep=<TASK-ID>`, `ls .claude/run-state/<TASK-ID>.*`; trafienie = STOP z pytaniem „kontynuować istniejącą gałąź czy zaczynać od nowa"; potwierdź grepem na KONKRETNYM pliku, że praca nie jest zrobiona; „już zrobione" → `status: already-done` z dowodem, bez jednostki | tylko prompt | [ANL-006](docs/decisions/orchestrate-rule-history.md#anl-006) |
| ANL-007 | panel ma stage `threat-model` | dopasuj `when:` do taska; trafienie + brak pliku TM → uruchom stage i ZAPISZ TM; TM niepokrywający zakresu → ADDENDUM albo blokujące `open_question` | tylko prompt | — |
| ANL-008 | dobór wzorców | `patterns.always` + trafione `triggers` z runtime.yml — to jest CAŁA lista; karty (`*_summary.md`) wstrzykuj do promptów panelu; ścieżki rozwiązuj dosłownie względem `.claude/knowledge/patterns/` — podkatalogi bywają symlinkami, więc `grep -r` i `find` bez `-L` ich nie widzą; sprawdzaj przez `ls <katalog>/` albo `find -L` | tylko prompt (skrypt `orchestrate-prepare.mjs` robi to samo dla fazy implementacji) | — |
| ANL-009 | wywołanie RAG | `collection` bierz z `runtime.yml → knowledge.collection` i wstrzykuj LITERALNIE; nigdy nie konstruuj z nazwy katalogu | tylko prompt | [ANL-009](docs/decisions/orchestrate-rule-history.md#anl-009) |
| ANL-035 | wywołanie RAG (`retrieve_code`) | `source` w wyniku jest ścieżką WZGLĘDNĄ wobec korzenia repo — otwórz ją Readem we własnym drzewie; `evidence` to dowód trafienia z `origin/develop` (`indexedSha`), nie treść do cytowania | tylko prompt (pole `_contract` w odpowiedzi narzędzia, TASK-RAG-004 R1) | [ANL-035](docs/decisions/orchestrate-rule-history.md#anl-035) |
| ANL-010 | artefakt | frontmatter MUSI mieć `rag:` — lista zapytań z liczbą trafień albo `rag: "skipped (powód)"` W CUDZYSŁOWIE (`: ` i ` #` w wartości psują YAML) | `verify-answer-sources --check-frontmatter` (ANL-061) | [ANL-061](docs/decisions/orchestrate-rule-history.md#anl-061) |
| ANL-011 | `stack_blocks` zawiera `ddd/core` | wczytaj trafne karty decyzji, skonsultuj precedens (ścieżkę ADR odkryj wąskim Explore, nie zgaduj slugów); decyzja już zapadła → zastosuj i cytuj | tylko prompt | — |
| ANL-012 | panel ma stage `decision-gate` | odpal `node <claude-patterns>/scripts/index-decisions.mjs <projekt>` — skryptem, nie agentem | skrypt `index-decisions.mjs` | [ANL-012](docs/decisions/orchestrate-rule-history.md#anl-012) |
| ANL-013 | wpis `needs_scope_check: true` | nadal obowiązuje — cytuj pole `scope`; gdy milczy o Twoim parametrze, idź wg `lookup_order` | tylko prompt | [ANL-013](docs/decisions/orchestrate-rule-history.md#anl-013) |
| ANL-014 | wpis `source: proza` | traktuj status jako mniej pewny niż `source: frontmatter` | tylko prompt | [ANL-014](docs/decisions/orchestrate-rule-history.md#anl-014) |
| ANL-015 | `problems.duplicate_ids` | cytując ADR podawaj ścieżkę pliku, nie sam numer | tylko prompt | [ANL-015](docs/decisions/orchestrate-rule-history.md#anl-015) |
| ANL-016 | `problems.missing_status` | brak statusu ≠ nieaktualny — wpis wchodzi jako aktywny, z ostrożnością | tylko prompt | [ANL-016](docs/decisions/orchestrate-rule-history.md#anl-016) |
| ANL-017 | prompt stage'a `decision-gate` | `brief[]` + `entries[]` przefiltrowane do `needs_scope_check: true` + `problems` + `open_questions`; nigdy surowy indeks. Wpisy `needs_scope_check` zawęź do pasujących do tagów taska (`index-decisions.mjs <projekt> --tags <tagi>`; bez tagów zostają); gdy zostaje >15, dziel na DWA sekwencyjne wywołania bramki (każde z pełnym budżetem), nie jedno z limitem | tylko prompt | [ANL-017](docs/decisions/orchestrate-rule-history.md#anl-017) |
| ANL-018 | task `type: refactor\|bugfix\|chore` | pomiń sloty bloku `governance` (`strategy-fit`, `data-classification`) — to sito jest PRZED `when:`; wyjątek: slot z `always_for`, którego warunek task spełnia (ANL-043) | tylko prompt | — |
| ANL-019 | slot ma `corpus:` | nie wklejaj plików kanonu; wąski Explore/haiku zwraca CYTATY z namiarami. `inject:` to osobna półka — krótkie fragmenty wprost, zawsze | tylko prompt | [ANL-019](docs/decisions/orchestrate-rule-history.md#anl-019) |
| ANL-020 | slot ma `when:` | dopasuj do treści/etykiet i **wypisz, KTÓRE słowo trafiło** (przy `when_extra:` także czy z bazy, czy z `when_extra`, ANL-043); trafienie po fragmencie wyrazu bez sensu → pomiń i powiedz to; brak trafienia przy widocznym ryzyku → traktuj jak trafienie i zgłoś lukę w regexie | tylko prompt | [ANL-020](docs/decisions/orchestrate-rule-history.md#anl-020) |
| ANL-021 | slot ma `model:`/`effort:` | wywołaj agenta z tym modelem, nadpisując jego frontmatter; bez tego: zbieranie i odczyt → haiku, przygotowanie i implementacja → sonnet, ocena i synteza → opus | tylko prompt | — |
| ANL-022 | wywołanie slotu | agent jako LIŚĆ: bez `Task` i bez parametru `name` (mailbox gubi wyniki) | tylko prompt | — |
| ANL-023 | każdy prompt panelu | wstrzyknij budżet z `runtime.yml budgets` (domyślnie `max_tool_calls: 15`) i instrukcję oddania częściowego raportu | tylko prompt | — |
| ANL-024 | prompt kolejnego stage'a | spec + karty + STRESZCZENIE poprzednich stage'ów; NIGDY pełny surowy output | tylko prompt | [ANL-024](docs/decisions/orchestrate-rule-history.md#anl-024) |
| ANL-025 | stage przerwany budżetem | jego niezweryfikowane tezy WYŁĄCZNIE jako `open_questions` | tylko prompt | — |
| ANL-026 | synteza | `tech-lead` z `model: opus`; gdy środowisko przerywa liście — syntezę robi główny agent i odnotowuje to w artefakcie | tylko prompt | [ANL-026](docs/decisions/orchestrate-rule-history.md#anl-026) |
| ANL-027 | przed zapisem artefaktu | każdą nazwaną funkcję/klasę/ścieżkę zgrepuj; nie istnieje → jawne „TO TRZEBA STWORZYĆ" | tylko prompt | [ANL-027](docs/decisions/orchestrate-rule-history.md#anl-027) |
| ANL-028 | artefakt | wg `templates/task-analysis-template.md`: `task`, `status`, `threat_model`, `open_questions[]`, `decisions[]`, `patterns[]`, `rag:`, `stack_blocks:`; opcjonalnie klasyfikacja decyzji (ANL-047/048). Odpowiedzi żyją WYŁĄCZNIE we frontmatter | tylko prompt | — |
| ANL-029 | `open_questions[]` i `decisions[]` | `ask` i `means` są OBOWIĄZKOWE, rejestrem z `human_voice` (default: polski, biznesowy, do 2 zdań, bez nazw klas, ścieżek i numerów ADR/BDR, ANL-055) | hook `check-human-voice` (gdy zainstalowany) | [ANL-029](docs/decisions/orchestrate-rule-history.md#anl-029) |
| ANL-030 | pisanie `ask` | test: czy człowiek nieznający kodu odpowie sam? jeśli musi dopytać o nazwę — to jeszcze `q`, nie `ask` | tylko prompt | [ANL-030](docs/decisions/orchestrate-rule-history.md#anl-030) |
| ANL-031 | pisanie `ask` | nie chowaj konsekwencji wyboru — to jest ta część, dla której człowiek czyta pytanie | tylko prompt | [ANL-031](docs/decisions/orchestrate-rule-history.md#anl-031) |
| ANL-036 | rozpisane jednostki pracy | dla KAŻDEJ warstwy z `runtime.yml → orchestrate.layers` sprawdź, czy jakakolwiek jednostka dotyka jej `dirs`; warstwę bez pracy wpisz do `layers_skip: [{ id, reason }]` z powodem cytującym decyzję/jednostkę. Task infrastrukturalny bez zmian w domenie i aplikacji → dwa wpisy, nie zero. `decisions[]` mają pole `choice` — nigdy `decision`/`answer` (prepare odrzuca) | skrypt `orchestrate-prepare.mjs` (bramka: nieznana warstwa, brak `reason`, brak `choice`) | [ANL-036](docs/decisions/orchestrate-rule-history.md#anl-036) |
| ANL-038 | rozpisane jednostki pracy | podział warstwy na obszary → `units: [{ id, layer, dirs, role?, checks?, reason?, repair? }]` (prepare robi z nich pod-warstwy; `repair: true` = jednostka testowa tylko dopasowuje istniejące testy, bramka przyrostu ORC-035 jej nie dotyczy); pliki towarzyszące spoza katalogu zmienianego pliku (setup testów, compose) dopisz do `dirs` jednostki albo `layers_scope`; plików `.env*` tam NIE wpisuj (deny `Read(./.env.*)` blokuje agentom odczyt i zapis): zmiana = krok ręczny po przebiegu (ORC-138); plik wspólny dla kilku jednostek (barrel `index.ts`, rejestr, moduł DI) wpisz do `dirs` KAŻDEJ z nich (remis rozstrzyga ORC-112); `dirs` to ścieżki OD KORZENIA repo — sama nazwa pliku zakresu nie trafia, prepare ostrzega; test obok pliku z tym samym rdzeniem nazwy wchodzi sam; fałszywe trafienia keywordów → `patterns_exclude: [<ścieżka>]`; decyzja, która PRZENOSI, przemianowuje albo usuwa eksport, wymaga w `dirs` także plików go importujących (poza zakresem agent ich nie ruszy, ORC-042, a lint psuje się dopiero po bramce końcowej); to samo przy usunięciu lub zawężeniu pola, typu albo reguły — konsumenci i testy, które na tym polegają (loader, emitter, testy sąsiedniej jednostki), też do `dirs`; skrypt, który decyzja każe uruchomić po zmianie (np. `test:l3`), → `final_checks: [<skrypt>]` (ORC-121) | skrypt `orchestrate-prepare.mjs` (bramka `units`: nieznana warstwa, brak `dirs`, warstwa w skip/scope, duplikat; ostrzeżenie dla `patterns_exclude`, który nic nie wykluczył) | [ANL-038](docs/decisions/orchestrate-rule-history.md#anl-038) |
| ANL-039 | analiza znajduje drobne rzeczy (literówka w dokumencie, nit, oczywista niespójność), które nie są problemem ani decyzją | wpisz je do `minor_fixes: ["plik — co — poprawka", …]` w artefakcie; `/orchestrate` przekaże je implementerowi warstwy (ORC-091) do mechanicznej naprawy przy okazji; rzeczy wymagające decyzji NIE idą tutaj, tylko do `open_questions`/`decisions` | tylko prompt (prepare czyta pole) | [ORC-091](docs/decisions/orchestrate-rule-history.md#orc-091) |
| ANL-040 | wynik analizy dla człowieka (jedyny format czatu, ADR 0017, także przy wielu analizach naraz) | pokaż TYLKO: (1) `<TASK-ID>: <jedno zdanie biznesowe, co to zmienia w aplikacji albo w pracy zespołu, bez nazw klas>`; (2) `Przyjęte automatycznie: N (cofnij: 1–N, lista w artefakcie)` tylko gdy N>0 (zero = brak linii); (3) pytania dla człowieka: `ask` i `rec` DOSŁOWNIE, dwie linie, bez „Opcje:", najpierw `USER_CHALLENGE`/`one-way`; w `rec` zero znaczników podstawy (canon/precedent/basis…) poza „nowy wzorzec"; (4) JEDNA linia instrukcji dopasowana do stanu, dosłownie z pola `instruction` skryptu `verify-answer-sources`: „ok" tylko gdy wszystkie pytania są `bulkEligible`, inaczej np. „ok 1,2 · 3: odpowiedź" („ok" nie zatwierdza pytań `one-way`/`USER_CHALLENGE`). ZAKAZ w czacie: sekcji meta („Co sprawdziłem", „Odstępstwa"…), narracji o panelu, treści artefaktu i akapitu syntezy, pytań spoza ask/rec: robisz albo pomijasz. Meta-proces → `## Przebieg` artefaktu | hook `check-human-voice`, `verify-answer-sources` (`instruction`) | [ANL-040](docs/decisions/orchestrate-rule-history.md#anl-040) |
| ANL-041 | start i koniec panelu | `run-start` przed pierwszym agentem (plan = sloty, które wejdą), `telemetry_run` we frontmatterze, `run-end` po zapisie artefaktu; opis KAŻDEGO agenta panelu zaczyna się od `[slot:<id>]` | tylko prompt; hooki `telemetry-agent-start`/`-stop` (bez znacznika albo otwartego przebiegu nic nie robią) | [ADR 0012](docs/adr/0012-metryki-przebiegow-zdarzenia-v1.md) |
| ANL-037 | rozpisane jednostki pracy | warstwa dotknięta CZĘŚCIOWO (jeden kontekst z ośmiu, jeden plik enumu) NIE idzie do `layers_skip` (binarny, gubi część pracy) — idzie do `layers_scope: [{ id, dirs: [<ścieżki od korzenia repo>], reason }]`: warstwa wchodzi, implementer/weryfikator/sonda widzą tylko `dirs` | skrypt `orchestrate-prepare.mjs` (bramka: powód skipu z „wyjątek"/„częściowo"/„N z M"/„tylko dla"; scope bez `dirs`/`reason`; warstwa w obu listach) | [ANL-037](docs/decisions/orchestrate-rule-history.md#anl-037) |
| ANL-032 | proza w body artefaktu | `## Synteza` i `## Ryzyka / uwagi` przepuść przez skill `humanizer` przed zapisem | tylko prompt | — |
| ANL-033 | sekcje artefaktu | sekcja tylko od slotu, który faktycznie wszedł; sloty governance dokładają blok `governance:` do frontmattera | tylko prompt | [ANL-033](docs/decisions/orchestrate-rule-history.md#anl-033) |
| ANL-042 | start (krok 0.d), runtime.yml ma `params_globs` | `node <claude-patterns>/scripts/resolve-params.mjs {ścieżka projektu}`; jako `corpus:` slotów używaj pola `live` (stan drzewa TERAZ), nie `params.<blok>.<param>` z runtime.yml (migawka z setupu). `drift: true` → zdanie w `## Uwagi` (co doszło/zniknęło) i zalecenie `materialize-runtime.mjs`; exit 2 (pusty glob/brak pliku) → STOP. Brak `params_globs` → pomijasz | skrypt `resolve-params.mjs` + `verify-project-setup` (ostrzeżenie o rozjeździe) | [ANL-042](docs/decisions/orchestrate-rule-history.md#anl-042) |
| ANL-043 | slot ma `when_extra:` i/lub `always_for:` | `when:` już zawiera `when_extra` (sklejone przy materializacji) — wypisz, skąd trafienie. `always_for: {pole: [wartości]}` — gdy frontmatter taska ma `pole` o jednej z wartości (np. `priority: P0`), slot wchodzi BEZ względu na `when:` i sito ANL-018; wypisz `strategy-fit ← always_for priority=P0`. Task, który warunku nie spełnia, podlega zwykłym regułom | tylko prompt (kształt slotu pilnuje `materialize-runtime.mjs`) | [ANL-043](docs/decisions/orchestrate-rule-history.md#anl-043) |
| ANL-044 | rozpisane jednostki pracy z nowymi testami (L1/L2/L3) | zanim wskażesz katalog testów, sprawdź w configu runnera (`vitest.config.*`, `vitest.workspace.*`, `jest.config.*`, skrypt `test:*`), że jego `include` ten katalog obejmuje; nie obejmuje → decyzja w `decisions[]`: zmiana configu (plik configu do `dirs` jednostki) albo inny katalog. Test spoza `include` jest zielony, bo się nie uruchamia | tylko prompt | [ANL-044](docs/decisions/orchestrate-rule-history.md#anl-044) |
| ANL-045 | rozpisane jednostki pracy dodają handler, provider, guardian, mapper błędów albo schemat tworzenia | do `dirs` jednostki wpisz też plik, który to rejestruje lub wystawia (`*.module.ts`, tablica `providers`, mapper błędów, schemat create), albo rozpisz osobną jednostkę wiringu. Karta CH10 każe implementerowi NIE ruszać pliku spoza zakresu (ORC-042); bez jednostki z tym plikiem rejestracja przepada i aplikacja nie wstaje | tylko prompt | [ANL-045](docs/decisions/orchestrate-rule-history.md#anl-045) |
| ANL-046 | rozpisane jednostki pracy dodają kod błędu domeny, zdarzenie domenowe albo komunikat błędu widoczny w UI | do `dirs` jednostki (albo jednostki wiringu z ANL-045) wpisz też rejestry, które ten element wymagają: enum kodów błędów (`error-codes.ts`), enum nazw zdarzeń (`event-names.enum.ts`), eventMap, mapper błędów kontekstu, composition root (`compose.ts`) i schemat konfiguracji (`config.ts`), gdy wymagają rejestracji albo nowego pola, oraz słownik komunikatów w `apps/web`, gdy strażnik (np. `error-messages.spec.ts`) czyta kody z API. Reguła DE3 chce wpisu w mapperze w tym samym diffie co klasa błędu, a mapper leży w innej warstwie; bez właściciela w planie warstwa kończy BLOCKED_BY_PRIOR albo bramka dostaje czerwony typecheck | tylko prompt | [ANL-046](docs/decisions/orchestrate-rule-history.md#anl-046) |
| ANL-047 | decyzja albo pytanie w artefakcie | nadaj `class` (`MECHANICAL` / `TASTE` / `USER_CHALLENGE`) wg sekcji „Klasyfikacja decyzji": `MECHANICAL` rozstrzygasz sam z `rationale`, `TASTE` oddajesz człowiekowi razem, `USER_CHALLENGE` nigdy sam (`choice` zostaje przy kierunku użytkownika, zmiana tylko jako pytanie). Wątpliwość → klasa bliższa człowiekowi | tylko prompt (pola opcjonalne, `orchestrate-prepare.mjs` ich nie czyta; blokuje jak dotąd `answer: null`) | [ANL-047](docs/decisions/orchestrate-rule-history.md#anl-047) |
| ANL-048 | decyzja albo pytanie w artefakcie | nadaj `door_type` (`one-way` / `two-way`). `one-way` ZAWSZE do człowieka, niezależnie od klasy (pytanie z `decision: <id>`). Pytanie z wyborem ma `options: [...]` w jednej linii i dokładnie jedną opcję z ` (recommended)`; `answer` = tekst opcji. Wątpliwość → `one-way` | tylko prompt | [ANL-048](docs/decisions/orchestrate-rule-history.md#anl-048) |
| ANL-049 | przed zapisem `decisions[]` | przesłankę o kodzie w `rationale` sprawdź celowanym Read/Grep w nazwanym pliku (nie z pamięci ani z opisu taska); zapisz `premises: [{ claim, evidence: "plik:linia", holds }]`. `holds: false` → `premise_failed: true` na decyzji i sparowane pytanie (`decision: <id>`, `answer: null`) | `orchestrate-prepare.mjs` (`premise_failed` albo `holds: false` bez sparowanego, zatwierdzonego pytania: exit 2) + prompt | [ANL-049](docs/decisions/orchestrate-rule-history.md#anl-049) |
| ANL-050 | przed zapisem `decisions[]` | porównaj `choice` z regułami MUST/MUST NOT kart wzorców (ID jak CH5, QP1). Sprzeczność → `card_conflict: [<ID>]` i sparowane pytanie (`decision: <id>`, `options`: „Zatwierdzam wyjątek od <ID>: <powód>" / „Zmieniamy podejście: <jak>"; dla ANL-049 „Zatwierdzam decyzję mimo to: <powód>"). Takiej decyzji nie wpisuj jako rozstrzygniętej; `gap` (karta nie rozstrzyga) to twardy stop (tylko prompt) | `orchestrate-prepare.mjs` (odpowiedź = jedna z `options`, „Zatwierdzam wyjątek/decyzję" z ID reguł; exit 2) + prompt | [ANL-050](docs/decisions/orchestrate-rule-history.md#anl-050) |
| ANL-052 | start analizy: plik `project-orchestration/tasks/<TASK-ID>*.md` nie istnieje (zadanie znane tylko z KANBAN-a albo wcześniejszych analiz) | nie zgaduj zakresu po cichu: pierwsza linia raportu „Brak pliku zadania <TASK-ID>", w artefakcie sekcja „Źródła zakresu" (skąd zakres odtworzono: KANBAN, analizy, polecenie człowieka), w kroku 3 jedna linia: plik zadania do utworzenia. Sam go nie twórz (ANL-001) | tylko prompt (prepare ostrzega dopiero przy implementacji) | [ANL-052](docs/decisions/orchestrate-rule-history.md#anl-052) |
| ANL-053 | jednostka zmienia sygnaturę portu (`application/interfaces`), komendy albo zdarzenia albo usuwa lub przemianowuje pole DTO, modelu odczytu lub schematu | typecheck biegnie per warstwa (domain→application→infrastructure), więc wołający w późniejszej warstwie zostawiają czerwień wcześniejszej. Do `dirs` jednostki zmieniającej sygnaturę wpisz też implementację (adapter, repozytorium) i wszystkich wołających (kontroler, handler) z późniejszych warstw, znalezionych grepem po symbolu, nie z pamięci; dotyczy to też kontrolera w `infrastructure`, gdy zmiana komend wymaga typechecku w `application`. Przy usuwaniu lub przemianowaniu pola: grep po nazwie w `src/`, każdy trafiony plik (DTO, model odczytu, polityka, schemat, kontroler) ma właściciela w jednostce; `domain` i `application` idą przed `infrastructure`, a guardian w `testing` jest czerwony, dopóki któryś plik zostaje bez właściciela | tylko prompt | [ANL-053](docs/decisions/orchestrate-rule-history.md#anl-053) |
| ANL-054 | krok 1.b | źródło i precedens tylko z dokumentów: `evidence` = `plik:linia` + cytat; brak = `new-pattern`/`none` | `verify-answer-sources` | — |
| ANL-055 | pytanie z `rec` | `ask` jedno pytanie + `rec` z podstawą, razem ≤ 2 zdania; BDR/ADR tylko w `rec` | hook `check-human-voice`, `verify-answer-sources` | — |
| ANL-056 | pytanie w 1.b | decyduje człowiek; wyjątek tylko ANL-060; `one-way`, `USER_CHALLENGE`, produkt/prawo nigdy automatycznie ani hurtem; limit → ANL-051 | `verify-answer-sources`, `prepare` | — |
| ANL-057 | kroki 3.b/3.c | partia ≤ `batch_size` (10); `answer:` tylko z `reply.answers[]`; `approved` wg `reply.approve` (`granted: false` → `hold`) | `verify-answer-sources --reply`, `prepare` | — |
| ANL-058 | odpowiedź, format ≠ `none` | zapis tylko w ścieżkach z configu po `check-write`; bez commita | `resolve-finalize` | — |
| ANL-059 | kroki 1.b, 3.c | `step` roli `resolve`; `resolve_stats` | `verify-answer-sources --stats` | — |
| ANL-060 | 1.b: pytanie spełnia warunki auto z `docs/analyze-resolve.md` (krok 4a) | `answer` = opcja (recommended), `answered_by: auto` (`auto.pending`); „cofnij N" → `auto_reverted: true` | `verify-answer-sources` (`autoEligible`), `prepare` | [ANL-060](docs/decisions/orchestrate-rule-history.md#anl-060) |
| ANL-051 | stage `blocking: true` kończy się limitem budżetu albo bez wyniku | wynik częściowy nie jest wynikiem: nie uzupełniaj go własnym ustaleniem. Ponów stage RAZ na brakującą resztę (jedno celowane doczytanie brakujących plików); nadal niepełny → luka w `## Przebieg` („Luka przeglądu <stage>: <lista>"). LUKA PRZEGLĄDU NIGDY NIE JEST PYTANIEM: ani w `open_questions`, ani w czacie | prompt; `verify-answer-sources` odrzuca pytanie bez `decision:`/`rec` albo o proces analizy (exit 2) | [ANL-051](docs/decisions/orchestrate-rule-history.md#anl-051) |
| ANL-034 | wyjście i zatwierdzenie | `analyze.exit: PAUSE` → `status: awaiting-human`, wypisz, że dopiero po odpowiedziach i `status: approved` wolno ruszyć z implementacją, i **KONIEC** — nie wołaj orkiestracji, nie implementuj. Bez PAUSE → `status: ready` i rekomendacja następnego kroku. PO ZATWIERDZENIU zmieniasz WYŁĄCZNIE artefakt analizy (`status: approved`, odpowiedzi); NIE edytujesz kodu, `package.json`, lockfile, plików zadań ani luk, nie ustawiasz `status: done`, nie commitujesz, nie mergujesz; implementacja to `/orchestrate` | tylko prompt (drugi zamek: `orchestrate-prepare.mjs` exit 2) | — |
| ANL-061 | koniec kroku 2, zawsze (także bez `analyze.resolve`) | `node <claude-patterns>/scripts/verify-answer-sources.mjs <artefakt> --check-frontmatter`; exit 2 = popraw wskazaną linię (wartość z `: ` lub ` #` w cudzysłów albo blok `>-`) i powtórz; człowiekowi dopiero po exit 0 | skrypt (`--check-frontmatter`); drugi zamek: `orchestrate-prepare.mjs` | [ANL-061](docs/decisions/orchestrate-rule-history.md#anl-061) |
| ANL-062 | rozpisany zakres plików (`dirs`, `layers_scope`, `minor_fixes`) | plik chroniony hookiem `config-protection` (`.eslintrc*`, `eslint.config.*`, `.prettierrc*`, `prettier.config.*`, `biome.json*`, `ruff.toml`, `.shellcheckrc`, `.stylelintrc*`, `.markdownlint*`; blokada dotyczy EDYCJI istniejącego pliku) NIE wchodzi do zakresu; zmiana → sekcja `## Kroki ręczne po przebiegu` artefaktu (jak `.env*`); hooka nie obchodzisz | `orchestrate-prepare.mjs` (ostrzeżenie `warnBareMissingDirs`) + prompt | [ANL-062](docs/decisions/orchestrate-rule-history.md#anl-062) |
| ANL-063 | stage `threat-model` zapisał TM, a plik zadania nie ma sekcji `## 🔒 Security Pre-Analysis` albo ma ją pustą/placeholderem | `Edit` dopisuje WYŁĄCZNIE tę sekcję wg skilla `threat-model` krok 7b (link do TM, podsumowanie z modelu, PII, podstawa, DPIA; bez TODO/TBD/N/A); frontmatter i `status` zadania nietknięte; brak pliku zadania → ANL-052 | prompt; hook `check-security-considerations` (blokuje `in-progress` bez sekcji) | [ANL-063](docs/decisions/orchestrate-rule-history.md#anl-063) |

## Co zrobić z regułą „tylko prompt"

Złamana reguła ANL: najpierw „czy da się to rozstrzygnąć deterministycznie" (kandydaci: ANL-005, 008, 028).
