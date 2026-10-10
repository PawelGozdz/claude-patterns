---
id: TASK-OBS-008
title: 'Dashboard telemetrii (terminal na żywo, potem web) i transport na serwer zespołu'
type: feature
status: todo
priority: P3
story_points: 8
created_date: 2026-10-10
updated_date: 2026-10-10
assignee: '@unassigned'
labels: [observability, telemetry, dashboard]
epic: EP-OBSERVABILITY-001
depends_on: [TASK-OBS-005]
related: [TASK-OBS-003, TASK-OBS-006]
source: 'ADR 0012 krok 6; potrzeba użytkownika 2026-10-10: widok „zaplanowane N kroków, jesteśmy na M, krok K miał X błędów (naprawione/nie)" + docelowo serwer zespołu claude-patterns'
---

# TASK-OBS-008: dashboard i serwer

## 🎯 Goal

Dwa widoki na te same dane: terminal na żywo dla osoby prowadzącej pracę w projekcie i serwer
z agregatami floty dla zespołu rozwijającego claude-patterns.

## Zakres

1. `scripts/flow-top.mjs [projekt]`: bieżący journal przebiegu (`journal.jsonl` zapisuje się na
   żywo) + plan z `run.start` + porównanie z agregatami (np. „dziś 18% kroków to naprawy, średnia
   30 dni 26%"), top przyczyn.
2. Transport: wysyłka agregatów (nie surowych zdarzeń) na serwer; deduplikacja po `id`,
   kontrakt = schemat v1 + format rollupów. Bez `taskRef` i czegokolwiek z projektu.
3. Widok web (później) na tych samych agregatach.

## Kryteria akceptacji

- [ ] `flow-top` pokazuje postęp planu, błędy per krok z podziałem naprawione/otwarte, koszt.
- [ ] Transport idempotentny, zero danych merytorycznych projektów na serwerze.
