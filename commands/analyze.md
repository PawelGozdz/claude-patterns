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
1.  panel              → sloty z analyze.panel W KOLEJNOŚCI, agenci jako LIŚCIE
2.  artefakt           → project-orchestration/analysis/{TASK-ID}.analysis.md (jedyny Write)
3.  wyjście            → analyze.exit: PAUSE = STOP i czekaj na człowieka
```

**Co wolno zapisać — lista zamknięta.** Ograniczeniem jest ta lista, nie brak narzędzia:

1. `project-orchestration/analysis/{TASK-ID}.analysis.md` — artefakt analizy;
2. `docs/security/threat-models/TM-{TASK-ID}.md` — gdy odpala się stage `threat-model`;
3. **rejestr threat-modeli** (`docs/security/threat-models/index.md` lub odpowiednik),
   gdy projekt wymaga wiersza per TM.

Nic poza tym — żadnego pliku w `src/`, żadnego taska, żadnego ADR-a.

## Rejestr reguł

| ID | trigger | wymagana akcja | mechanizm | ref |
|---|---|---|---|---|
| ANL-001 | cały przebieg | zapisy wyłącznie z listy zamkniętej powyżej; zero implementacji | tylko prompt (hook `check-delegation` zna tylko pliki źródłowe) | — |
| ANL-002 | dopisanie wiersza do rejestru TM | `Edit` dozwolony wyłącznie do rejestrów z listy; `MultiEdit` zabroniony | frontmatter komendy | [ANL-002](docs/decisions/orchestrate-rule-history.md#anl-002) |
| ANL-003 | szukanie pliku/symbolu | `Grep`/`Glob` do CELOWANEGO szukania; szerokie przeczesywanie deleguj do Explore | tylko prompt | [ANL-003](docs/decisions/orchestrate-rule-history.md#anl-003) |
| ANL-004 | użycie `Bash` | wyłącznie deterministyczne i tylko-do-odczytu (indeks decyzji, `git log`/`status`); żadnych zapisów, instalacji ani testów | tylko prompt | — |
| ANL-005 | start | brak `.claude/config/runtime.yml` → STOP; `schema_version ≠ 1` → STOP z poleceniem ponownego setupu | tylko prompt | — |
| ANL-006 | przed rozpisaniem jednostek pracy | `git status --short` + `git log --oneline -15`; potwierdź grepem na KONKRETNYM pliku, że praca nie jest zrobiona; „już zrobione" → `status: already-done` z dowodem, bez jednostki | tylko prompt | [ANL-006](docs/decisions/orchestrate-rule-history.md#anl-006) |
| ANL-007 | panel ma stage `threat-model` | dopasuj `when:` do taska; trafienie + brak pliku TM → uruchom stage i ZAPISZ TM; TM niepokrywający zakresu → ADDENDUM albo blokujące `open_question` | tylko prompt | — |
| ANL-008 | dobór wzorców | `patterns.always` + trafione `triggers` z runtime.yml — to jest CAŁA lista; karty (`*_summary.md`) wstrzykuj do promptów panelu | tylko prompt (skrypt `orchestrate-prepare.mjs` robi to samo dla fazy implementacji) | — |
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
