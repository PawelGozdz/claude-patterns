---
id: TASK-ANL-APPROVED-DIFF-CHECK-001
title: '/analyze: twarda kontrola, że po „ok” zmienił się tylko artefakt analizy'
type: feature
status: todo
priority: P2
story_points: 3
created_date: 2026-11-08
updated_date: 2026-11-08
assignee: '@unassigned'
labels: [analyze, guard]
source: 'feedback z juz-ide-api-1 (TS-DEPS-002): agent po „ok” sam wdrożył i zacommitował zadanie; ANL-034 poprawiono tylko w prompcie'
---

# TASK-ANL-APPROVED-DIFF-CHECK-001: /analyze: twarda kontrola, że po „ok” zmienił się tylko artefakt analizy

## 🎯 Goal

Naruszenie „po zatwierdzeniu zmienia się wyłącznie artefakt analizy” wykrywa skrypt, nie prompt.

## Zakres

1. Przy starcie `/analyze` zapisać stan: `git rev-parse HEAD` i skrót `git status --porcelain` (plik w `.claude/run-state/`).
2. Na końcu przebiegu i w `resolve-finalize.mjs`: porównać; commit od startu albo zmieniona ścieżka poza artefaktem, plikiem pytań (ANL-058), sekcją `## 🔒 Security Pre-Analysis` (ANL-063) i polem `awaits_question` = exit 2 z listą ścieżek.
3. `orchestrate-prepare.mjs`: ostrzeżenie (nie blokada), gdy `status: approved` ma za sobą commit z SHA po `telemetry_run` poza artefaktem.
4. Eval w `analyze-resolve`: commit po starcie, zmiana `package.json`, zmiana tylko artefaktu (czysto).
Do rozstrzygnięcia: czy kontrola ma być hookiem (`PreToolUse` na `git commit` w sesji `/analyze`), bo skrypt na końcu widzi szkodę dopiero po fakcie.
