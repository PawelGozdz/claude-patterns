---
id: TASK-ORCH-FALSE-GO-001
title: 'Silnik `/orchestrate` przepuszcza niewykonaną pracę: no-op po czerwonej sondzie, bramka końcowa bez pełnej listy plików i bez testów regresji'
type: bugfix
status: done
priority: P1
story_points: 3
created_date: 2026-09-24
updated_date: 2026-09-24
assignee: '@unassigned'
labels: [kaizen, orchestration, workflow]
depends_on: [TASK-ORCH-PROBE-NEW-FILES-001]
related: [TASK-ORCH-PREPARE-FORMS-001, TASK-ORCH-IMPL-SILENT-001]
source: >
  Feedback z marketing-hub, 2026-09-24, run wf_a95b083c-a06 (TS-MH-005), wcześniej TS-MH-001/002/003.
  Journal: ~/.claude/projects/-opt-projects-marketing-hub/a38e6efd-…/subagents/workflows/wf_a95b083c-a06/journal.jsonl.
  Każde twierdzenie sprawdzone w kanonie (scripts/workflow/orchestrate.template.mjs,
  scripts/orchestrate-prepare.mjs, blocks/ddd/layers.yml) 2026-09-24.
---

# TASK-ORCH-FALSE-GO-001: fałszywe GO z silnika

## 🎯 Goal

Raport GO ma znaczyć, że praca warstwy jest zrobiona i zielona. Dziś istnieją trzy ścieżki, na
których silnik zwraca GO (albo przepuszcza zmianę przez bramkę końcową), choć część pracy nie
została wykonana albo nie została sprawdzona.

## 1. No-op osiągalny po NO_GO z sondy (ORC-038 / l. 490, 561)

Sonda uruchamia `checks` na całym repo, a warstwa ma wąski zakres. Czerwony lint albo test
z wcześniejszej warstwy wychodzi w późniejszej. Pętla ustawia `violations` i wraca do
implementera (l. 561-571). Implementer odpowiada `changed_files: []` z `no_changes_reason`
(„poza zakresem"), gałąź 1b (l. 490) woła weryfikatora w trybie `verify-noop`, a jego prompt
(l. 260-273) nie zawiera ani wyniku sondy, ani listy naruszeń. Weryfikator ocenia samo
twierdzenie „ta warstwa nie ma nic do zrobienia", zgadza się i warstwa dostaje GO. W TS-MH-005
dotyczyło to 4 z 4 warstw infrastruktury.

Poprawka:

- Po NO_GO z sondy gałąź `verify-noop` jest niedostępna. Implementer, który zwraca pustą listę
  po czerwonej sondzie, dostaje status `BLOCKED_BY_PRIOR` (gdy czerwień jest poza zakresem
  warstwy) albo kolejną próbę. W żadnym wypadku nie dostaje GO.
- Rozróżnienie „moja czerwień / odziedziczona": sonda bazowa na starcie warstwy (te same
  `checks`, przed implementerem) i porównanie wyniku. Koszt: jedno dodatkowe wywołanie haiku
  na warstwę z `checks`. Alternatywa bez sondy bazowej: `BLOCKED_BY_PRIOR` zawsze, gdy
  implementer twierdzi, że czerwień jest spoza zakresu, i decyzja należy do człowieka.
  Do rozstrzygnięcia przy implementacji; obie są lepsze niż dzisiejsze GO.
- `BLOCKED_BY_PRIOR` kończy przebieg jak `ESCALATE_AND_HALT` (z innym powodem w raporcie),
  bo kolejne warstwy trafią na tę samą czerwień.
- Nowa reguła `hooks/workflow-lint.js`: ścieżka `verify-noop` nie może być osiągalna po
  NO_GO z sondy w tej samej warstwie. Test dwukierunkowy: obecny szablon zatrzymany,
  poprawiony przechodzi.

Źródło czerwieni z wcześniejszej warstwy to w dużej mierze punkt 3 niżej: `domain` i
`application` nie mają `checks`, więc ich lint i typecheck wychodzą dopiero w `infrastructure`.

## 2. Bramka końcowa dostaje niepełną listę plików i nie dostaje wzorców (l. 302, 629, 651)

`allChangedFiles` to suma `settled.files` z warstw. Warstwy zakończone jako no-op oddają
`files: []`, więc bramka nie widzi infrastruktury, migracji ani kontraktów. W TS-MH-005
weryfikator bramki zauważył to sam i zajrzał do HEAD. `buildFinalGatePrompt` nie wstawia też
kart reguł (`renderCards`), więc bramka ocenia całość zmiany bez wzorców.

Poprawka:

- Lista plików dla bramki pochodzi z drzewa, nie z raportów warstw: jedna sonda (haiku) na
  początku fazy „Bramka końcowa" z tym samym poleceniem co bramka „kod istnieje" po
  TASK-ORCH-PROBE-NEW-FILES-001 (śledzone, zestage'owane, nieśledzone). Baza porównania to
  `HEAD` z chwili startu przebiegu; prepare zapisuje ją w `args.baseSha`.
- `report.staged` bierze tę samą listę.
- `buildFinalGatePrompt` dostaje `renderCards(a.patterns)`: wszystkie wzorce przebiegu,
  bez filtra warstwy.

## 3. Bramka końcowa traci testy, gdy warstwa testing jest pominięta (prepare l. 437, ORC-022)

`finalChecks` to suma `checks` warstw, które weszły. W `blocks/ddd/layers.yml` warstwy
`domain`, `application` i `infrastructure` nie mają `checks`, więc gdy analiza pomija
`testing`, bramka końcowa nie uruchamia żadnego testu regresji. Dzieje się to dokładnie wtedy,
gdy test regresji jest najbardziej potrzebny.

Poprawka:

- Nowe pole `orchestrate.final_gate.checks` w bloku (schemat `schemas/block.schema.json`).
  Prepare: `finalChecks = unique(final_gate.checks ∪ checks warstw, które weszły)`. Pole jest
  dołączane zawsze, niezależnie od `layers_skip`.
- `blocks/ddd/layers.yml`: `checks` dla `domain` i `application` (`typecheck`, `lint:check`)
  oraz `final_gate.checks: [typecheck, lint:check, test]`. Sprawdzić, czy te same nazwy
  skryptów istnieją w projektach na tym bloku (ORC-017: brak skryptu to „skipped" w raporcie,
  nie błąd).
- Zaktualizować ORC-022 w `docs/decisions/orchestrate-rule-history.md`.

## ✅ Kryterium ukończenia

- `tests/flow-evals/orchestrate-script/run.js` ma trzy przypadki:
  (a) sonda NO_GO, implementer zwraca no-op → brak GO; status `BLOCKED_BY_PRIOR` albo poprawka;
  (b) warstwa no-op + warstwa ze zmianami → bramka końcowa dostaje pliki obu z sondy drzewa;
  (c) `layers_skip: [testing]` → `checks.finalGate` z prepare zawiera `test`.
- Prompt bramki końcowej zawiera blok kart.
- `hooks/workflow-lint.js` bez naruszeń; nowa reguła ma test dwukierunkowy.
- Wpis w `orchestrate-rule-history.md` (ORC-022 zmieniony, nowy ORC dla `BLOCKED_BY_PRIOR`),
  `CHANGELOG.md`, `METADATA.yml`.

## Wynik (2026-09-24)

- Punkt 1: wariant bez sondy bazowej. Po czerwonej sondzie twierdzenie „brak zmian" daje
  `BLOCKED_BY_PRIOR` (`blockedByPrior`, `haltsRun`), implementer dostaje instrukcję, jak zgłosić
  czerwień spoza zakresu, a weryfikator no-op dostaje naruszenia z poprzedniej rundy. WL17 (ERROR),
  testowane na kanonicznym skrypcie z wyciętą blokadą. ORC-062.
- Punkt 2: sonda drzewa przed bramką końcową względem `baseSha` z prepare, `finalFileList` (drzewo ∪
  warstwy), karty wszystkich wzorców w prompcie, `dirtyAtStart` osobno. ORC-063.
- Punkt 3: `final_gate.checks` w schemacie bloku i w prepare (zawsze, przed sumą warstw; ostrzeżenie
  przy pustej liście). `ddd/layers`: checks dla wszystkich czterech warstw i bramki; `flat-service`:
  checks bramki. Goldeny `materialize-runtime` zaktualizowane. ORC-022 uzupełnione.
- Poza zakresem: projekty z własnym blokiem warstw (marketing-hub `./layers-monorepo`) muszą dopisać
  `final_gate.checks` u siebie; wszystkie projekty dostaną zmianę bloku po ponownym `setup-project.sh`.
  Bloki Flutter (`clean-arch`, `flutter`) bez zmian: sonda woła `npm run <check>`, więc checks dla
  Darta wymagają osobnej zmiany w sondzie.
