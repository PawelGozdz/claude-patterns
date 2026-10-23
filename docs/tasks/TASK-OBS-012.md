---
id: TASK-OBS-012
title: 'Rollup: fałszywe werdykty i blok tasks (koszt do pierwszego GO)'
type: feature
status: todo
priority: P1
story_points: 3
created_date: 2026-10-22
updated_date: 2026-10-22
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

## Kryteria akceptacji

- [ ] Rollup ma `verdicts.falseGo`/`falseNoGo` per rola i agent; eval z fixture przechodzi.
- [ ] Rollup ma blok `tasks`; eksport zawiera tylko rozkłady; `findLeaks` łapie TS-ID w kluczach.
- [ ] Historia przeliczona, liczby z października w CHANGELOG i w DECISIONS-LOG.
