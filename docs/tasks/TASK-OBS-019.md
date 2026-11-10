---
id: TASK-OBS-019
title: 'Telemetria: ścieżka pliku w lokalnych zdarzeniach (etap 2) i ruleId z wyjścia lintu w trybie cienia'
type: feature
status: todo
priority: P3
story_points: 3
created_date: 2026-11-10
updated_date: 2026-11-10
assignee: '@unassigned'
labels: [observability, telemetry, verifier, lint]
epic: EP-OBSERVABILITY-002
depends_on: [TASK-OBS-018]
related: [TASK-OBS-018, TASK-ORC-GATE-COST-001]
source: 'wydzielone z TASK-OBS-018 przy zamknięciu etapu 1 (2026-11-10): zakres wymaga informacji od juz-ide-api, których nie ma w repo'
---

# TASK-OBS-019: dopasowanie miejsca i ruleId z lintu

**Stan: czeka na dwie rzeczy od juz-ide-api.** Nie zaczynać implementacji bez nich.

## 🎯 Goal

Porównanie lintu z weryfikatorem (cel TS-TOOLING-003) na poziomie *miejsca*, a nie tylko reguły: czy lint złapał to samo
`ruleId` w tym samym `plik:linia`, co weryfikator. Etap 1 (TASK-OBS-018) daje porównanie na poziomie warstwy i próby:
sonda czerwona vs NO-GO, `ruleHits` weryfikatora bez ścieżek, `shadowLint` tylko jako pass/fail.

## Czego brakuje do startu

1. **Potwierdzenie właściciela juz-ide-api**, że porównanie rzeczywiście potrzebuje `plik:linia`, a nie samego `ruleId` per
   warstwa i próba (to rozstrzyga, czy etap 2 w ogóle jest potrzebny).
2. **Format wyjścia lintu** (`pnpm lint:ddd`): najlepiej reporter strukturalny (np. eslint `-f json`) albo opis formatu
   linii. Bez tego nie da się deterministycznie wyciągnąć `ruleId` i miejsca.

## Zakres

### A. Ścieżka pliku w lokalnych surowych zdarzeniach (wariant c z TASK-OBS-018, D1)

- Schemat: `step.ruleHits[].file` (ścieżka względna, bez `..`, długość ograniczona), dozwolone tylko w surowych zdarzeniach;
  `projectRollup` i `buildBatch` nigdy go nie niosą (test, że `findLeaks` i eksport nie widzą `file`).
- Aneks do ADR 0012 (dziś §3: zdarzenie nie zawiera ścieżek plików). `telemetry/events/` jest w `.gitignore`.
- Kolektor i konwerter przepisują `file` z `findings[].file`; `FINDINGS_FIELD` prosi o `{ruleId, line, file}`.

### B. `ruleId` z wyjścia lintu w trybie cienia

- **Nie** przez agenta sondy: sonda parafrazuje cytaty (ORC-137), więc ekstrakcja `ruleId` byłaby zawodna.
- Deterministyczny parser uruchamiany przez sondę (np. `tools/lint-shadow/parse.mjs` dla formatu z pkt 2), wynik jako
  `shadowLintHits: [{ruleId, line}]` obok `shadowLint` w `step.checks`.
- Zasady jak w TASK-OBS-018: `ruleId` przez `normalizeRuleId`, wolny tekst nie wchodzi do zdarzenia.

## Kryteria akceptacji

- [ ] Potwierdzenie z juz-ide-api (pkt 1) i format wyjścia lintu (pkt 2) zapisane w tym zadaniu.
- [ ] Aneks do ADR 0012 dla `file` (tylko surowe lokalne zdarzenia).
- [ ] Test: rollup i `buildBatch` nie zawierają `file`, a schemat odrzuca `file` z `..` i ścieżek bezwzględnych.
- [ ] Parser lintu z testami na realnym wyjściu projektu; wynik w `step.checks.shadowLintHits`.
- [ ] Da się zestawić `ruleId × plik:linia` weryfikatora z `shadowLintHits` tej samej warstwy i próby.
- [ ] Konwencja repo: walidatory CI, `CHANGELOG.md`, rule-history.

## Wynik

(do uzupełnienia po wykonaniu)
