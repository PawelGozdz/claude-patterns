---
name: orchestrate
description: |
  Generyczna faza IMPLEMENTACJI sterowana kompozycją bloków (ADR 0008): pętla
  po warstwach z runtime.yml (implement→verify→fix aż GO), bramka końcowa ze
  slotu, kończy w stanie "staged, not committed". Bramka wejścia: brak
  .claude/config/runtime.yml = odmowa. Gdy analyze.exit=PAUSE (blok ddd/core),
  ODMAWIA startu bez {TASK-ID}.analysis.md ze status: approved.

  Usage: /orchestrate <TASK-ID>
tools: Task, Read, Write, Edit, Bash, Workflow
disallowedTools: MultiEdit, NotebookEdit
---

# /orchestrate — implementacja sterowana runtime.yml

**ZERO WŁASNEJ IMPLEMENTACJI.** Silnik deleguje do agentów ze slotów; sam nie pisze kodu
produkcyjnego. Wszystko stackowe przychodzi z `runtime.yml`.

Ten plik jest **rejestrem reguł**, nie instrukcją do odtwarzania z prozy. Uzasadnienia
(incydenty, daty, identyfikatory przebiegów, koszty) mieszkają w
`docs/decisions/orchestrate-rule-history.md` — zaglądaj tam, gdy chcesz regułę ZMIENIĆ,
nie gdy chcesz ją WYKONAĆ.

## Przebieg — cztery kroki

```
1. znacznik przebiegu  → .claude/run-state/orchestrating.json (włącza STRICT)
2. przygotowanie       → node <claude-patterns>/scripts/orchestrate-prepare.mjs {TASK-ID} --project . --json
                         zero LLM: bramki wejścia + warstwy + karty reguł + checks + budżety
3. silnik              → Workflow({ scriptPath: <scriptPath z kroku 2>, args: <JSON z kroku 2> })
                         kanoniczny skrypt: scripts/workflow/orchestrate.template.mjs
4. wyjście             → bramka końcowa, git add, HALT: "staged, not committed"
```

Krok 2 kończy się kodem wyjścia: `0` = jedź dalej, `2` = bramka analizy nie przeszła
(wypisz jego stderr i STOP), `3` = brak/zła kompozycja bloków (wypisz i STOP).
**Nie obchodź kodu 2 ani 3** — to są te same bramki, które wcześniej stały tu jako proza.

Krok 3 jest jedynym miejscem, gdzie powstaje kod. Skryptu nie pisz od nowa: jest kanoniczny,
przechodzi `hooks/workflow-lint.js` bez naruszeń i ma eval
(`tests/flow-evals/orchestrate-script/run.js`). Gdy realnie potrzebujesz odstępstwa —
skopiuj plik, zmień kopię, przepuść przez lint i opisz odstępstwo w raporcie.

Po awarii: `Workflow({scriptPath, resumeFromRunId})` — ukończone wywołania wracają z cache.

## Rejestr reguł

Kolumna **mechanizm** mówi, co regułę egzekwuje. „tylko prompt" znaczy: nic jej nie sprawdza
poza Twoją uwagą — to jednocześnie lista kandydatów do zautomatyzowania.

| ID | trigger | wymagana akcja | mechanizm | ref |
|---|---|---|---|---|
| ORC-001 | cały przebieg | zero zapisów w plikach źródłowych z głównej sesji; artefakty koordynacyjne wolno | hook `check-delegation` (STRICT) | [ORC-001](docs/decisions/orchestrate-rule-history.md#orc-001) |
| ORC-002 | przed czymkolwiek innym | zapisz `.claude/run-state/orchestrating.json` z `task_id`, `session_id`, `ts` | tylko prompt (hook czyta plik, nie tworzy go) | — |
| ORC-003 | wypełnianie `ts` znacznika | weź czas z `Bash("date -u +%Y-%m-%dT%H:%M:%SZ")`, nigdy z pamięci | tylko prompt | [ORC-003](docs/decisions/orchestrate-rule-history.md#orc-003) |
| ORC-004 | start | brak `.claude/config/runtime.yml` albo `schema_version ≠ 1` → STOP | `orchestrate-prepare.mjs` (exit 3) | — |
| ORC-005 | `analyze.exit: PAUSE` | wymagaj artefaktu `status: approved` i zera `answer: null` → inaczej STOP | `orchestrate-prepare.mjs` (exit 2) | — |
| ORC-006 | edycja pliku źródłowego mimo braku approval | drugi zamek fizyczny | hook `check-approval-before-impl` | — |
| ORC-007 | plan wykonania | warstwy z `orchestrate.layers` W KOLEJNOŚCI | `orchestrate-prepare.mjs` + `orchestrate.template.mjs` | — |
| ORC-008 | brak sekcji `orchestrate:` | jedna warstwa generyczna (implement + verify ze stacku) | `orchestrate-prepare.mjs` | — |
| ORC-009 | dobór wzorców | `patterns.always` + trafione `triggers` + `patterns[]` z artefaktu | `orchestrate-prepare.mjs` | — |
| ORC-010 | warstwa ma `role:` | wstaw je do promptu implementera dosłownie, przed listą wzorców | `orchestrate.template.mjs` | [ORC-010](docs/decisions/orchestrate-rule-history.md#orc-010) |
| ORC-011 | prompt weryfikatora | musi nieść `id`, `dirs`, `role` warstwy; plik spoza `dirs` = poza zakresem, nie brakujący | `orchestrate.template.mjs` | [ORC-011](docs/decisions/orchestrate-rule-history.md#orc-011) |
| ORC-012 | warstwa ma `patterns:` | traktuj je jak MUST-read na równi z wzorcami globalnymi | `orchestrate-prepare.mjs` + `orchestrate.template.mjs` | [ORC-012](docs/decisions/orchestrate-rule-history.md#orc-010) |
| ORC-013 | warstwa ma `tags:` | nie interpretuj — są śladem, dlaczego wzorzec trafił tutaj | — (dane, nie reguła) | — |
| ORC-014 | uruchamianie `checks` | werdykt z kodu wyjścia `$?`, nie z treści outputu | `orchestrate.template.mjs` (sonda) | [ORC-014](docs/decisions/orchestrate-rule-history.md#orc-014) |
| ORC-015 | uruchamianie `checks` | `<cmd> > /tmp/check-<nazwa>.log 2>&1; echo "EXIT:$?"`; przy `EXIT:0` nie czytaj logu | `orchestrate.template.mjs` (sonda) | [ORC-015](docs/decisions/orchestrate-rule-history.md#orc-015) |
| ORC-016 | monorepo | zawężaj `checks` do dotkniętego pakietu; pełny zakres tylko świadomie i z adnotacją | tylko prompt (zależy od treści `checks` w bloku) | [ORC-016](docs/decisions/orchestrate-rule-history.md#orc-016) |
| ORC-017 | brak skryptu w `package.json` | pomiń i ZARAPORTUJ pominięcie | `orchestrate.template.mjs` (prompt sondy) | [ORC-017](docs/decisions/orchestrate-rule-history.md#orc-017) |
| ORC-018 | niezerowy kod z `checks` | `NO-GO` natychmiast, `violations[]` = wyjście skryptu; nie analizuj dalej | `orchestrate.template.mjs` | — |
| ORC-019 | verify bez `Bash` w `tools` | STOP z komunikatem, nie przepuszczaj warstwy po cichu | tylko prompt | — |
| ORC-020 | warstwa `optional: true` | oceń `create_when` wobec faktycznego wyniku poprzednich warstw; pominięcie odnotuj | `orchestrate.template.mjs` (ocenę `create_when` podaje koordynator) | — |
| ORC-021 | warstwa `tests: true` | implementer dostaje minimalny input (ścieżki + ID reguł), nie treść kodu | `orchestrate.template.mjs` | — |
| ORC-022 | bramka końcowa | suma `checks` ze wszystkich warstw, które faktycznie weszły, raz na całości | `orchestrate-prepare.mjs` (`checks.finalGate`) | [ORC-022](docs/decisions/orchestrate-rule-history.md#orc-022) |
| ORC-023 | artefakt ma `layers_done:` | POMIŃ te warstwy, zrób sanity check zamiast pełnego verify | `orchestrate-prepare.mjs` (`layers[].skip`) | — |
| ORC-024 | GO warstwy | NATYCHMIAST dopisz jej id do `layers_done:` — `Edit`, nigdy `Write` | tylko prompt | [ORC-024](docs/decisions/orchestrate-rule-history.md#orc-024) |
| ORC-025 | wznowienie | `final_gate` uruchamiaj ZAWSZE, także po wznowieniu | `orchestrate.template.mjs` | — |
| ORC-026 | pętla warstwy | implement → verify → (violations? fix → verify)\* aż `GO`; wyczerpane próby → `ESCALATE_AND_HALT` | `orchestrate.template.mjs` · `workflow-lint WL5` | — |
| ORC-027 | kontekst między warstwami | streszczenie decyzji + LISTA ścieżek; nigdy pełny `git diff` | `orchestrate.template.mjs` · `workflow-lint WL6` | — |
| ORC-028 | każde wywołanie agenta | budżet miękko w prompcie ORAZ twardo przez `maxTurns`/`effort` | `orchestrate.template.mjs` · `workflow-lint WL10` | — |
| ORC-029 | prompt implementera | spec + `decisions[]` + karty reguł + fakty o kodzie; verify zwraca `{verdict, violations[]}` | `orchestrate.template.mjs` | — |
| ORC-030 | każde `agent({schema})` | przez helper `ask()` w `try/catch` — wyjątek i null sprowadzone do nulla | `orchestrate.template.mjs` · `workflow-lint WL14` | [ORC-030](docs/decisions/orchestrate-rule-history.md#orc-030) |
| ORC-031 | przed verify | sonda deterministyczna RAZ; verifier dostaje wynik jako fakt i ma zakaz ponawiania | `orchestrate.template.mjs` · `workflow-lint WL7`, `WL13` | [ORC-031](docs/decisions/orchestrate-rule-history.md#orc-031) |
| ORC-032 | każde wywołanie agenta | twardy limit tur na wywołaniu; proza w prompcie nie jest budżetem | `orchestrate.template.mjs` · `workflow-lint WL10` | — |
| ORC-033 | agent-producent danych | schema z polami FAKTOGRAFICZNYMI; nigdy self-ocena implementera | `orchestrate.template.mjs` · `workflow-lint WL1`, `WL12` | [ORC-033](docs/decisions/orchestrate-rule-history.md#orc-033) |
| ORC-034 | wynik `parallel()`/`pipeline()` | guard na null albo `.filter(Boolean)` przed użyciem | `workflow-lint WL11` | [ORC-034](docs/decisions/orchestrate-rule-history.md#orc-034) |
| ORC-035 | jednostka DODAJĄCA testy/kontrole | sonda mierzy PRZYROST bloków wykonywalnych; zero przy dużym diffie = NO_GO | `orchestrate.template.mjs` · `workflow-lint WL15` | [ORC-035](docs/decisions/orchestrate-rule-history.md#orc-035) |
| ORC-036 | wyjście bez wyniku | licz cichą śmierć osobno od NO_GO; po DWÓCH z rzędu eskaluj zamiast powtarzać | `orchestrate.template.mjs` | [ORC-036](docs/decisions/orchestrate-rule-history.md#orc-036) |
| ORC-037 | kolejna próba po cichej śmierci | prompt mówi wprost o poprzedniej cichej awarii i o możliwym częściowym stanie plików | `orchestrate.template.mjs` | [ORC-037](docs/decisions/orchestrate-rule-history.md#orc-037) |
| ORC-038 | null z implementera | tania diff-sonda PRZED powtórką; pliki zmienione → VERIFY-EXISTING, nie re-implementacja | `orchestrate.template.mjs` · `workflow-lint WL16` | [ORC-038](docs/decisions/orchestrate-rule-history.md#orc-038) |
| ORC-039 | wybór modelu | sondy haiku+low, implementer i verify sonnet, bramka końcowa bez override | `orchestrate.template.mjs` | [ORC-039](docs/decisions/orchestrate-rule-history.md#orc-039) |
| ORC-040 | po wyjątku agenta | traktuj drzewo jako częściowo zmienione; sukces mierz `git diff`, nie raportem | `orchestrate.template.mjs` · `workflow-lint WL3` | [ORC-040](docs/decisions/orchestrate-rule-history.md#orc-040) |
| ORC-041 | KAŻDY prompt implementera i naprawczy | zakaz `git checkout`/`restore`/`stash`/`reset` — zero wyjątków | `orchestrate.template.mjs` (blok `NO_REVERT` w prompcie) | [ORC-041](docs/decisions/orchestrate-rule-history.md#orc-041) |
| ORC-042 | plik spoza zakresu agenta | zgłoś w raporcie i zostaw nietknięty | `orchestrate.template.mjs` (prompt) | [ORC-042](docs/decisions/orchestrate-rule-history.md#orc-041) |
| ORC-043 | zapis/przywrócenie stanu | używaj `cp`, nigdy gita | `orchestrate.template.mjs` (prompt) | [ORC-043](docs/decisions/orchestrate-rule-history.md#orc-041) |
| ORC-044 | prompt implementera | wstrzyknij TREŚĆ kart reguł (`_summary.md`) i zamknij ścieżkę eksploracji | `orchestrate-prepare.mjs` (czyta karty) + `orchestrate.template.mjs` (wkleja) | [ORC-044](docs/decisions/orchestrate-rule-history.md#orc-044) |
| ORC-045 | prompt implementera | NIE wstrzykuj pełnych wzorców, RAG „na zapas" ani całych ADR-ów | `orchestrate-prepare.mjs` (karta przed wzorcem, ostrzeżenie gdy karty brak) | [ORC-045](docs/decisions/orchestrate-rule-history.md#orc-044) |
| ORC-061 | prompt implementera (RAG) | Wstrzyknij do promptu subagenta kontrakt `retrieve_code`: `source` względne wobec korzenia repo (Read w swoim drzewie), `evidence` to dowód trafienia, nie treść do kopiowania (indeks z `origin/develop`, `indexedSha`) | tylko prompt (kontrakt niesie też pole `_contract` w każdej odpowiedzi `retrieve_code`, TASK-RAG-004 R1) | [ORC-061](docs/decisions/orchestrate-rule-history.md#orc-061) |
| ORC-046 | implementer potrzebuje PRZYKŁADU z kodu | max 2 celowane zapytania retrievalu na przebieg agenta; zero, gdy karta wystarcza | `orchestrate.template.mjs` (prompt) | [ORC-046](docs/decisions/orchestrate-rule-history.md#orc-046) |
| ORC-047 | prompt weryfikatora | dostaje pełny wzorzec / poziom `core`, nie kartę `quickstart` | tylko prompt (dziś oba dostają to samo, co dał `orchestrate-prepare`) | [ORC-047](docs/decisions/orchestrate-rule-history.md#orc-047) |
| ORC-048 | wiele jednostek pracy | pipeline zamiast bariery; verify NIGDY zrównoleglony | `orchestrate.template.mjs` · `workflow-lint WL2` | [ORC-048](docs/decisions/orchestrate-rule-history.md#orc-048) |
| ORC-049 | 2+ jednostki mogą dotknąć wspólnego pliku | `isolation: 'worktree'` albo sekwencja — deklaracja zakresu nie wystarcza | tylko prompt | [ORC-049](docs/decisions/orchestrate-rule-history.md#orc-049) |
| ORC-050 | pokusa oszczędzania | nie tnij: niezależny verifier, 3 próby z `violations`, lektura kontraktu, guardian, testy L2, bramka końcowa | tylko prompt | [ORC-050](docs/decisions/orchestrate-rule-history.md#orc-050) |
| ORC-051 | po starcie czegoś w tle | NIE wywołuj `ScheduleWakeup` — zadanie samo wróci z powiadomieniem | tylko prompt | [ORC-051](docs/decisions/orchestrate-rule-history.md#orc-051) |
| ORC-052 | sesja blisko limitu kontekstu | STOP przed uruchomieniem Workflow, poproś o świeżą sesję | tylko prompt | [ORC-052](docs/decisions/orchestrate-rule-history.md#orc-052) |
| ORC-053 | budżety wyglądają na za duże | nie zaciskaj domyślnych; podnoś przez `budgets:` w project.yml | tylko prompt | [ORC-053](docs/decisions/orchestrate-rule-history.md#orc-053) |
| ORC-054 | Workflow zakończył się `failed` | przeczytaj `journal.jsonl`, popraw, wznów `resumeFromRunId` — nigdy od zera bez diagnozy | tylko prompt | [ORC-054](docs/decisions/orchestrate-rule-history.md#orc-054) |
| ORC-055 | fork diagnostyczny po `ESCALATE_AND_HALT` | prompt MUSI jawnie zakazać wywołań `Agent`/`Workflow`/`Task` | tylko prompt | [ORC-055](docs/decisions/orchestrate-rule-history.md#orc-055) |
| ORC-056 | bramka końcowa | `orchestrate.final_gate` ze slotu; `on_fail: ESCALATE_AND_HALT` — wypisz werdykt i stój | `orchestrate.template.mjs` | — |
| ORC-057 | `exit: STAGE_NOT_COMMIT` | `git add` zmienionych plików, raport, HALT — commit robi człowiek | tylko prompt (skrypt oddaje listę `staged`) | — |
| ORC-058 | KAŻDA ścieżka wyjścia | usuń `.claude/run-state/orchestrating.json` — także po eskalacji i po odmowie z bramek | tylko prompt | [ORC-058](docs/decisions/orchestrate-rule-history.md#orc-058) |
| ORC-059 | raport końcowy | najpierw 2-4 zdania rejestrem `human_voice`, potem przebieg maszyny | hook `check-human-voice` (gdy zainstalowany) | [ORC-059](docs/decisions/orchestrate-rule-history.md#orc-059) |
| ORC-060 | raport końcowy | nie zaczynaj od tabeli warstw | tylko prompt | [ORC-060](docs/decisions/orchestrate-rule-history.md#orc-059) |

## Co zrobić z regułą „tylko prompt"

Wiersz z mechanizmem „tylko prompt" nie jest gorszy — jest **niezabezpieczony**. Gdy taka
reguła zostanie złamana w realnym przebiegu, właściwą reakcją jest przeniesienie jej do
`orchestrate-prepare.mjs` (jeśli da się rozstrzygnąć deterministycznie przed startem),
do `orchestrate.template.mjs` (jeśli dotyczy kształtu promptu albo pętli) albo do nowej
reguły `workflow-lint` (jeśli dotyczy kształtu skryptu) — a nie dopisanie kolejnego akapitu
prozy do tego pliku. Tak powstał ten rejestr.

## Raport

Dwie części, w tej kolejności:

1. **Co się zmieniło** — 2-4 zdania rejestrem `human_voice` z runtime.yml (domyślnie: polski,
   biznesowy, bez nazw klas, ścieżek i numerów ADR). Co teraz działa inaczej, czego użytkownik
   nie zobaczy, co zostało do decyzji. To czyta człowiek przed commitem i na tej podstawie go
   robi albo nie.
2. **Przebieg** — które sloty i którzy agenci działali (z `# source:` bloku), ile prób zjadła
   każda warstwa, czy budżety zadziałały miękko, werdykty bramek, lista plików, `runtimeHash`
   z kroku 2 (dowód, na jakiej kompozycji to szło).
