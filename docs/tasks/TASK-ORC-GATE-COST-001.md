---
id: TASK-ORC-GATE-COST-001
title: 'Bramka końcowa: wyłącznik pętli NO-GO, powtórna bramka na delcie, eksperyment z diffem w prompcie i pilotaż katalogu pułapek'
type: feature
status: todo
priority: P2
story_points: 8
created_date: 2026-11-10
updated_date: 2026-11-10
assignee: '@unassigned'
labels: [orchestrate, gate, cost, telemetry]
depends_on: [TASK-OBS-018]
related: [TASK-OBS-018, TASK-ORC-FINAL-GATE-CHUNKS-001, TASK-COST-CONTEXT-001]
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

## Zakres (cztery niezależne etapy)

### E1. Wyłącznik pętli

`orchestrate-prepare.mjs` przed startem runu sprawdza lokalne surowe zdarzenia (`telemetry/events/`) tego `taskRef`.
Gdy dwa ostatnie runy skończyły się NO-GO bramki z tym samym `ruleSignature` (z `TASK-OBS-018`), start jest odmowny, a
komunikat podaje wspólne `ruleId` i co trzeba zmienić (specyfikacja, `analysis.md`, decyzja). Wyjście: jawny
`--allow-repeat`. Najpierw tryb ostrzegawczy: log „zablokowałbym" bez blokady.
Do sprawdzenia przed implementacją: jak ORC-139 (wiązanie werdyktu z hashem drzewa, outcome `cached`) zachowuje się, gdy
drzewo jest identyczne; jeśli już tu jest odcięcie, E1 ogranicza się do przypadku zmienionego drzewa i tych samych ustaleń.
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

- [ ] E1: tryb ostrzegawczy zapisuje w telemetrii zdarzenie „zablokowałbym" z `ruleId`; blokada włączana osobną flagą;
      `--allow-repeat` działa; test w `orchestrate-script`.
- [ ] E2: prompt kolejnej bramki zawiera poprzednie ustalenia i diff od ostatniej bramki; pierwszy przebieg bramki bez zmian;
      wynik A/B opisany w sekcji Wynik.
- [ ] E3: wynik eksperymentu (cztery metryki z bazą) opisany w sekcji Wynik; wdrożenie tylko przy braku spadku NO-GO.
- [ ] E4: klasyfikacja 55 wpisów w pliku zadania; reguły z klasy A w `tools/conformance` z testami; karty klasy B w
      limicie tokenów; pomiar po ok. 100 runach.
- [ ] Konwencja repo: `count-assets.mjs --check-docs`, walidatory CI, `CHANGELOG.md`, `METADATA.yml`.

## Wynik

(do uzupełnienia po wykonaniu)
