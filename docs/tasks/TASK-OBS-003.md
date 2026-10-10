---
id: TASK-OBS-003
title: 'Metryki `/analyze`: przebieg i kroki panelu jako zdarzenia v1 (dziś zero danych)'
type: feature
status: todo
priority: P1
story_points: 5
created_date: 2026-10-10
updated_date: 2026-10-10
assignee: '@unassigned'
labels: [observability, telemetry, analyze]
epic: EP-OBSERVABILITY-001
depends_on: []
related: [TASK-OBS-005]
source: 'ADR 0012 krok 3; analiza 2026-10-10: panel /analyze to wywołania narzędzia Agent z głównej pętli, nie Workflow, więc hook workflow-metrics-postrun go nie widzi'
---

# TASK-OBS-003: metryki `/analyze`

## 🎯 Goal

Każdy przebieg `/analyze` zostawia w `telemetry/events/` zdarzenia `run.start` (z planem stage'y
panelu), `step.end` per agent panelu i `run.end` (wynik: zatwierdzona analiza / pytania otwarte /
przerwana). Dashboard może wtedy pokazać dla analizy to samo co dla orchestrate: ile kroków, ile
nieudanych, ile kosztuje, gdzie się zatrzymuje.

## Stan wyjściowy

- `/analyze` (`commands/analyze.md`) uruchamia agentów panelu narzędziem Agent z głównej pętli.
- `hooks/workflow-metrics-postrun.js` reaguje tylko na narzędzie Workflow → analiza ma 0 danych.
- Problemy konfiguracji analizy trafiają już do skrzynki (krok 4 `/analyze`, reguły `ANZ-*`) i
  przez `report-deviation` do zdarzeń `deviation` — brakuje mianownika.

## Zakres

1. **Sprawdzić najpierw** (przed projektem hooka): co dostaje hook PostToolUse dla narzędzia
   Agent — czy `tool_response` niesie tokeny, liczbę wywołań narzędzi i czas. Jeśli nie: te same
   dane z transkryptu subagenta (`hooks/lib/transcript-usage.js`, jak collector).
2. `commands/analyze.md`: na starcie `node <claude-patterns>/scripts/telemetry-emit.mjs run-start
   --process analyze --project <ścieżka> --task <TS-ID> --plan <stage'e panelu>`; runId zapisany
   w artefakcie analizy; na końcu `run-end` z wynikiem.
3. Hook PostToolUse(Agent): gdy w sesji jest otwarty przebieg (plik znacznika per sesja, nie
   zmienna środowiskowa), dopisuje `step.end` przypięty do niego. Ogólny mechanizm — ten sam
   posłuży każdemu przyszłemu procesowi bez Workflow. Bez przebiegu = nic nie robi.
4. Rola kroku z nazwy slotu panelu (architect, analyst, security, …); `outcome` z wyniku agenta
   (zwrócił raport / pusty / błąd), `cause` przy niepowodzeniu.

## Kryteria akceptacji

- [ ] Przebieg `/analyze` w aegis-flow zostawia `run.start` z planem, `step.end` per agent panelu i `run.end`.
- [ ] Agent bez wyniku → `outcome: died`, `cause: silent`; pominięty stage → `skipped`.
- [ ] Hook nie dopisuje niczego poza otwartym przebiegiem i nigdy nie blokuje narzędzia (exit 0, stdin→stdout).
- [ ] Zdarzenia nie zawierają treści promptów ani wyników agentów (eval).
- [ ] Eval: hook na fixture'ach wejścia PostToolUse + CLI w `analyze.md` zgodne z `telemetry-emit`.
- [ ] ADR 0012 krok 3 oznaczony jako wdrożony.
