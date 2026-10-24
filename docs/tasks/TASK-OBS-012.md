---
id: TASK-OBS-012
title: 'Rollup: fałszywe werdykty i blok tasks (koszt do pierwszego GO)'
type: feature
status: done
priority: P1
story_points: 3
created_date: 2026-10-22
updated_date: 2026-10-23
assignee: '@unassigned'
labels: [observability, telemetry]
epic: EP-OBSERVABILITY-002
depends_on: []
related: [TASK-OBS-005, TASK-OBS-014]
source: 'ADR 0015 D2, D3'
---

# TASK-OBS-012: fałszywe werdykty i blok `tasks` w rollupie

## 🎯 Goal

Odpowiedzieć z danych, które już są, na dwa pytania: który weryfikator przepuszcza rzeczy, które bramka
końcowa potem odrzuca, i ile kosztuje dowiezienie jednego taska. Dziś bramka odrzuca 34% przebiegów,
a nie wiadomo, czyje GO było fałszywe; 46 ze 122 tasków w październiku potrzebowało więcej niż jednego
przebiegu, a rollup zna tylko przebiegi.

## Zakres

1. `scripts/lib/telemetry-rollup.mjs`, per proces × rola × agent: `verdicts.falseGo` (werdykt `go`
   jednostki, po którym bramka końcowa tego przebiegu dała `no_go` z naruszeniem w tej jednostce) i
   `verdicts.falseNoGo` (`no_go`, po którym kolejny werdykt jednostki to `go` bez kroku `fixes`
   pomiędzy). Definicja jednostki jak w `verification.firstPassGo`.
2. Blok `tasks` w rollupie (klucz `taskRef`, tylko lokalnie): liczba przebiegów, koszt do pierwszego
   `go` bramki końcowej, koszt łączny, czas od pierwszego `run.start` do ostatniego `run.end`. Task
   przechodzący przez północ liczy się do dnia ostatniego `run.end`.
3. `scripts/lib/telemetry-export.mjs`: z bloku `tasks` wychodzą wyłącznie rozkłady (p50/p90 kosztu do GO,
   histogram liczby przebiegów 1/2/3/4+). `findLeaks` odrzuca paczkę z kluczem wyglądającym jak TS-ID.
4. Eval `tests/flow-evals/telemetry-rollups/` i `telemetry-export/`: fixture z fałszywym GO, z taskiem
   na dwa przebiegi, i test, że identyfikator taska nie opuszcza eksportu.
5. Przeliczenie historii (`telemetry-aggregate.mjs` bez `--since`) i jedna liczba w CHANGELOG: odsetek
   fałszywych GO per agent weryfikujący w październiku.

## Kontekst dla świeżej sesji

- Bramka końcowa to krok `final-gate` z `role: gate`; naruszenia per jednostka są w `report.finalGate.violations`
  (Workflow), ale zdarzenie `step.end` ich nie niesie. Rozstrzygnij najpierw, czy wystarczy heurystyka
  „NO_GO bramki + jednostka z GO w tym przebiegu" czy collector ma dopisać do `step.end` bramki listę
  jednostek z naruszeniem (bez nazw plików: id jednostki jest już w `plan`). Zapisz decyzję w ADR 0012.
- `taskRef` jest w zdarzeniach `orchestrate` od migracji (393/420 kanonicznych przebiegów), w `analyze`
  z `--task`.

## Analiza (2026-10-23)

Pomiary na zdarzeniach (26 251, w tym 9 842 `orchestrate`) i na surowych wynikach przebiegów (`wf_*.json`, 246 kanonicznych):

| Pytanie | Wynik |
|---|---|
| Ile NO_GO pierwszej bramki ma w tym samym przebiegu krok `*-final-fix`? | 26 ze 123. W pozostałych 97 przebieg kończy się na bramce, więc samo zdarzenie nie mówi, która jednostka zawiniła. |
| Czy wystarczy „NO_GO bramki + jednostka z GO w przebiegu"? | Nie. W 147 przebiegach z NO_GO jest 293 warstw ze statusem GO, więc prawie każde GO wyszłoby fałszywe. |
| Czy `step.end` bramki niesie jednostki? | Nie. Naruszenia (`finalGate.violations`) są tylko w wyniku Workflow, jako teksty ze ścieżkami. |
| Czy z wyniku da się przypisać naruszenie do warstwy? | Częściowo. Po ścieżce z `layers[].files` trafia 169 z 496 naruszeń (34%), co daje wskazanie warstwy w 74 ze 147 przebiegów. Reszta dotyczy dokumentów, luk w sprawdzeniu albo przyczyny maszynowej. |
| Czy wynik da się przeliczyć dla historii? | Tak, ale tylko z `wf_*.json` (wrzesień–październik). Zdarzenia są zapisywane raz i nie zawierają naruszeń. |
| Czy klucz `taskRef` pasuje do `findLeaks`? | W 198 z 210 przypadków. Formaty `BOT-005a`, `TS-SIM-002A`, `FP-005b` i `DS009-…` przechodzą bez trafienia, a numery czysto liczbowe (`0007`) nie da się wykryć wzorcem. |

### Decyzje

1. **Kolektor dopisuje blame do pierwszego kroku bramki końcowej** (`step.blamed`: id warstw, `step.unblamed`: liczba naruszeń bez właściciela). Id warstwy jest już w `plan` i w id kroków, więc nie ma w tym nazw plików. Pole jest opcjonalne, `v: 1` zostaje. Przypisanie liczy wspólna funkcja (`scripts/lib/final-gate-blame.mjs`), której używa kolektor i skrypt uzupełniający historię. Szablon Workflow i hooki zostają nietknięte (zamrożone do scalenia TASK-ENGINE-GUARDRAILS-001).
2. **Fałszywy GO** to ostatni werdykt `go` jednostki przed pierwszą bramką końcową, gdy ta bramka dała `no_go` i wskazała tę warstwę. Mianownik (`goJudged`) liczy tylko przebiegi, w których przypisanie wykonano, także te z bramką `go`. Przebieg bez pola `blamed` nie wchodzi ani do licznika, ani do mianownika.
3. **Fałszywy NO_GO** liczy tylko `orchestrate` (tylko tam zapisuje się `fixes`): `no_go`, po którym następny werdykt jednostki to `go`, a między nimi nie było kroku z `fixes` na tę jednostkę.
4. **Udział naruszeń bez właściciela jest metryką** (`finalGate.unattributed`). Fałszywe GO to dolna granica, nie pełna miara, i liczba musi to mówić.
5. **Blok `tasks` jest kluczowany `taskRef` w pliku rollupu** (tak zapisuje ADR 0015 D3), co jest wyjątkiem od zasady z ADR 0012 §3. Z maszyny wychodzą tylko rozkłady. Rollupy są w gicie wewnętrznego repo, a eksport ma białą listę. Do rozstrzygnięcia przez człowieka, jeśli repo ma kiedyś wyjść poza firmę.
6. **`findLeaks` rozszerzony** o formaty z literą po numerze i o prefiks z cyframi (`DS009-`).

## Kryteria akceptacji

- [x] Rollup ma `verdicts.falseGo`/`falseNoGo` per rola i agent; eval z fixture przechodzi.
- [x] Rollup ma blok `tasks`; eksport zawiera tylko rozkłady; `findLeaks` łapie TS-ID w kluczach.
- [x] Historia przeliczona, liczby z października w CHANGELOG i w DECISIONS-LOG.

## Wynik (2026-10-23)

Zmiany: `scripts/lib/final-gate-blame.mjs`, `telemetry-verdicts.mjs`, `telemetry-tasks.mjs`, `telemetry-stats.mjs`
(nowe); `telemetry-rollup.mjs`, `telemetry-export.mjs`, `telemetry-legacy.mjs`, `workflow-metrics-collect.mjs`,
`telemetry-migrate-legacy.mjs`, schemat zdarzenia (zmienione); `scripts/telemetry-backfill-gate-blame.mjs` (jednorazowe
uzupełnienie historii); eval `telemetry-gate-blame` (nowy), `telemetry-rollups` i `telemetry-export` (rozszerzone).

Październik, dolna granica: 51 fałszywych GO na 406 ocenionych (12,6%); 6 fałszywych NO_GO na 30 rozstrzygalnych.
Task: 51 ze 131 miało więcej niż jeden przebieg; koszt do pierwszego GO p50 10,22 USD, p90 36,92 USD.

Otwarte: (1) 124 naruszenia bramki nie mają właściciela w plikach warstw — osobna kategoria w raporcie (TASK-OBS-014);
(2) `taskRef` jako klucz bloku `tasks` w rollupach w gicie (wyjątek od ADR 0012 §3) wymaga hashowania, jeśli repo wyjdzie poza firmę;
(3) cron liczy `--since` 3 dni, a task wznowiony później zostawia stary wpis — pełne przeliczenie raz w tygodniu.
