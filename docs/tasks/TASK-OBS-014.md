---
id: TASK-OBS-014
title: 'telemetry-report.mjs: raport nad rollupami, delta per wersja silnika'
type: feature
status: done
priority: P1
story_points: 3
created_date: 2026-10-22
updated_date: 2026-10-24
assignee: '@unassigned'
labels: [observability, telemetry, dashboard]
epic: EP-OBSERVABILITY-002
depends_on: [TASK-OBS-012]
related: [TASK-OBS-008, TASK-OBS-017]
source: 'ADR 0015 D6 (raport)'
---

# TASK-OBS-014: raport nad rollupami

## 🎯 Goal

Pytanie „czy ORC-098 zmniejszyło NO_GO bramki końcowej" ma dziś jedną odpowiedź: ręczny skrypt node nad
`telemetry/events/`. Rollupy od lipca commitowano pięć razy, bo poza `flow-top` i eksportem nic ich nie
czyta. Potrzebny jest jeden skrypt, który czyta wyłącznie rollupy i odpowiada na pytania o trend.

## Zakres

1. `scripts/telemetry-report.mjs` + czysta funkcja w `scripts/lib/telemetry-report.mjs`. Wejście: pliki
   z `telemetry/rollups/` (liczniki sumowane po hostach, percentyle per host). Widoki:
   `--by engine|process|role|project|week`, `--since`, `--json`.
2. `--engine <hash>`: okno przed i po (domyślnie 7 dni z każdej strony, liczone po dniach z danymi):
   first-pass, fałszywe GO, NO_GO bramki, udział kosztu powtórek, cichy zgon, gęstość `deviation` per
   sygnatura. Progi jak w `workflow-metrics-report --regression` (zmiana poniżej 20% to szum).
3. `--data-quality`: udział `other` w `cause`, kroki bez kosztu, przebiegi bez `engine`, przebiegi bez
   `taskRef`. To jest licznik jakości danych z ADR 0012, dotąd nigdzie niewidoczny.
4. Wyjście tekstowe czytelne w terminalu i `--md` do pliku (konsument: TASK-OBS-017).
5. Eval `tests/flow-evals/telemetry-report/` na syntetycznych rollupach (dwa hosty, dwa silniki, jeden
   regres) wpięty w `pre-commit-guards.mjs`.

## Kontekst dla świeżej sesji

- `scripts/lib/flow-live.mjs` (`loadBaseline`) już czyta rollupy i liczy średnią 30 dni; wydziel
  wspólny czytnik zamiast drugiej kopii.
- `workflow-metrics-report.mjs` czyta stary `workflow-steps.jsonl`; nie rozbudowuj go, ma zniknąć
  po przejściu na v1.

## Kryteria akceptacji

- [x] `node scripts/telemetry-report.mjs --engine <hash>` pokazuje delta przed/po dla wymienionych metryk.
- [x] `--data-quality` wypisuje cztery liczniki jakości danych (`other` w dwóch ujęciach: kroki i odstępstwa; „bez taskRef" to
      przybliżenie z bloku `tasks`, bo rollup nie niesie przebiegów bez taskRef).
- [x] Eval zielony (10 przypadków, wpięty w pre-commit); wpis w `TELEMETRY-HOWTO.md` w sekcji „Codzienne komendy".
