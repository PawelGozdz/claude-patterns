---
id: TASK-ORC-ENV-BLOCK-001
title: '/orchestrate: rozpoznanie blokady środowiska testów (testcontainers) w silniku'
type: feature
status: todo
priority: P2
story_points: 2
created_date: 2026-11-08
updated_date: 2026-11-08
assignee: '@unassigned'
labels: [orchestrate, tests, environment]
source: 'feedback z juz-ide-api 2026-11-08: `failed to bind host port ... address already in use` w ośmiu instancjach (wyciek połączeń VS Code Server, porty efemeryczne); ORC-155 daje tylko regułę w prompcie'
---

# TASK-ORC-ENV-BLOCK-001: /orchestrate: rozpoznanie blokady środowiska testów (testcontainers) w silniku

## 🎯 Goal

Silnik odróżnia awarię środowiska testów od awarii kodu: jeden zwięzły komunikat i warstwa `GO_WITH_GAPS` z luką „środowisko”, bez 9 prób.

## Zakres

1. W `orchestrate.template.mjs` (wynik sondy i raport agenta od testów): wzorce `failed to bind host port`, `address already in use` w setupie testcontainers, `Cannot connect to the Docker daemon`, `Could not find a working container runtime strategy` przed pierwszym testem = `ENV_BLOCKED`.
2. `ENV_BLOCKED` nie zużywa prób naprawczych (`maxAttempts`), kończy warstwę jako `GO_WITH_GAPS` z luką „L2/L3 niezweryfikowane: środowisko” i pojedynczym komunikatem z diagnostyką (`ss -tan | wc -l`, PID trzymający połączenia).
3. Eval w `orchestrate-script`: wynik sondy z błędem bind → jedna próba, `GO_WITH_GAPS`, brak pętli.
Tło: ORC-155 w `docs/decisions/orchestrate-rule-history.md`.
