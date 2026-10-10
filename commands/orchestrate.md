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

## Przebieg — pięć kroków

```
1. znacznik przebiegu  → .claude/run-state/orchestrating.json (włącza STRICT)
2. przygotowanie       → node <claude-patterns>/scripts/orchestrate-prepare.mjs {TASK-ID} --project . --json
                           --emit-script .claude/run-state/{TASK-ID}.workflow.mjs [--overrides <plik.json>]
                         zero LLM: bramki wejścia + warstwy (+ units) + karty reguł + checks + budżety
3. silnik              → Workflow({ scriptPath: <scriptPath z kroku 2> })   // args wbudowane
                         (bez --emit-script: Workflow({ scriptPath, args: <JSON z kroku 2> }))
                         kanoniczny skrypt: scripts/workflow/orchestrate.template.mjs
4. wyjście             → bramka końcowa, `git add` plików z `report` (nie z pamięci), POTEM
                           `git status --short` żeby POTWIERDZIĆ że dokładnie te pliki są
                           realnie staged — HALT "staged, not committed" buduj z tego
                           zweryfikowanego `git status`, nie z samej listy z `report`
                           (ORC-067: raport twierdził „8 staged", realnie 0 — ai-os-bot BOT-009)
                         ORC-084: `report.stageForReview` (NO_GO bramki końcowej wymuszone WYŁĄCZNIE
                           przez unverified_scope, zero własnych naruszeń) → `git add` te pliki też i
                           HALT z adnotacją „WYMAGA PRZEGLĄDU"; wypisz `report.gaps` (luki warstw
                           GO_WITH_GAPS, per warstwa) i `finalGate.absorbed_gaps` w treści HALT.
                           GO_WITH_GAPS = warstwa zamknięta (dopisz do `layers_done:`), luki do przeglądu.
                           `report.docFixes` (drobne poprawki z analizy poza zakresem warstw, ORC-101 — wykonane przed bramką końcową) wymień jednym zdaniem. `report.warnings` (ślepa sonda, commity implementera) wypisz w treści HALT. `report.askErrors` (powód ciszy agenta) też wypisz. `report.minorFindings` (drobne ustalenia, których nie dało się naprawić) i `report.finalFix` (co naprawiła runda po bramce końcowej) też podaj w raporcie.
5. zgłoszenie odstępstw → best-effort, NIE blokuje HALT z kroku 4 i niczego w nim nie zmienia.
                         Dla KAŻDEGO z: warstwa w `report` ze statusem ESCALATE_AND_HALT/
                         BLOCKED_BY_PRIOR ORAZ `cause === 'machine'`, `report.finalGate.verdict
                         !== 'GO'` ORAZ `report.finalGate.cause === 'machine'`, krok 2 zakończony
                         exit 4 (workflow-lint — rule id z `[WLn]` w stderr), niepuste
                         `deviation_note` w dowolnym wyniku warstwy/bramki końcowej — wywołaj.
                         `cause === 'code'` (weryfikator sam znalazł naruszenia w kodzie, sonda
                         na czerwono, brak nowych testów) to NIE odstępstwo maszyny — nie zgłaszaj,
                         wypisz tylko w treści HALT. Brak pola `cause` = traktuj jak `machine`
                         (stary skrypt). ORC-083:
                         node <claude-patterns>/scripts/report-deviation.mjs --project {nazwa}
                           --trigger <halt|blocked_by_prior|no_go|workflow_lint|agent_note>
                           [--rule <ORC-NNN|WLn>] --reason "<tekst>" [--task {TASK-ID}]
                           [--run-id <id z Workflow>] [--layer <id warstwy>]
                         PODAWAJ --layer zawsze, gdy dotyczy warstwy — wchodzi do sygnatury
                         zgłoszenia (ORC-068), bez tego różne przyczyny tej samej ogólnej reguły
                         (np. ORC-062 na dwóch różnych warstwach) zlewają się w jeden rekord.
                         Błąd tego wywołania → jedna uwaga w treści HALT, nic więcej.
```

Krok 2 kończy się kodem wyjścia: `0` = jedź dalej, `2` = bramka analizy nie przeszła
(wypisz jego stderr i STOP), `3` = brak/zła kompozycja bloków (wypisz i STOP), `4` = wyemitowany
skrypt nie przeszedł `workflow-lint` (wypisz, zgłoś przez krok 5 i STOP), `1` = błąd użycia, w tym
nieznany klucz w `--overrides`.
**Nie obchodź kodu 2 ani 3** — to są te same bramki, które wcześniej stały tu jako proza.

Krok 3 jest jedynym miejscem, gdzie powstaje kod. Skryptu nie pisz od nowa: jest kanoniczny,
przechodzi `hooks/workflow-lint.js` bez naruszeń i ma eval
(`tests/flow-evals/orchestrate-script/run.js`). Gdy realnie potrzebujesz odstępstwa —
użyj `--overrides <plik.json>` (budżety, `checks` warstwy, `layers: { "<id>": {…} }`); ręczna
kopia szablonu to ostateczność — wtedy przepuść ją przez lint i opisz odstępstwo w raporcie.

Po awarii: `Workflow({scriptPath, resumeFromRunId})` — ukończone wywołania wracają z cache.

## Po zatrzymaniu — kiedy pytać człowieka (ORC-086)

Zatrzymanie z `cause === 'machine'` to awaria maszyny, nie werdykt o kodzie — **nie wklejaj
użytkownikowi problemu z pytaniem „co robimy"**, tylko załatw to sam, w tej kolejności:

1. `halt-diagnostician` (ORC-055) — raz, żeby ustalić przyczynę. Nie ruszaj `layers_done`,
   `decisions[]` ani artefaktu ręcznie przed diagnozą.
2. Jeśli przyczyna jest mechaniczna i odwracalna (budżet weryfikatora/sondy, nazwy `checks`,
   cache sondy, brak zależności do doinstalowania) — popraw przez `--overrides` i wznów **raz**
   (`resumeFromRunId`). Drugie zatrzymanie z tej samej przyczyny = wtedy dopiero raport do człowieka.
   Fałszywy alarm deterministycznej bramki (sonda liczy 0, a testy uruchomione ręcznie są zielone) to
   błąd silnika: zgłoś do `_inbox`, obejdź przez `--overrides` (np. `layers.<id>.tests: false`) i wznów.
   NIGDY nie dopisuj warstwy do `layers_done` ręcznie i nie pytaj o to człowieka.
3. Pytaj człowieka tylko, gdy: `cause === 'code'` (kod ma błędy, których 3 próby nie naprawiły),
   naprawa wymaga zmiany kompozycji bloków, artefaktu analizy, decyzji produktowej albo sekretu
   (np. token rejestru pakietów), albo wznowienie już raz zawiodło.

Raport z zatrzymania: przyczyna w jednym zdaniu, co zrobiłeś, co zostało, **jedna rekomendacja**
(nie lista wariantów A/B/C do wyboru, gdy jedna jest oczywista). Zasada ogólna: zatrzymanie jest
dla problemu poważnego (kod nie przechodzi, brak dowodu, że działa, decyzja człowieka) —
niepełna weryfikacja przy zielonej sondzie to luka w raporcie (`GO_WITH_GAPS`), nie przystanek.

## Komunikacja z człowiekiem (ORC-095)

Człowiek nie ma czytać akapitów ani odpisywać „ok". Twarde zasady, bez wyjątków:

1. **Jedno ciągłe przejście.** Po starcie przebieg (przygotowanie → wszystkie warstwy → bramka
   końcowa → staging) biegnie bez pytań. NIE pytaj o zgodę na kolejną warstwę, o „kontynuować?",
   ani o potwierdzenie czegoś, co już zatwierdzono (analiza `approved`). Jeden `Workflow` na cały task,
   nie warstwa po warstwie. `layers_done` dopisz jednym `Edit` PO zakończeniu Workflow (z `report.layers`,
   statusy GO i GO_WITH_GAPS), bez komunikatu — TAKŻE gdy przebieg zatrzymał się na `ESCALATE_AND_HALT`/`BLOCKED_BY_PRIOR`:
   warstwy, które dostały GO przed zatrzymaniem, zapisujesz (ORC-104), inaczej kolejny start powtórzy je od zera.
2. **Wolno się zatrzymać i zapytać tylko:** (a) przy bramce analizy `PAUSE`, raz, przed startem;
   (b) po zatrzymaniu z sekcji „Po zatrzymaniu" (kod, decyzja produktowa, sekret, zmiana kompozycji).
   Wszystko inne: zrób rekomendowaną, odwracalną rzecz i zaraportuj ją jedną linią.
3. **Wiadomość końcowa w czacie: maksymalnie 3 linie.** (1) Co się zmieniło: 1-2 zdania językiem
   biznesowym (`human_voice`): bez nazw plików, klas, ścieżek, numerów ADR/ORC. (2) Gotowa linia
   `report.statusLine` — przepisz ją dosłownie. (3) Ewentualnie JEDNO pytanie wg pkt 4. Resztę
   („Przebieg": sloty, próby, werdykty, lista plików, `runtimeHash`, `warnings`, `gaps`) zapisz do
   `.claude/run-state/{TASK-ID}.report.md` i w czacie podaj najwyżej jedną linię ze ścieżką, tylko gdy
   `warnings`/`gaps`/`minorFindings` są niepuste.
4. **Pytanie do człowieka:** jedno naraz, 1-2 zdania, język biznesowy, forma „tak/nie" albo „A czy B",
   zawsze z rekomendacją i domyślną odpowiedzią („Domyślnie: tak."). Użyj `AskUserQuestion` z krótkimi
   opcjami, nie akapitu. Szczegóły techniczne podaj dopiero na prośbę. Człowiek nie ma prosić o
   „wytłumacz prostym językiem" — pierwsza wersja ma już tak brzmieć.
5. **Test przed wysłaniem:** czy ta wiadomość istnieje tylko po to, żeby człowiek odpisał „ok"? Jeśli tak,
   nie wysyłaj jej — wykonaj krok i zaraportuj wynik.

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
| ORC-016 | monorepo | zawężaj `checks` do dotkniętego pakietu; pełny zakres tylko świadomie i z adnotacją | `orchestrate.template.mjs` (`buildProbePrompt`, lookup `package.json` przez sondę-Bash — silnik nie ma fs) | [ORC-016](docs/decisions/orchestrate-rule-history.md#orc-016) |
| ORC-017 | brak skryptu w `package.json` | pomiń i ZARAPORTUJ pominięcie | `orchestrate.template.mjs` (prompt sondy) | [ORC-017](docs/decisions/orchestrate-rule-history.md#orc-017) |
| ORC-018 | niezerowy kod z `checks` | `NO-GO` natychmiast, `violations[]` = wyjście skryptu; nie analizuj dalej | `orchestrate.template.mjs` | — |
| ORC-019 | verify bez `Bash` w `tools` | STOP z komunikatem, nie przepuszczaj warstwy po cichu | tylko prompt | — |
| ORC-020 | warstwa `optional: true` | oceń `create_when` wobec faktycznego wyniku poprzednich warstw; pominięcie odnotuj | `orchestrate.template.mjs` (ocenę `create_when` podaje koordynator) | — |
| ORC-021 | warstwa `tests: true` | implementer dostaje minimalny input (ścieżki + ID reguł), nie treść kodu | `orchestrate.template.mjs` | — |
| ORC-022 | bramka końcowa | `final_gate.checks` z bloku (ZAWSZE) ∪ `checks` warstw, które weszły, raz na całości | `orchestrate-prepare.mjs` (`checks.finalGate`, ostrzeżenie przy pustej liście) | [ORC-022](docs/decisions/orchestrate-rule-history.md#orc-022) |
| ORC-023 | artefakt ma `layers_done:` | POMIŃ te warstwy, zrób sanity check zamiast pełnego verify | `orchestrate-prepare.mjs` (`layers[].skip`) | — |
| ORC-024 | GO / GO_WITH_GAPS warstwy | PO zakończeniu Workflow (nie w trakcie) dopisz ich id do `layers_done:` jednym `Edit`, nigdy `Write`, bez komunikatu (ORC-095) | tylko prompt | [ORC-024](docs/decisions/orchestrate-rule-history.md#orc-024) |
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
| ORC-055 | fork diagnostyczny po `ESCALATE_AND_HALT`/`BLOCKED_BY_PRIOR` | użyj `subagent_type: halt-diagnostician` (`agents/universal/halt-diagnostician.md`) — `disallowedTools: Agent, Workflow, Task` na poziomie definicji agenta, nie sam prompt | `agents/universal/halt-diagnostician.md` | [ORC-055](docs/decisions/orchestrate-rule-history.md#orc-055) |
| ORC-056 | bramka końcowa | `orchestrate.final_gate` ze slotu; `on_fail: ESCALATE_AND_HALT` — wypisz werdykt i stój | `orchestrate.template.mjs` | — |
| ORC-057 | `exit: STAGE_NOT_COMMIT` | `git add` zmienionych plików, raport, HALT — commit robi człowiek | tylko prompt (skrypt oddaje listę `staged`) | — |
| ORC-058 | KAŻDA ścieżka wyjścia | usuń `.claude/run-state/orchestrating.json` — także po eskalacji i po odmowie z bramek | tylko prompt | [ORC-058](docs/decisions/orchestrate-rule-history.md#orc-058) |
| ORC-059 | raport końcowy | najpierw 2-4 zdania rejestrem `human_voice`, potem przebieg maszyny | hook `check-human-voice` (gdy zainstalowany) | [ORC-059](docs/decisions/orchestrate-rule-history.md#orc-059) |
| ORC-060 | raport końcowy | nie zaczynaj od tabeli warstw | tylko prompt | [ORC-060](docs/decisions/orchestrate-rule-history.md#orc-059) |
| ORC-062 | czerwona sonda + implementer „brak zmian" | NIE weryfikuj twierdzenia no-op — status `BLOCKED_BY_PRIOR`, przebieg staje, decyzja człowieka | `orchestrate.template.mjs` (`blockedByPrior`) · `workflow-lint WL17` | [ORC-062](docs/decisions/orchestrate-rule-history.md#orc-062) |
| ORC-063 | lista zmienionych plików | jedno polecenie dla bramki, diff-sondy i bramki końcowej: `git diff --name-only <baza>; git ls-files --others --exclude-standard`; bramka końcowa z drzewa, nie z raportów warstw, i z kartami | `orchestrate.template.mjs` (`treeFilesCmd`) · `workflow-lint WL18` | [ORC-063](docs/decisions/orchestrate-rule-history.md#orc-063) |
| ORC-064 | artefakt ma `units[]` | każda jednostka = pod-warstwa `<warstwa>:<id>` z zakresem `dirs`; `layers_done` przyjmuje id pod-warstw; zły wpis = exit 2 | `orchestrate-prepare.mjs` | [ORC-064](docs/decisions/orchestrate-rule-history.md#orc-064) |
| ORC-065 | odstępstwo od kanonu | `--overrides <plik.json>` + `--emit-script`, nie ręczna kopia z `String.replace` | `orchestrate-prepare.mjs` (lint wyemitowanego skryptu, exit 4) | [ORC-065](docs/decisions/orchestrate-rule-history.md#orc-065) |
| ORC-066 | odstępstwo od zasad w satelicie (halt/no_go/lint/adnotacja) | zgłoś do `docs/tasks/_inbox/` w claude-patterns, nie tylko do logu przebiegu — dedup po sygnaturze, licznik `occurrences` | `report-deviation.mjs` · krok 5 (`commands/orchestrate.md`) | [ORC-066](docs/decisions/orchestrate-rule-history.md#orc-066) |
| ORC-067 | krok 4, HALT "staged, not committed" | `git add` NAJPIERW, `git status --short` PO — HALT z werdyktem zweryfikowanym, nie z wyliczonej listy plików | krok 4 (`commands/orchestrate.md`, tylko prompt) | [ORC-067](docs/decisions/orchestrate-rule-history.md#orc-067) |
| ORC-068 | sygnatura zgłoszenia (krok 5) | `rule_ref` + `--layer` razem w sygnaturze; nowe wystąpienie na rekordzie `dismissed`/`promoted` REOPEN'uje go do `proposed` zamiast dopisać się po cichu | `report-deviation.mjs` | [ORC-068](docs/decisions/orchestrate-rule-history.md#orc-068) |
| ORC-069 | weryfikator zwraca `GO` z niepustym `unverified_scope` | NIE jest to czysty GO: w pętli warstwy konsumuje próbę (`fix`) albo eskaluje po wyczerpaniu; na jednorazowej bramce końcowej wymuszone jako `NO_GO` | `orchestrate.template.mjs` (`decideVerdict`, bramka końcowa) | [ORC-069](docs/decisions/orchestrate-rule-history.md#orc-069) |
| ORC-070 | pozycja `unverified_scope` leżąca w dirs INNEJ warstwy tego samego przebiegu | odfiltruj przed sprawdzeniem ORC-069 — to nie luka tej warstwy; wolny tekst i ścieżki nieprzypisane do żadnej warstwy nadal liczone konserwatywnie | `orchestrate.template.mjs` (`decideVerdict`, filtr `ownUnverified`) | [ORC-070](docs/decisions/orchestrate-rule-history.md#orc-070) |
| ORC-071 | treść `unverified_scope` samo-przyznaje „poza zakresem" (prozą, bez ścieżki dopasowywalnej przez ORC-070) | odfiltruj i tak — ufaj słowu weryfikatora niezależnie od formatu; prompt dostaje dodatkowo twardą regułę formatu (1 wpis = 1 ścieżka) | `orchestrate.template.mjs` (`decideVerdict`, `SELF_ADMITS_OUT_OF_SCOPE`) | [ORC-071](docs/decisions/orchestrate-rule-history.md#orc-071) |
| ORC-072 | bramka końcowa (jednorazowa, bez retry) trafia na `unverified_scope` bez sposobu na jawną adjudykację | renderuj `a.task.decisions` w promptcie bramki końcowej (ten sam kanał co warstwy mają przez `layer.scope.reason`) | `orchestrate.template.mjs` (`buildFinalGatePrompt`) | [ORC-072](docs/decisions/orchestrate-rule-history.md#orc-072) |
| ORC-073 | sonda: „ostatnie 40 linii" loga może gubić błąd we własnym zakresie za cudzym ogonem (monorepo, wspólny `lint:check`) | grep po własnym `dirs` NAJPIERW, w całości; `tail` tylko jako fallback gdy grep pusty | `orchestrate.template.mjs` (`buildProbePrompt`, `scopeGrep`) | [ORC-073](docs/decisions/orchestrate-rule-history.md#orc-073) |
| ORC-074 | `GO` z niepustym `unverified_scope` (ORC-069) i próby jeszcze zostały | to nie `fix` (kod nie ma czego naprawiać) — `reverify`: pomiń implementera, idź prosto w sondę+verify ze świeżym budżetem tur | `orchestrate.template.mjs` (`decideVerdict`, pętla warstwy) | [ORC-074](docs/decisions/orchestrate-rule-history.md#orc-074) |
| ORC-075 | plik towarzyszący (WYJĄTEK w `scopeBlock`) brakuje, ale osobna jednostka `tests: true` tego samego przebiegu ma go w swoim zakresie | to JEJ praca — nie zgłaszaj jako naruszenie tej warstwy | `orchestrate.template.mjs` (`scopeBlock`) | [ORC-075](docs/decisions/orchestrate-rule-history.md#orc-075) |
| ORC-076 | bramka końcowa dostaje `unverified_scope` z self-admission (ORC-071), ale NIE woła `decideVerdict()` | filtruj tym samym `filterSelfAdmittedOutOfScope()` (moduł-scope) przed sprawdzeniem, czy `GO` jest czysty | `orchestrate.template.mjs` (blok bramki końcowej) | [ORC-076](docs/decisions/orchestrate-rule-history.md#orc-076) |
| ORC-077 | etykiety sond `diff-probe`/`diff-gate`/`checks` stałe per warstwa, niezależne od próby | dopisz numer próby do etykiety — inaczej cache silnika Workflow (klucz: etykieta+prompt) zamraża wynik pierwszej próby na retry tej samej warstwy | `orchestrate.template.mjs` (pętla warstwy, `label`) | [ORC-077](docs/decisions/orchestrate-rule-history.md#orc-077) |
| ORC-078 | pathspec sondy testów z prefiksem `lib/` (dirs Fluttera) nigdy nie trafia w `test/`, które tego segmentu nie ma | dodaj wariant pathspecu bez `lib/` OBOK oryginalnego | `orchestrate.template.mjs` (`buildProbePrompt`, `globScoped`) | [ORC-078](docs/decisions/orchestrate-rule-history.md#orc-078) |
| ORC-079 | plik analizy/task tego przebiegu w `unverified_scope` bramki końcowej, bez frazy self-admission (ORC-076 go nie łapie) | filtruj po ŚCIEŻCE (`a.task.analysisFile`/`taskFile`), nie po prozie — nie zależy od tego, jak weryfikator to nazwie | `orchestrate.template.mjs` (`filterOwnTaskArtifacts`, blok bramki końcowej) | [ORC-079](docs/decisions/orchestrate-rule-history.md#orc-079) |
| ORC-080 | weryfikator (LLM) nie trzyma się jawnej decyzji z `a.task.decisions[]` renderowanej w prompcie (ORC-072) — powtarza zaadjudykowaną pozycję jako unverified | filtruj mechanicznie po `id` decyzji wymienionym w treści pozycji (`\bD7\b`), nie ufaj że LLM "zastosował" tekst | `orchestrate.template.mjs` (`filterAdjudicatedByDecision`, blok bramki końcowej) | [ORC-080](docs/decisions/orchestrate-rule-history.md#orc-080) |
| ORC-081 | prompt weryfikatora podaje wynik sondy pod inną nazwą niż ta, której oczekuje definicja agenta (`checks`) | nazwij blok faktów obiektem `checks` (`checks.typecheck`, `checks.tests`), nazwami z instrukcji agenta | `orchestrate.template.mjs` (`buildVerifierPrompt`) | [ORC-081](docs/decisions/orchestrate-rule-history.md#orc-081) |
| ORC-082 | typecheck warstwy (pełny pakiet) czerwony od zmiany portu/konstruktora, której implementacja należy do późniejszej warstwy | odrocz czerwień, gdy KAŻDY błąd TS leży w dirs późniejszej warstwy; własny zakres, wcześniejsze warstwy i błędy bez ścieżki nadal blokują | `orchestrate.template.mjs` (`typecheckRedIsLaterLayers`) | [ORC-082](docs/decisions/orchestrate-rule-history.md#orc-082) |
| ORC-083 | krok 5 zgłasza każde `finalGate.verdict !== 'GO'` i każdy halt, także gdy winien jest kod | silnik tagi `cause` (`code`/`machine`) na haltach warstw i bramce końcowej; krok 5 zgłasza tylko `machine` | `orchestrate.template.mjs` (`decideVerdict`, pętla warstwy, bramka końcowa) · krok 5 | [ORC-083](docs/decisions/orchestrate-rule-history.md#orc-083) |
| ORC-084 | warstwa: GO bez naruszeń, ale `unverified_scope` po wszystkich próbach, sonda zielona | status `GO_WITH_GAPS` zamiast `ESCALATE_AND_HALT`: przebieg idzie dalej, luki w `report.gaps` → bramka końcowa (nie liczy ich drugi raz) → człowiek; NO_GO bramki wymuszone samym unverified_scope → pliki staged z flagą „wymaga przeglądu” | `orchestrate.template.mjs` (`layerGapsAcceptable`, `filterKnownLayerGaps`, bramka końcowa) · krok 4 | [ORC-084](docs/decisions/orchestrate-rule-history.md#orc-084) |
| ORC-085 | sonda w katalogu pakietu nie zna nazw skryptów roota (`typecheck:web`) → wszystko `skipped`; domyślne 15 wywołań na jednostkę ~40 plików | `_chk`: nazwa w pakiecie → bez sufiksu w pakiecie → w korzeniu; ślepa sonda = log + `report.warnings`; budżet verify/bramki = 15 + (pliki−10), cap 50, jawny wpis wygrywa; GO_WITH_GAPS wymaga ≥1 `pass` | `orchestrate.template.mjs` (`buildProbePrompt`, `scaledBudget`, `layerGapsAcceptable`) | [ORC-085](docs/decisions/orchestrate-rule-history.md#orc-085) |
| ORC-086 | halt maszyny (`cause: machine`) i pytania do człowieka w środku pracy | silnik: weryfikator 2x bez wyniku + sonda zielona → `GO_WITH_GAPS`; agent: sekcja „Po zatrzymaniu": diagnostician → `--overrides` + 1 wznowienie, pytaj tylko przy `code`/zmianie kompozycji/sekrecie | `orchestrate.template.mjs` (`silentVerifierGapsAcceptable`) · sekcja „Po zatrzymaniu" (prompt) | [ORC-086](docs/decisions/orchestrate-rule-history.md#orc-086) |
| ORC-087 | implementer commituje mimo `STAGE_NOT_COMMIT`; zatwierdzona zależność poza zakresem warstwy (package.json/lockfile) → BLOCKED_BY_PRIOR; bramka końcowa milczy | `ZAKAZ COMMITOWANIA` w prompcie + `commits` z sondy drzewa → `report.warnings`; wyjątek manifestów zależności w `scopeBlock`; bramka końcowa: 1 ponowienie z werdyktem po ~70% budżetu, dalej NO_GO `machine` + `stageForReview` | `orchestrate.template.mjs` (`NO_REVERT`, `scopeBlock`, `buildTreeProbePrompt`, bramka końcowa) | [ORC-087](docs/decisions/orchestrate-rule-history.md#orc-087) |
| ORC-088 | stack bez package.json (Flutter): `checks` puste, sonda „skipped", weryfikatory nie kompilują | wpis `checks` ze spacją = komenda dosłowna z korzenia repo (`flutter analyze`), mapowana na `typecheck`/`tests`; `clean-arch`: analyze na warstwach, + test na data/presentation i w bramce końcowej | `orchestrate.template.mjs` (`buildProbePrompt`) · `blocks/clean-arch.yml` | [ORC-088](docs/decisions/orchestrate-rule-history.md#orc-088) |
| ORC-089 | `unverified_scope` bramki końcowej wymienia plik analizy/taska samą nazwą (bez ścieżki) | `filterOwnTaskArtifacts` dopasowuje też po nazwie pliku (≥6 znaków) | `orchestrate.template.mjs` (`filterOwnTaskArtifacts`) | [ORC-089](docs/decisions/orchestrate-rule-history.md#orc-089) |
| ORC-090 | ORC-082 w monorepo (ścieżki `tsc` względem pakietu, zawężone `layers_scope`); stage bierze pliki brudne przed startem; cisza agenta bez przyczyny | `layerOwnsPath` (warianty bez 1-2 początkowych segmentów, pełne `dirs`, także warstwy wcześniejsze); `stageableFiles` wyklucza `dirtyAtStart` poza plikami warstw; `report.askErrors` | `orchestrate.template.mjs` (`typecheckRedIsLaterLayers`, `stageableFiles`, `ask`) | [ORC-090](docs/decisions/orchestrate-rule-history.md#orc-090) |
| ORC-091 | drobne ustalenia (WARN, nity, łatwe NO_GO) — użytkownik musiał ręcznie zlecać ich naprawę przy każdym przebiegu | weryfikatorzy wpisują je do `minor_findings`; warstwa po GO robi jedno przejście naprawcze; bramka końcowa: runda naprawcza + ponowna bramka przy blokujących (≤8); analiza: `minor_fixes` → implementer; wyłączenie `--overrides {"autoFixMinor": false}` | `orchestrate.template.mjs` (`collectMinor`, `groupFindingsByLayer`, pętla warstwy, `repairFinalFindings`) · `orchestrate-prepare.mjs` | [ORC-091](docs/decisions/orchestrate-rule-history.md#orc-091) |
| ORC-092 | `maxTurns` we frontmatterze agenta (verify/final-gate/implementer) mniejszy niż budżet skryptu — agent kończy bez werdyktu, `--overrides` nie pomaga | `maxTurns: 60` w weryfikatorach i bramkach (centralnych i lokalnych); `orchestrate-prepare` ostrzega przed startem, gdy limit agenta < budżet | `orchestrate-prepare.mjs` (`agentTurnCapWarnings`) · definicje agentów | [ORC-092](docs/decisions/orchestrate-rule-history.md#orc-092) |
| ORC-093 | ORC-082 w projekcie z katch-all w wcześniejszej warstwie (`domain: apps/api/src/`): każdy plik uznany za jej własny; goły dir pasuje do nazw plików | jeden właściciel pliku wg specyficzności (nazwa katalogu-segmentu > prefiks, dłuższy dir, remis = brak); odroczenie tylko gdy WSZYSTKIE błędy należą do późniejszej, biegnącej warstwy | `orchestrate.template.mjs` (`layerMatchScore`, `ownerLayerOf`, `typecheckRedIsLaterLayers`) | [ORC-093](docs/decisions/orchestrate-rule-history.md#orc-093) |
| ORC-094 | sonda z kilkoma checks nadpisuje log (tsErrors puste, lint w polu typecheck); subagenci commitują mimo zakazu w prompcie | osobny log per check (`-N.log`), pole `lint` + stałe mapowanie wyników; `hooks/block-subagent-commit.js` (deny git commit/push/… dla subagentów przy świeżym `orchestrating.json`); ostrzeżenie, gdy sonda drzewa nie zwróciła licznika commitów | `orchestrate.template.mjs` (`buildProbePrompt`, `CHECKS_SCHEMA`) · `hooks/block-subagent-commit.js` | [ORC-094](docs/decisions/orchestrate-rule-history.md#orc-094) |
| ORC-095 | przystanki „ok/kontynuuj" między warstwami; raporty i pytania jako akapity, które trzeba prosić o uproszczenie | zakaz pytań o zgodę w trakcie przebiegu (jedno ciągłe przejście, `layers_done` jednym Edit po Workflow); wiadomość końcowa max 3 linie z gotową `report.statusLine`, reszta do pliku; pytanie: 1 naraz, 1-2 zdania, biznesowo, tak/nie lub A/B z rekomendacją | `orchestrate.template.mjs` (`statusLine`) · sekcja „Komunikacja z człowiekiem" (prompt) · `check-human-voice` (długość `ask`) | [ORC-095](docs/decisions/orchestrate-rule-history.md#orc-095) |
| ORC-096 | `git add -N` z wzorcem bez trafień przerywa w całości → nowy, nieśledzony plik testu nie jest liczony → halt „zero testów" | `git ls-files -o --exclude-standard -z -- <wzorce> \| xargs -0 -r git add -N --` zamiast bezpośredniego `git add -N`; fałszywy alarm bramki deterministycznej → `--overrides` + wznowienie, nie ręczne `layers_done` i nie pytanie | `orchestrate.template.mjs` (`buildProbePrompt`) | [ORC-096](docs/decisions/orchestrate-rule-history.md#orc-096) |
| ORC-097 | bramka końcowa na dziedziczonym modelu sesji (Opus) z ~27 tys. tokenów wyjścia na werdykt; koszty modeli bez cennika = $0 | `final_gate.model` (auto = Sonnet, model sesji tylko dla tasków z `threat_model`; inherit/sonnet/opus/haiku wymusza); limit długości wyjścia w prompcie (5 zdań, naruszenia po jednej linii); `estimateCostUsd` z fallbackiem po rodzinie modelu | `orchestrate.template.mjs` (`modelFor`) · `orchestrate-prepare.mjs` · `workflow-metrics-lib.mjs` | [ORC-097](docs/decisions/orchestrate-rule-history.md#orc-097) |
| ORC-098 | bramka końcowa kończyła NO_GO `machine` z samego `unverified_scope` (7 z 8 raportów 2026-10-03/04, zero własnych naruszeń, checks zielone); agent bramki nie uruchamiał `checks` | sonda silnika (Haiku, raz na rundę) uruchamia `final_gate.checks` i oddaje bramce FAKTY; GO + niepusty `unverified_scope` + zero naruszeń + zielona sonda = GO z lukami (`report.gaps` warstwa `final-gate`, `finalGate.gaps_accepted`, `stageForReview`), nie halt; brak/ślepa/czerwona sonda = NO_GO jak dotąd | `orchestrate.template.mjs` (`finalGapsAcceptable`, `buildFinalGatePrompt`, bramka końcowa) | [ORC-098](docs/decisions/orchestrate-rule-history.md#orc-098) |
| ORC-099 | czerwone TESTY w plikach późniejszej jednostki (AIG-082: zmiana Config psuje registry, 36 testów w 15 plikach) dawały halt, bo ORC-082 odracza tylko typecheck | sonda zwraca `testFailFiles` + `testFilesFailed`; `tests: deferred`, gdy lista = podsumowanie runnera i każdy plik należy do późniejszych warstw; inaczej halt jak dotąd | `orchestrate.template.mjs` (`testsRedIsLaterLayers`, `buildProbePrompt`) | [ORC-099](docs/decisions/orchestrate-rule-history.md#orc-099) |
| ORC-100 | warstwa zamykana z GO i tym samym `unverified_scope` kilka razy z rzędu (~25 wystąpień ORC-069): każda próba pali świeży budżet weryfikatora, bez efektu | `reverify` niesie `gaps`; ten sam zbiór luk w kolejnej rundzie + GO bez naruszeń + zielona sonda = GO_WITH_GAPS od razu, bez pozostałych prób | `orchestrate.template.mjs` (`repeatedGapsAcceptable`, pętla warstwy) | [ORC-100](docs/decisions/orchestrate-rule-history.md#orc-100) |
| ORC-101 | `minor_fixes` z analizy dotyczące dokumentacji/rejestrów (poza `dirs` każdej warstwy) pomijała każda warstwa; bramka zgłaszała je jako niewykonane, a przebieg kończył się pytaniem „ja czy ty?” | `orphanMinorFixes` wskazuje pozycje bez właściciela; jedno przejście ostatniego implementera przed bramką końcową jako jawny wyjątek od zakresu; wynik w `report.docFixes`, porażka → `minorFindings` + ostrzeżenie, bez halt | `orchestrate.template.mjs` (`orphanMinorFixes`, krok 4b) | [ORC-101](docs/decisions/orchestrate-rule-history.md#orc-101) |
| ORC-102 | frontmatter analizy z błędem składni YAML przechodził bramkę (status z regexu), a `units[]`, `decisions[]`, `layers_scope`, `minor_fixes` znikały z planu bez ostrzeżenia (ai-gateway TS-AIG-084: 10 jednostek, w tym `docs`; 101 z 926 analiz we flocie) | `splitFrontmatter` zwraca `fmError`; `prepare` kończy exit 2 z treścią błędu; hook `check-human-voice` ostrzega już przy zapisie analizy | `orchestrate-prepare.mjs` (`splitFrontmatter`, bramka analizy) · `hooks/check-human-voice.js` | [ORC-102](docs/decisions/orchestrate-rule-history.md#orc-102) |
| ORC-103 | runda naprawcza po bramce końcowej raportowała naprawę 13 ustaleń, a żaden plik się nie zmienił (marketing-hub TS-MH-007); 3 niestabilne testy czerwone tylko pod obciążeniem całego zestawu (grant-flow, obejście `tests=false`); BLOCKED_BY_PRIOR nie wskazywał wcześniejszej warstwy-właściciela, a wznowienie ją pomijało (`layers_done`) (ai-gateway TS-AIG-073) | odcisk drzewa przed i po każdej naprawie — brak zmiany = ostrzeżenie, bez sondy i bez ponownej bramki, drobne zostają w `minorFindings`; sonda uruchamia padające pliki raz osobno (`testsRerunPassed`) i przy zgodnej liście traktuje testy jako zielone z ostrzeżeniem; komunikat BLOCKED_BY_PRIOR nazywa wcześniejszą warstwę i podpowiada usunięcie z `layers_done` | `orchestrate.template.mjs` (`fixLeftTreeUnchanged`, `testsFlakyUnderLoad`, `earlierRedOwners`, `blockedByPrior`) | [ORC-103](docs/decisions/orchestrate-rule-history.md#orc-103) |
| ORC-104 | weryfikator warstwy dawał GO z `unverified_scope` złożonym ze specyfikacji, które należą do bardziej specyficznej jednostki testing (`layerTouches` = podciąg ścieżki, więc `…/queues/` obejmował `…/queues/__tests__/`), co po 3 próbach kończyło ESCALATE (juz-ide-api-1 TS-AUTH-CAPABILITIES-INIT-001); sonda biegła w katalogu bieżącym agenta, nie w korzeniu repo; GO sprzed zatrzymania nie trafiały do `layers_done` | pozycja `unverified_scope` należy do warstwy wygranej w rankingu specyficzności (ORC-093) → cudza robota, nie luka tej warstwy; polecenie sondy zaczyna się od `cd "$(git rev-parse --show-toplevel)"`; instrukcja: `layers_done` dopisuj także po HALT | `orchestrate.template.mjs` (`decideVerdict`, `buildProbePrompt`) · prompt (krok `layers_done`) | [ORC-104](docs/decisions/orchestrate-rule-history.md#orc-104) |

## Co zrobić z regułą „tylko prompt"

Wiersz z mechanizmem „tylko prompt" nie jest gorszy — jest **niezabezpieczony**. Gdy taka
reguła zostanie złamana w realnym przebiegu, właściwą reakcją jest przeniesienie jej do
`orchestrate-prepare.mjs` (jeśli da się rozstrzygnąć deterministycznie przed startem),
do `orchestrate.template.mjs` (jeśli dotyczy kształtu promptu albo pętli) albo do nowej
reguły `workflow-lint` (jeśli dotyczy kształtu skryptu) — a nie dopisanie kolejnego akapitu
prozy do tego pliku. Tak powstał ten rejestr.

## Raport

Do czatu: **maksymalnie 3 linie** wg sekcji „Komunikacja z człowiekiem" (co się zmieniło w 1-2 zdaniach
językiem `human_voice`, gotowa linia `report.statusLine`, ewentualnie jedno pytanie). Część „Przebieg"
(które sloty i którzy agenci działali z `# source:` bloku, ile prób zjadła każda warstwa, czy budżety
zadziałały miękko, werdykty bramek, lista plików, `runtimeHash` z kroku 2, `warnings`, `gaps`,
`minorFindings`, `askErrors`) zapisz do `.claude/run-state/{TASK-ID}.report.md`; w czacie najwyżej
jedna linia ze ścieżką do tego pliku, tylko gdy coś z tego jest niepuste.
