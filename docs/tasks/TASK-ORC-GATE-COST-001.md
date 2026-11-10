---
id: TASK-ORC-GATE-COST-001
title: 'Bramka końcowa: wyłącznik pętli NO-GO, powtórna bramka na delcie, eksperyment z diffem w prompcie i pilotaż katalogu pułapek'
type: feature
status: in-progress
priority: P2
story_points: 8
created_date: 2026-11-10
updated_date: 2026-11-10
assignee: '@unassigned'
labels: [orchestrate, gate, cost, telemetry]
depends_on: [TASK-OBS-018]
related: [TASK-OBS-018, TASK-OBS-019, TASK-ORC-FINAL-GATE-CHUNKS-001, TASK-COST-CONTEXT-001]
source: 'analiza telemetrii i transkryptów juz-ide-api, 2026-11-09/10 (docs/DECISIONS-LOG.md, wpis 2026-11-09)'
---

# TASK-ORC-GATE-COST-001: koszt bramki końcowej i pętli NO-GO

## 🎯 Goal

Zmniejszyć koszt `/orchestrate` tam, gdzie go widać w danych, bez osłabiania bramki: zatrzymać runy, które odbijają się
od tego samego ustalenia, taniej powtarzać bramkę po poprawce, ograniczyć czytanie plików po kolei przez bramkę i
przenieść powtarzalne błędy z drogiej bramki do tanich kontroli przed nią. Każdy etap jest warunkowany pomiarem
(jak w `TASK-COST-CONTEXT-001`) i może wejść osobno.

## Dane wyjściowe (telemetria, 2026-10-01..11-10)

- Koszt `orchestrate`+`analyze`: $4200. Bramka `security-e2e-verifier` (Opus): 175 kroków, **$892 (21%)**, ok. $5,29 za
  krok, mediana **43 wywołań narzędzi** przy limicie 60 (to efekt ORC-152: werdykt najpóźniej po 70% limitu).
- Pierwsza bramka w runie (n=130): NO-GO 47%, GO 44%, `died` 9%. Kolejne bramki w runie: 45 sztuk, **$194**, średnio
  $4,31 wobec $5,37 pierwszej.
- Powtarzane runy: 171 zadań, 417 runów (2,4 na zadanie); 74 zadania biegły więcej niż raz i kosztowały $2751; runy
  zakończone `no_go` to $1276. 10% najdroższych zadań to 51% kosztu. `TS-REP-NEIGHBOR-SIGNALS-001`: 7 kolejnych runów
  NO-GO po dwie odrzucone bramki. Brak odcisku ustaleń uniemożliwia sprawdzenie, czy to było to samo ustalenie
  (stąd zależność od `TASK-OBS-018`).
- Weryfikator warstwy nie przewiduje wyniku bramki: przy samych GO bramka dała NO-GO w 46% runów (31 z 68). Nie
  usuwamy go (decyzja z 2026-11-10: zysk poniżej 2% kosztu, utrata 6 wykrytych błędów).
- Bramka zostaje na Opusie z `effort: max` (decyzja 2026-11-09): ok. 1,8 tys. tokenów wyjścia na wywołanie, koszt to liczba
  tur i czytany kontekst, a nie głębokość myślenia.

## Stan po TASK-OBS-018 (zamknięte 2026-11-10, w `develop`)

Dane i narzędzia, na których stoją etapy poniżej:

- `step.ruleHits` (`[{ruleId, line?}]`) i `step.rulesChecked` w zdarzeniach `step.end` ról `verifier` i `gate`; `step.checks`
  (wynik sondy per kontrola, w tym `shadowLint`) w roli `probe`. Prompty weryfikatora i bramki proszą o `findings`
  (`FINDINGS_FIELD`), schemat jest celowo luźny. Opis: ORC-156 w `docs/decisions/orchestrate-rule-history.md`, aneks w ADR 0012.
- `scripts/lib/telemetry-rules.mjs`: `ruleSignature(ruleHits)` (odcisk: posortowane unikalne `ruleId` bez `new`, 12 znaków hex,
  `null` gdy brak znanych identyfikatorów), `normalizeRuleHits`, `normalizeRuleId`. Odcisk **nie jest polem zdarzenia**: liczy się
  go przy odczycie.
- Rollup ma blok `rules` per rola i agent (`reports`, `hits`): `reports` do `n` roli to pokrycie raportowaniem, a udział
  `hits.new` to miara luk katalogu pułapek (E4).
- **Dane pojawią się dopiero po nowych przebiegach.** Zdarzenia sprzed merge'a nie mają `ruleHits`, więc E1 w trybie
  ostrzegawczym nie ma na czym działać, dopóki instancje nie wykonają `/orchestrate` na nowym prompcie i nie ruszy kolektor.
  Historia zdarzeń zaczyna się w połowie września (lipiec i sierpień są tylko w surowym `~/.claude/metrics/workflow-steps.jsonl`,
  bez `findings`).
- **ORC-139 nie odcina powtórnej bramki** (sprawdzone 2026-11-10): wiązanie z hashem drzewa (`treeBinding` w
  `orchestrate.template.mjs`, `scripts/orchestrate-tree-hash.mjs`) chroni *świeżość werdyktu GO* przy stagingu, a nie cache'uje
  bramki ani nie wykrywa jej powtórzenia na tym samym drzewie. Hasha drzewa nie ma w zdarzeniach (jest w raporcie przebiegu,
  `report.treeHash`). Wniosek: E1 zaczyna od odcisku ustaleń; kryterium „drzewo bez zmian od ostatniego NO-GO" wymagałoby
  zapisania hasha bramki (zmiana schematu), więc to opcja na później, nie część E1.
- Punkty zaczepienia dla E1: `scripts/orchestrate-prepare.mjs` (ma `warnings` i `die(EXIT.*)`; zna `taskId`), odczyt zdarzeń
  przez `eventsDir()`/`readEvents()` z `scripts/lib/telemetry-events.mjs` (zdarzenia wszystkich instancji tej maszyny leżą w
  jednym katalogu, `taskRef` jest pisany wielkimi literami z nazwy workflow), `deviation` przez `scripts/report-deviation.mjs`
  (trigger trzeba zmapować w `defaultCategory`).
- **`TASK-OBS-019` jest niezależne i niczego tu nie blokuje.** Gdy powstanie (czeka na format lintu i potwierdzenie z juz-ide-api),
  doda `file` w lokalnych zdarzeniach i `shadowLintHits`; E1 może wtedy dopasowywać po miejscu, ale zostaje na poziomie `ruleId`.

## Zakres (cztery niezależne etapy)

### E1. Wyłącznik pętli

`orchestrate-prepare.mjs` przed startem runu sprawdza lokalne surowe zdarzenia (`telemetry/events/`) tego `taskRef`.
Gdy dwa ostatnie runy skończyły się NO-GO bramki z tym samym `ruleSignature` (z `TASK-OBS-018`), start jest odmowny, a
komunikat podaje wspólne `ruleId` i co trzeba zmienić (specyfikacja, `analysis.md`, decyzja). Wyjście: jawny
`--allow-repeat`. Najpierw tryb ostrzegawczy: log „zablokowałbym" bez blokady.
Sprawdzone 2026-11-10: ORC-139 nie odcina powtórnej bramki na identycznym drzewie (patrz „Stan po TASK-OBS-018"), więc kryterium
E1 to wyłącznie odcisk ustaleń (`ruleSignature` z `ruleHits` bramki); odcisk `null` (same `new` albo brak raportu) nigdy nie
zatrzymuje runu. Porównujemy dwa ostatnie runy tego `taskRef`, nie pojedyncze próby w runie.
**Pomiar:** w trybie ostrzegawczym policzyć, ile runów zostałoby zatrzymanych i czy następny run bez zmian dał inny wynik.
Blokadę włączać dopiero, gdy fałszywych zatrzymań jest 0 na próbie ≥ 20.

### E2. Powtórna bramka na delcie

Druga i kolejne bramki w runie dostają: poprzednie ustalenia (`ruleHits` + `violations`), diff od ostatniej bramki i
polecenie „sprawdź, czy naprawiono te punkty, i przejrzyj tylko deltę". Cel: koszt poniżej $2,5 (dziś $4,31).
**Pomiar:** A/B na re-bramkach (połowa pełna, połowa delta); zgodność werdyktu ≥ 95%, a każde ustalenie, które pełna
bramka znalazła poza deltą, jest wypisane i oceniane ręcznie przed włączeniem.

### E3. Diff w prompcie bramki (eksperyment na jednej instancji)

Dziś `buildFinalGatePrompt` (`orchestrate.template.mjs:854`) podaje tylko listę zmienionych plików, więc agent czyta je po
kolei. Eksperyment: dołączyć diff (z limitem rozmiaru) i pozwolić na `Read` tylko do kontekstu poza diffem.
Koordynować z `TASK-ORC-FINAL-GATE-CHUNKS-001` (diff powyżej ~40 plików).
**Pomiar:** mediana wywołań narzędzi (dziś 43), koszt bramki (dziś $5,29), odsetek NO-GO pierwszej bramki i odsetek
`unverified_scope` nie mogą pogorszyć się względem bazy. Gdy NO-GO spada, uznać to za utratę jakości, nie za oszczędność.

### E4. Pilotaż katalogu pułapek

Źródło: 55 wpisów pamięci `security-e2e-verifier` (identyczne w 8 instancjach juz-ide-api), których implementerzy nie
widzą (nie mają katalogu pamięci). Klasyfikacja: **A** mechaniczne (grep/AST, np. `onFailed` bez `@OnWorkerEvent`) →
reguły `tools/conformance`; **B** semantyczne domenowe → krótkie karty (objaw, gdzie boli, jak sprawdzić, poprawka)
wstrzykiwane implementerom istniejącym mechanizmem kart reguł, routing po warstwie i plikach, **limit ok. 3 tys. tokenów
na start implementera** (każdy wstrzyknięty token jest czytany przy każdym wywołaniu); **C** środowiskowe i procesowe →
krótki runbook uruchamiany hookiem po pasującym komunikacie błędu. Wstępna ocena z indeksu: ok. 12 / 35 / 8; przed
pracą potwierdzić czytając pliki wpisów.
**Pomiar:** udział `ruleId` = `new` w ustaleniach bramki (miara luk katalogu) oraz odsetek NO-GO pierwszej bramki
(baza 47%, n=130) po ok. 100 runach.

## Poza zakresem

Zmiana modelu, `effort` albo `maxTurns` bramki i implementerów (decyzje z 2026-11-09 w `docs/DECISIONS-LOG.md`; dane nie
uzasadniają zmiany), rozgrzewka agentów i rozmiar kontekstu startowego (`TASK-COST-CONTEXT-001`).

## Kryteria akceptacji

- [x] E1 (tryb ostrzegawczy): zdarzenie „zablokowałbym" z odciskiem (`ruleId` przez złączenie, patrz Wynik); blokada włączana osobną
      flagą; `--allow-repeat` działa; test w evalu `orchestrate-prepare`. Włączenie blokady czeka na dane (≥ 20 zatrzymań, 0 fałszywych).
- [ ] E2: prompt kolejnej bramki zawiera poprzednie ustalenia i diff od ostatniej bramki; pierwszy przebieg bramki bez zmian;
      wynik A/B opisany w sekcji Wynik.
- [ ] E3: wynik eksperymentu (cztery metryki z bazą) opisany w sekcji Wynik; wdrożenie tylko przy braku spadku NO-GO.
- [ ] E4: klasyfikacja 55 wpisów w pliku zadania; reguły z klasy A w `tools/conformance` z testami; karty klasy B w
      limicie tokenów; pomiar po ok. 100 runach.
- [ ] Konwencja repo: `count-assets.mjs --check-docs`, walidatory CI, `CHANGELOG.md`, `METADATA.yml`.

## Wynik

### E1. Wyłącznik pętli (tryb ostrzegawczy), 2026-11-10, ORC-157

**Zrobione.**
- `scripts/lib/orchestrate-loop-guard.mjs`: `assessRepeat` (czysta ocena na liście zdarzeń), `loadTaskEvents` (od najnowszego pliku
  miesięcznego, staje po dwóch runach), `recordRepeat` (zdarzenie `deviation`, deterministyczne `id`), `checkLoop` (wejście dla prepare,
  nie rzuca). O runie rozstrzyga ostatnia bramka końcowa (`final:final:gate#N`, starsze `final-gate-r2`); bramki `final-fix-*` nie.
- `orchestrate-prepare.mjs`: po bramce analizy wywołuje `checkLoop`; flagi `--block-repeat` (exit 5) i `--allow-repeat`. Bez flag tylko
  ostrzeżenie w `warnings[]` i zdarzenie `repeat_no_go` (`cause: verifier`, mapowanie w `defaultCategory`).
- `scripts/loop-guard-replay.mjs`: pomiar na historii (zatrzymania słuszne i fałszywe, pokrycie odciskiem).
- Testy: 13 przypadków w `tests/flow-evals/orchestrate-prepare/run.js` (ten sam odcisk ×2 → ostrzeżenie i jedno zdarzenie, bez dubla
  przy powtórce; blokada exit 5; `--allow-repeat`; różne odciski; odcisk `null` z samych `new`; brak raportu; inny `taskRef`; wielkość liter;
  tylko dwa ostatnie runy ×2; bramka poprawki `final-fix`; stare id `final-gate-r2`; jeden wcześniejszy run) i asercja `defaultCategory` w
  `telemetry-events`. Sprawdzone mutacjami (bez wykluczenia `final-fix`, bez porównania odcisków, `--allow-repeat` ignorowane: każda
  zaczerwienia właściwe przypadki). Eval prepare od teraz izoluje telemetrię (`CLAUDE_TELEMETRY_DIR` w katalogu tymczasowym).

**Dane.** Po merge'u OBS-018 w `telemetry/events/*.jsonl` jest **0** zdarzeń z `step.ruleHits` (5 plików, 56 tys. zdarzeń). Z 196 NO-GO
bramki końcowej żadne nie ma odcisku, więc E1 napisano i przetestowano na zdarzeniach syntetycznych.

**Pomiar** (`node scripts/loop-guard-replay.mjs`, 270 tasków, 296 startów od trzeciego runu): zablokowałbym **0**, słusznie 0, fałszywie 0.
Próba za mała na jakąkolwiek decyzję (próg: ≥ 20 zatrzymań i 0 fałszywych). Skrypt sprawdzony na zdarzeniach syntetycznych (jedno
zatrzymanie słuszne, jedno fałszywe: następny run dał GO).

**Odstępstwa od opisu zadania.**
- Test jest w evalu `orchestrate-prepare`, nie w `orchestrate-script`: logika siedzi w prepare, nie w szablonie Workflow.
- Zdarzenie „zablokowałbym" niesie odcisk w `signature` (`repeat-no-go.<12 hex>`), a nie listę `ruleId`: schemat `deviation` jej nie ma, a
  `ruleHits` wolno trzymać tylko w krokach `verifier`/`gate` (inaczej rollup liczyłby je podwójnie). `ruleId` odzyskuje się złączeniem po
  odcisku; lista `ruleId` jest w ostrzeżeniu prepare.
- Dopasowanie po `taskRef` obejmuje wszystkie instancje maszyny (zdarzenia leżą w jednym katalogu), zgodnie z opisem E1. Jeśli pomiar
  pokaże fałszywe zatrzymania przy przenoszeniu taska między instancjami, zawęzić do `project`.
- Worktree `_claude-patterns-gate-cost` nie istniał; praca w głównym drzewie, gdzie branch był już wyciągnięty.

**Co dalej dla E1.** Włączenie blokady wymaga danych: po nowych przebiegach (z `FINDINGS_FIELD`) uruchomić `loop-guard-replay.mjs` i
zdecydować po ≥ 20 zatrzymaniach. Domyślne `--block-repeat` to osobna reguła (ORC-158+).

### E2–E4

(do uzupełnienia po wykonaniu)
