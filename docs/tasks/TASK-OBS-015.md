---
id: TASK-OBS-015
title: 'outcome.human: decyzja człowieka po przebiegu (commit, przetrwanie diffu, revert)'
type: feature
status: todo
priority: P1
story_points: 5
created_date: 2026-10-22
updated_date: 2026-10-22
assignee: '@unassigned'
labels: [observability, telemetry, hooks]
epic: EP-OBSERVABILITY-002
depends_on: [TASK-OBS-013]
related: [TASK-OBS-011, TASK-OBS-012]
source: 'ADR 0015 D1'
---

# TASK-OBS-015: wynik ludzki jako zdarzenie

## 🎯 Goal

Dać metrykom mianownik spoza systemu. Przebieg `/orchestrate` kończy się w stanie „staged, not committed",
a to, co człowiek z tym zrobi, nigdzie nie zostaje zapisane. Po tym tasku każdy przebieg ma na końcu
decyzję: zacommitowane bez zmian, z poprawkami, odrzucone, cofnięte.

## Zakres

1. Odcisk na koniec przebiegu: collector (`workflow-metrics-collect.mjs`, już uruchamiany przez hook `Stop`)
   zapisuje `telemetry/sessions/staged/<runId>.json`: lista hashy treści plików staged (bez ścieżek w
   zdarzeniu; w pliku stanu ścieżki są potrzebne do porównania i zostają poza gitem, TTL 14 dni).
2. Hook PostToolUse na `Bash` z `git commit` w projekcie (globalny, `hooks/hooks.json`, best-effort,
   zawsze exit 0): dopasowuje przebieg (taskRef z gałęzi `feature/<TS-ID>` albo z `.analysis.md`, inaczej
   ostatni `run.end` projektu z 48 h), porównuje commit z odciskiem i zapisuje `kind: outcome.human`
   z `decision`, `survival {staged, unchanged}`, `latencyMs`. Brak dopasowania = licznik `unmatched`
   w rollupie, nie zdarzenie.
3. Revert: krok w `audit-projects.mjs` per projekt sprawdza `git log` z 7 dni pod kątem `revert` commitów
   dotykających plików z odcisków i zapisuje `outcome.human` z `decision: reverted`.
4. Rollup: `human {committed_as_is, committed_modified, rejected, reverted, unmatched}` per proces i
   `survival` p50; eksport wysyła liczniki.
5. Schemat: nowe `kind: outcome.human` (aneks ADR 0012). Eval `tests/flow-evals/hooks/` (fixture: commit
   z pełnym przetrwaniem, z poprawką, bez dopasowania) i `audit-projects`.

## Kontekst dla świeżej sesji

- **Start dopiero po odmrożeniu hooków** (TASK-ENGINE-GUARDRAILS-001 scalony, sygnał użytkownika), na
  świeżej gałęzi z `develop`; to samo ograniczenie, co w TASK-OBS-011.
- Hooki są CommonJS, telemetria ESM; wzorzec ładowania w `hooks/lib/telemetry-sessions.js`.
- `/analyze` ma własny wynik ludzki: `status: approved` w artefakcie. Zapisz go tym samym `kind`
  (`decision: committed_as_is` dla approved bez zmian odpowiedzi, `committed_modified` gdy autor
  zmienił `decisions[]`); emiter w `orchestrate-prepare.mjs`, który i tak czyta artefakt.

## Kryteria akceptacji

- [ ] Commit po przebiegu zostawia jedno zdarzenie `outcome.human` bez ścieżek i bez diffu (test).
- [ ] Przebieg bez commita przez 14 dni ląduje w `unmatched`, nie jako sukces.
- [ ] Hook nie zmienia wyniku `git commit` i kończy się exit 0 także przy braku katalogu telemetrii.
