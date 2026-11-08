---
id: TASK-ORC-WORKFLOW-FALLBACK-001
title: '/orchestrate: automatyczne przejście w tryb ręczny, gdy Workflow nie jest dostępny'
type: feature
status: todo
priority: P1
story_points: 5
created_date: 2026-11-08
updated_date: 2026-11-08
assignee: '@unassigned'
labels: [orchestrate, workflow, manual-mode]
source: 'feedback z ośmiu instancji juz-ide-api 2026-11-08 (dialog „Run a dynamic workflow?”, jedyna opcja „No”; ręczna pętla w 5 instancjach)'
---

# TASK-ORC-WORKFLOW-FALLBACK-001: /orchestrate: automatyczne przejście w tryb ręczny, gdy Workflow nie jest dostępny

## 🎯 Goal

Gdy `Workflow` jest niedostępny albo odrzucony, `/orchestrate` przechodzi w tryb ręczny bez udziału operatora i nie traci gwarancji, które dziś znikają: sond, ORC-098, `treeHash.sealed` (ORC-139), budżetów ORC-091/092.

## Zakres

1. Rozpoznanie PRZED budową skryptu (~300 KB): sprawdzić, czy Workflow jest dostępny w sesji (opcja: najpierw wywołanie próbne z minimalnym skryptem; odmowa = tryb ręczny od razu). Sprawdzić, czy da się zmniejszyć skrypt, bo rozmiar może być powodem dialogu.
2. Tryb ręczny jako skrypt, nie improwizacja: `scripts/orchestrate-manual.mjs` (sondy i checks warstwy, `orchestrate-tree-hash.mjs` z pieczęcią, limity tur jako dane dla promptu), żeby tryb ręczny odzyskał ORC-098/139 bez udziału modelu.
3. Eval w `tests/flow-evals/orchestrate-script`: odrzucony Workflow kończy ścieżką ręczną, a raport ma „Tryb ręczny: tak” i listę gwarancji, które nadal są utracone.
4. Aktualizacja `docs/orchestrate-manual-mode.md`: tabela „utracone” maleje o to, co odzyska skrypt.

Decyzja do podjęcia na starcie: czy dialog to brak włączonego trybu workflow w ustawieniach użytkownika (wtedy poprawka jest po stronie konfiguracji i dokumentacji, nie silnika). Sprawdzić na jednej instancji przed pisaniem kodu.
