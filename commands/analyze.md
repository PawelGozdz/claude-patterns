---
name: analyze
description: |
  Generyczna faza RESEARCH/ANALIZY sterowana kompozycją bloków (ADR 0008).
  Czyta .claude/config/runtime.yml (bramka: brak pliku = odmowa startu), odpala
  panel advisory ze slotów bloków (aktywacja warunkowa `when:`), pisze artefakt
  analizy i kończy wg `analyze.exit` (PAUSE = twarda bramka approval, wnosi ją
  blok ddd/core). NIGDY nie implementuje.

  Usage: /analyze <TASK-ID>
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
0.c telemetria: start  → telemetry-emit run-start (best-effort, niżej)
1.  panel              → sloty z analyze.panel W KOLEJNOŚCI, agenci jako LIŚCIE
2.  artefakt           → project-orchestration/analysis/{TASK-ID}.analysis.md (jedyny Write)
3.  wyjście            → analyze.exit: PAUSE = STOP i czekaj na człowieka
3.a telemetria: koniec → telemetry-emit run-end (przed STOP z kroku 3)
4.  zgłoszenia         → odstępstwa MASZYNY do skrzynki claude-patterns (best-effort, niżej)
5.  zalążek wpisu      → temat wart wpisu → blog-seed-emit (best-effort, w tle, niżej)
```

## Telemetria przebiegu (best-effort, nie blokuje)

Panel to agenci narzędzia Agent, których hook metryk Workflow nie widzi — bez tego kroku analiza
nie zostawia żadnych danych (ADR 0012, krok 3). Dwa wywołania i jeden znacznik:

**Start** (0.c — po bramce i doborze materiału, PRZED pierwszym agentem panelu). Plan = id
slotów, które panel faktycznie uruchomi (po `when:` i sicie ANL-018), w kolejności:

```
node <claude-patterns>/scripts/telemetry-emit.mjs run-start --process analyze \
  --project {ABSOLUTNA ścieżka korzenia projektu} --task {TASK-ID} --plan "<slot>:panel,<slot>:panel,…"
```

Stdout to `runId` — wpisz go do frontmattera artefaktu jako `telemetry_run: <runId>` i zachowaj
na krok 3.a. `--project` MUSI być ścieżką (nie samą nazwą): hooki dopasowują agentów do przebiegu
po katalogu roboczym.

**Znacznik slotu** (ANL-041). Opis (`description`) KAŻDEGO agenta panelu zaczyna się od
`[slot:<id>]`, gdzie `<id>` to dokładnie ten klucz slotu, który poszedł do `--plan`, np.
`[slot:security] Ocena ryzyk logowania`. Hook bierze z opisu tylko ten znacznik. Agent bez
znacznika (np. pomocniczy Explore) nie jest liczony jako krok panelu.

**Koniec** (3.a — po zapisie artefaktu, PRZED STOP z `analyze.exit: PAUSE`):

```
node <claude-patterns>/scripts/telemetry-emit.mjs run-end --process analyze \
  --project {ta sama ścieżka} --run-id {runId} --outcome <ok|halted|failed>
```

| Wynik | `--outcome` |
|---|---|
| artefakt gotowy, bez PAUSE (`status: ready`) | `ok` |
| `analyze.exit: PAUSE` — artefakt czeka na człowieka (`awaiting-human`, pytania otwarte) | `halted` |
| panel nie dał artefaktu (agent padł, bramka wejścia, błąd narzędzia) | `failed` |

`run-end` sam dopisuje `skipped` dla slotów z planu bez agenta i `unknown` dla agentów, którzy nie
zdążyli się zakończyć, a potem kasuje stan przebiegu. Przebieg, którego nikt nie zamknął
(przerwany, sesja padła), zamknie następny `run-start` jako `unknown`. Błąd któregokolwiek
wywołania = jedno zdanie w `## Uwagi`, analiza idzie dalej.

## Krok 4 — zgłoszenia do skrzynki (best-effort, nie blokuje)

Do 2026-10-10 skrzynkę `claude-patterns/docs/tasks/_inbox/` karmił wyłącznie `/orchestrate`.
Błędy kompozycji, które w analizie degradują PO CICHU, nigdy tam nie trafiały — m.in. blokujący
stage pomijany, bo inny stage zapisał już jego plik `output:` (aegis-flow, wykryte dopiero ręcznie).
Zgłaszasz tylko to, co jest wadą **maszyny** (bloki, runtime.yml, wzorce, agenci), nie ryzyka
samego taska — te należą do artefaktu.

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

To (obok telemetrii przebiegu wyżej) jedyny zapis poza listą zamkniętą niżej — trafia do claude-patterns, nie do projektu.
Błąd wywołania = jedno zdanie w artefakcie (`## Uwagi`), analiza idzie dalej.

**Co wolno zapisać — lista zamknięta.** Ograniczeniem jest ta lista, nie brak narzędzia:

1. `project-orchestration/analysis/{TASK-ID}.analysis.md` — artefakt analizy;
2. `docs/security/threat-models/TM-{TASK-ID}.md` — gdy odpala się stage `threat-model`;
3. **rejestr threat-modeli** (`docs/security/threat-models/index.md` lub odpowiednik),
   gdy projekt wymaga wiersza per TM.

Nic poza tym — żadnego pliku w `src/`, żadnego taska, żadnego ADR-a.

## Krok 5 — zalążek wpisu blogowego (best-effort, nie blokuje, ADR 0013)

Po zapisie artefaktu (i po kroku 3.a) oceniasz, czy z tej analizy wynika temat na wpis.
Oceniasz TY — masz już pełny kontekst; nie uruchamiaj do tego osobnego agenta.

1. `node <claude-patterns>/scripts/blog-seed-emit.mjs --project {ABSOLUTNA ścieżka} --check --run-id {runId}` —
   `"enabled": false` → koniec kroku, bez słowa w artefakcie (zdarzenie `skipped` zapisze skrypt). Z odpowiedzi weź `exclude_topics`
   (tych tematów nie dotykasz) i `artifact_globs` (tych plików nie czytasz na potrzeby zalążka).
2. Podpowiedź, nie reguła: było napięcie (odrzucona alternatywa, zmiana zdania, zaskoczenie)?
   jest dowód (ADR, decyzja, metryka)? ktoś spoza projektu czegoś się z tego nauczy? to nie rutyna
   (mechaniczny refaktor, podbicie zależności)? Brak tematu to normalny wynik — ale nie cisza:
   wywołaj `blog-seed-emit.mjs --project {ścieżka} --no-topic --run-id {runId}` i zakończ krok.
   Bez tego wywołania lejek nie odróżni „oceniono, brak tematu" od „krok pominięty".
   Okazje w analizie: zatwierdzone `decisions[]` (`trigger: decision`), nowy ADR/BDR (`adr`),
   istotna dyskusja w panelu (`discussion`). Jeden zalążek na temat, nie na przebieg.
3. Payload wg `<claude-patterns>/schemas/blog-seed-payload-v1.schema.json` zapisz do pliku
   tymczasowego (np. `$TMPDIR`, poza projektem) i wywołaj W TLE:

```
node <claude-patterns>/scripts/blog-seed-emit.mjs --project {ścieżka} --payload <plik.json> --run-id {runId}
```

Treść ma być BOGATA i bezpieczna: co rozważano, odrzucone opcje i dlaczego, niewiadoma w chwili
decyzji, przebieg (czas przeszły), liczby z pochodzeniem, sekcja `unknowns` zawsze niepusta.
Etykiety pozycji: `fact` / `hypothesis` (Twoja) / `inference` (z odpowiedzi autora). Bez prozy,
scen, emocji i cytatów. `source.ref` to PRYWATNY wskaźnik (np. `{TASK-ID}#decyzja-2`) — skrypt go
haszuje i nigdy nie zapisuje. Identyfikatory (ścieżki, hashe, ID, nazwy repo) skrypt i tak wytnie,
ale nie wpisuj ich celowo. Routing: test „czy wpis ma sens dla kogoś, kto nigdy nie użyje
produktu?" (tak → `personal`, nie → `product`) + `confidence` (`medium` → podaj `alt_angle` dla
drugiego bloga). Wynik/błąd skryptu nie zmienia artefaktu ani `--outcome`; kod ≠ 0 = jedno zdanie
w `## Uwagi`. Wejściem są tylko artefakty przebiegu — nie transkrypt rozmowy.

## Rejestr reguł

| ID | trigger | wymagana akcja | mechanizm | ref |
|---|---|---|---|---|
| ANL-001 | cały przebieg | zapisy wyłącznie z listy zamkniętej powyżej; zero implementacji | tylko prompt (hook `check-delegation` zna tylko pliki źródłowe) | — |
| ANL-002 | dopisanie wiersza do rejestru TM | `Edit` dozwolony wyłącznie do rejestrów z listy; `MultiEdit` zabroniony | frontmatter komendy | [ANL-002](docs/decisions/orchestrate-rule-history.md#anl-002) |
| ANL-003 | szukanie pliku/symbolu | `Grep`/`Glob` do CELOWANEGO szukania; szerokie przeczesywanie deleguj do Explore | tylko prompt | [ANL-003](docs/decisions/orchestrate-rule-history.md#anl-003) |
| ANL-004 | użycie `Bash` | wyłącznie deterministyczne i tylko-do-odczytu (indeks decyzji, `git log`/`status`); żadnych zapisów, instalacji ani testów. Wyjątek: `telemetry-emit` i `report-deviation` — zapisują do claude-patterns, nie do projektu; `blog-seed-emit` — zapisuje wyłącznie do `stage/` repo blogów (ADR 0013) | tylko prompt | — |
| ANL-005 | start | brak `.claude/config/runtime.yml` → STOP; `schema_version ≠ 1` → STOP z poleceniem ponownego setupu | tylko prompt | — |
| ANL-006 | przed rozpisaniem jednostek pracy | `git status --short` + `git log --oneline -15`, a do tego ślad zadania POZA bieżącą gałęzią: `git branch -a --no-merged develop`, `git log --all --oneline --grep=<TASK-ID>`, `ls .claude/run-state/<TASK-ID>.*`; trafienie = STOP z pytaniem „kontynuować istniejącą gałąź czy zaczynać od nowa", nie cicha analiza od zera; potwierdź grepem na KONKRETNYM pliku, że praca nie jest zrobiona; „już zrobione" → `status: already-done` z dowodem, bez jednostki | tylko prompt (mechaniczny wariant w `orchestrate-prepare.mjs` otwarty) | [ANL-006](docs/decisions/orchestrate-rule-history.md#anl-006) |
| ANL-007 | panel ma stage `threat-model` | dopasuj `when:` do taska; trafienie + brak pliku TM → uruchom stage i ZAPISZ TM; TM niepokrywający zakresu → ADDENDUM albo blokujące `open_question` | tylko prompt | — |
| ANL-008 | dobór wzorców | `patterns.always` + trafione `triggers` z runtime.yml — to jest CAŁA lista; karty (`*_summary.md`) wstrzykuj do promptów panelu; ścieżki rozwiązuj dosłownie względem `.claude/knowledge/patterns/` — podkatalogi (np. `python/`) bywają symlinkami, więc `grep -r` i `find` bez `-L` ich nie widzą (aegis-flow TS-004 uznał `python/testing-pattern.md` za nieistniejący); sprawdzaj przez `ls <katalog>/` albo `find -L` | tylko prompt (skrypt `orchestrate-prepare.mjs` robi to samo dla fazy implementacji) | — |
| ANL-009 | wywołanie RAG | `collection` bierz z `runtime.yml → knowledge.collection` i wstrzykuj LITERALNIE; nigdy nie konstruuj z nazwy katalogu | tylko prompt | [ANL-009](docs/decisions/orchestrate-rule-history.md#anl-009) |
| ANL-035 | wywołanie RAG (`retrieve_code`) | `source` w wyniku jest ścieżką WZGLĘDNĄ wobec korzenia repo — otwórz ją Readem we własnym drzewie; `evidence` to dowód trafienia z `origin/develop` (`indexedSha`), nie treść do cytowania | tylko prompt (pole `_contract` w odpowiedzi narzędzia, TASK-RAG-004 R1) | [ANL-035](docs/decisions/orchestrate-rule-history.md#anl-035) |
| ANL-010 | artefakt | frontmatter MUSI mieć `rag:` — lista zapytań z liczbą trafień albo jawne `rag: skipped (powód)` | tylko prompt | — |
| ANL-011 | `stack_blocks` zawiera `ddd/core` | wczytaj trafne karty decyzji, skonsultuj precedens (ścieżkę ADR odkryj wąskim Explore, nie zgaduj slugów); decyzja już zapadła → zastosuj i cytuj | tylko prompt | — |
| ANL-012 | panel ma stage `decision-gate` | odpal `node <claude-patterns>/scripts/index-decisions.mjs <projekt>` — skryptem, nie agentem | skrypt `index-decisions.mjs` | [ANL-012](docs/decisions/orchestrate-rule-history.md#anl-012) |
| ANL-013 | wpis `needs_scope_check: true` | nadal obowiązuje — cytuj pole `scope`; gdy milczy o Twoim parametrze, idź wg `lookup_order` | tylko prompt | [ANL-013](docs/decisions/orchestrate-rule-history.md#anl-013) |
| ANL-014 | wpis `source: proza` | traktuj status jako mniej pewny niż `source: frontmatter` | tylko prompt | [ANL-014](docs/decisions/orchestrate-rule-history.md#anl-014) |
| ANL-015 | `problems.duplicate_ids` | cytując ADR podawaj ścieżkę pliku, nie sam numer | tylko prompt | [ANL-015](docs/decisions/orchestrate-rule-history.md#anl-015) |
| ANL-016 | `problems.missing_status` | brak statusu ≠ nieaktualny — wpis wchodzi jako aktywny, z ostrożnością | tylko prompt | [ANL-016](docs/decisions/orchestrate-rule-history.md#anl-016) |
| ANL-017 | prompt stage'a `decision-gate` | `brief[]` + `entries[]` przefiltrowane do `needs_scope_check: true` + `problems` + `open_questions`; nigdy surowy indeks | tylko prompt | [ANL-017](docs/decisions/orchestrate-rule-history.md#anl-017) |
| ANL-018 | task `type: refactor\|bugfix\|chore` | pomiń sloty bloku `governance` (`strategy-fit`, `data-classification`) — to sito jest PRZED `when:` | tylko prompt | — |
| ANL-019 | slot ma `corpus:` | nie wklejaj plików kanonu; wąski Explore/haiku zwraca CYTATY z namiarami. `inject:` to osobna półka — krótkie fragmenty wprost, zawsze | tylko prompt | [ANL-019](docs/decisions/orchestrate-rule-history.md#anl-019) |
| ANL-020 | slot ma `when:` | dopasuj do treści/etykiet i **wypisz, KTÓRE słowo trafiło**; trafienie po fragmencie wyrazu bez sensu → pomiń i powiedz to; brak trafienia przy widocznym ryzyku → potraktuj jak trafienie i zgłoś lukę w regexie | tylko prompt | [ANL-020](docs/decisions/orchestrate-rule-history.md#anl-020) |
| ANL-021 | slot ma `model:`/`effort:` | wywołaj agenta z tym modelem, nadpisując jego frontmatter; bez tego: zbieranie i odczyt → haiku, przygotowanie i implementacja → sonnet, ocena i synteza → opus | tylko prompt | — |
| ANL-022 | wywołanie slotu | agent jako LIŚĆ: bez narzędzia `Task` i bez parametru `name` (mailbox gubi wyniki) | tylko prompt | — |
| ANL-023 | każdy prompt panelu | wstrzyknij budżet z `runtime.yml budgets` (default `max_tool_calls: 15`) z instrukcją oddania częściowego raportu | tylko prompt | — |
| ANL-024 | prompt kolejnego stage'a | spec + karty + STRESZCZENIE poprzednich stage'ów; NIGDY pełny surowy output | tylko prompt | [ANL-024](docs/decisions/orchestrate-rule-history.md#anl-024) |
| ANL-025 | stage przerwany budżetem | jego niezweryfikowane tezy WYŁĄCZNIE jako `open_questions` | tylko prompt | — |
| ANL-026 | synteza | `tech-lead` z `model: opus`; gdy środowisko przerywa liście — syntezę robi główny agent i odnotowuje to w artefakcie | tylko prompt | [ANL-026](docs/decisions/orchestrate-rule-history.md#anl-026) |
| ANL-027 | przed zapisem artefaktu | każdą nazwaną funkcję/klasę/ścieżkę zgrepuj; nie istnieje → jawne „TO TRZEBA STWORZYĆ" | tylko prompt | [ANL-027](docs/decisions/orchestrate-rule-history.md#anl-027) |
| ANL-028 | artefakt | wg `templates/task-analysis-template.md`: `task`, `status`, `threat_model`, `open_questions[]`, `decisions[]`, `patterns[]`, `rag:`, `stack_blocks:`. Odpowiedzi żyją WYŁĄCZNIE we frontmatter | tylko prompt | — |
| ANL-029 | `open_questions[]` i `decisions[]` | `ask` i `means` są OBOWIĄZKOWE, rejestrem z `human_voice` (default: polski, biznesowy, do 2 zdań, bez nazw klas, ścieżek i numerów ADR/BDR) | hook `check-human-voice` (gdy zainstalowany) | [ANL-029](docs/decisions/orchestrate-rule-history.md#anl-029) |
| ANL-030 | pisanie `ask` | test: czy człowiek nieznający kodu odpowie sam? jeśli musi dopytać o nazwę — to jeszcze `q`, nie `ask` | tylko prompt | [ANL-030](docs/decisions/orchestrate-rule-history.md#anl-030) |
| ANL-031 | pisanie `ask` | nie chowaj konsekwencji wyboru — to jest ta część, dla której człowiek czyta pytanie | tylko prompt | [ANL-031](docs/decisions/orchestrate-rule-history.md#anl-031) |
| ANL-036 | rozpisane jednostki pracy | dla KAŻDEJ warstwy z `runtime.yml → orchestrate.layers` sprawdź, czy jakakolwiek jednostka dotyka jej `dirs`; warstwę bez pracy wpisz do `layers_skip: [{ id, reason }]` z powodem cytującym decyzję/jednostkę. Task infrastrukturalny bez zmian w domenie i aplikacji → dwa wpisy, nie zero. `decisions[]` mają pole `choice` — nigdy `decision`/`answer` (prepare odrzuca) | skrypt `orchestrate-prepare.mjs` (bramka: nieznana warstwa, brak `reason`, brak `choice`) | [ANL-036](docs/decisions/orchestrate-rule-history.md#anl-036) |
| ANL-038 | rozpisane jednostki pracy | podział warstwy na obszary → `units: [{ id, layer, dirs, role?, checks?, reason?, repair? }]` (prepare robi z nich pod-warstwy; `repair: true` = jednostka testowa tylko dopasowuje istniejące testy, bez nowych bloków — bramka przyrostu ORC-035 jej nie dotyczy); pliki towarzyszące spoza katalogu zmienianego pliku (setup testów, `.env.example`, compose) dopisz do `dirs` jednostki albo `layers_scope`; plik wspólny, który rozszerza więcej niż jedna jednostka (barrel `index.ts`, rejestr, moduł DI), wpisz do `dirs` KAŻDEJ z nich (remis własności rozstrzyga ORC-112); `dirs` to ścieżki OD KORZENIA repo — sama nazwa pliku (`CLAUDE-LOCAL.md` zamiast `.claude/config/CLAUDE-LOCAL.md`) zakresu nie trafia, prepare ostrzega — test obok pliku z tym samym rdzeniem nazwy wchodzi sam; fałszywe trafienia keywordów → `patterns_exclude: [<ścieżka>]`, nie komentarz | skrypt `orchestrate-prepare.mjs` (bramka `units`: nieznana warstwa, brak `dirs`, warstwa w skip/scope, duplikat; ostrzeżenie dla `patterns_exclude`, który nic nie wykluczył) | [ANL-038](docs/decisions/orchestrate-rule-history.md#anl-038) |
| ANL-039 | analiza znajduje drobne rzeczy (literówka w dokumencie, nit, oczywista niespójność), które nie są problemem ani decyzją | wpisz je do `minor_fixes: ["plik — co — poprawka", …]` w artefakcie; `/orchestrate` przekaże je implementerowi warstwy (ORC-091) do mechanicznej naprawy przy okazji; rzeczy wymagające decyzji NIE idą tutaj, tylko do `open_questions`/`decisions` | tylko prompt (prepare czyta pole) | [ORC-091](docs/decisions/orchestrate-rule-history.md#orc-091) |
| ANL-040 | przekazanie człowiekowi pytań z `open_questions[]` po analizie | pokaż `ask` DOSŁOWNIE, po jednym pytaniu na linię, każde max 2 zdania, forma „tak/nie" albo „A czy B", z rekomendacją i domyślną odpowiedzią; bez własnego komentarza, bez streszczenia analizy, bez nazw plików/klas/ADR; hook `check-human-voice` ostrzega przy `ask` > 2 zdania | hook `check-human-voice` (długość i żargon) + prompt | [ORC-095](docs/decisions/orchestrate-rule-history.md#orc-095) |
| ANL-041 | start i koniec panelu | `run-start` przed pierwszym agentem (plan = sloty, które wejdą), `telemetry_run` w frontmatterze, `run-end` po zapisie artefaktu; opis KAŻDEGO agenta panelu zaczyna się od `[slot:<id>]` (id = klucz slotu z `--plan`); w opisie nic poufnego poza znacznikiem nie jest zapisywane | tylko prompt; hooki `telemetry-agent-start`/`-stop` (bez znacznika albo bez otwartego przebiegu nic nie robią) | [ADR 0012](docs/adr/0012-metryki-przebiegow-zdarzenia-v1.md) |
| ANL-037 | rozpisane jednostki pracy | warstwa dotknięta CZĘŚCIOWO (jeden kontekst z ośmiu, jeden plik enumu) NIE idzie do `layers_skip` — idzie do `layers_scope: [{ id, dirs: [<ścieżki od korzenia repo>], reason }]`: warstwa wchodzi, implementer/weryfikator/sonda widzą tylko `dirs`. Skip jest binarny i gubi tę część pracy bez śladu | skrypt `orchestrate-prepare.mjs` (bramka: powód skipu z „wyjątek"/„częściowo"/„N z M"/„tylko dla"; scope bez `dirs`/`reason`; warstwa w obu listach) | [ANL-037](docs/decisions/orchestrate-rule-history.md#anl-037) |
| ANL-032 | proza w body artefaktu | `## Synteza` i `## Ryzyka / uwagi` przepuść przez skill `humanizer` przed zapisem | tylko prompt | — |
| ANL-033 | sekcje artefaktu | sekcja tylko od slotu, który faktycznie wszedł; sloty governance dokładają blok `governance:` do frontmattera | tylko prompt | [ANL-033](docs/decisions/orchestrate-rule-history.md#anl-033) |
| ANL-034 | wyjście | `analyze.exit: PAUSE` → `status: awaiting-human`, wypisz, że dopiero po odpowiedziach i `status: approved` wolno ruszyć z implementacją, i **KONIEC** — nie wołaj orkiestracji, nie implementuj. Bez PAUSE → `status: ready` i rekomendacja następnego kroku | tylko prompt (drugi zamek: `orchestrate-prepare.mjs` exit 2) | — |

## Co zrobić z regułą „tylko prompt"

Ten rejestr jest w większości nieegzekwowany maszynowo — inaczej niż `/orchestrate`, gdzie
`orchestrate-prepare.mjs` i kanoniczny skrypt Workflow przejęły większość bramek. To jest
stan faktyczny, nie ambicja: gdy któraś z reguł ANL zostanie złamana w realnym przebiegu,
pierwszym pytaniem jest „czy da się to rozstrzygnąć deterministycznie przed startem panelu",
a nie „jak mocniej to napisać".

Najbliżsi kandydaci do zautomatyzowania: ANL-005 (bramka runtime.yml), ANL-008 (dobór wzorców
i kart — kod już istnieje w `orchestrate-prepare.mjs`), ANL-010 (obecność `rag:` we
frontmatterze), ANL-028 (kompletność frontmattera wobec szablonu).
