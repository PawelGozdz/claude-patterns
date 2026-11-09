---
id: TASK-TASK-QUEUE-BLOCK-001
title: 'Blok task-queue: kolejka zadań i współbieżność instancji dostępne dla każdego projektu'
type: implementation
status: backlog
priority: P2
story_points: 8
created_date: 2026-11-08
updated_date: 2026-11-08
assignee: '@claude'
labels: [blocks, orchestration, concurrency, pm]
depends_on: []
related: [ADR-0008, ADR-0016, ADR-0017]
source: >
  Decyzja @founder 2026-11-08: nowy wzorzec z juz-ide-api (analiza po nowemu, ADR/BDR, kolejka) przenosimy do innych
  projektów, żeby zwiększyć współbieżność prac. Warstwa 1 (analiza, ADR/BDR) jest już generyczna i wdrożona w
  juz-ide-mobile-app-develop. Brakuje warstwy 2: kolejki. Decyzja architektoniczna: docs/adr/0018-blok-task-queue-kolejka-i-wspolbieznosc-instancji.md.
---

# TASK-TASK-QUEUE-BLOCK-001

## Cel

Projekt z wieloma instancjami włącza kolejkę zadań i zasady współbieżności jednym wpisem w `stack_blocks`, bez kopiowania
narzędzi z `juz-ide-api`.

## Zakres

| # | Zmiana | Uwaga |
|---|--------|-------|
| 1 | `blocks/task-queue.yml` (oś `process`) z parametrami `queue_dir`, `views_cmd`, `shared_files_owner` | Schemat w `schemas/`, wpis w `blocks/README.md`. |
| 2 | Znacznik kolejki w `runtime.yml` zamiast istnienia `doc-graph.yml` | Hook `pm-task-housekeeping.js`, `skills/orchestration/pulse`, `skills/orchestration/reprioritize`, `commands/pulse.md`. Honorować oba znaczniki do migracji `juz-ide-api`. |
| 3 | `docs-graph` w silniku jako czysty Node | Najpierw ocenić rozmiar i zależności kodu z `juz-ide-api/scripts/docs-graph/`. Widoki generowane, nieśledzone w gicie. |
| 4 | Szablony `kolejka/*.yml` i pliku pytania | `templates/project-orchestration/`; `setup-project.sh` tworzy je tylko przy bloku w kompozycji. |
| 5 | `index-decisions.mjs` i `questions_dir` czytają ścieżki z konfiguracji | Bez założeń układu juz-ide. |
| 6 | Skill `/adr` i `setup-project.sh` obejmują szablon BDR | Dziś `templates/bdr-template.md` nie jest nigdzie kopiowany. |
| 7 | Pilot w `juz-ide-mobile-app-develop` | Po ustaleniu odpowiednika plików wspólnych (pubspec, routing, codegen). |

## Ograniczenia

- Zmiany w `hooks/` i skillach propagują się symlinkami do wszystkich projektów: pracować w worktree, znacznik wstecznie zgodny.
- Nowy blok wymusza `materialize-runtime.mjs` w projektach, które go włączą (`audit-projects --gate`).
- `juz-ide-api` ma 10 instancji (1–8, test, develop), `juz-ide-mobile-app` 4 (1–3, develop): pilot przechodzi przez `-develop`, reszta dociąga zmianę.
- Tekst dla ludzi (README, ADR, Goal) przechodzi przez skill `humanizer`.

## Kryteria ukończenia

- `stack_blocks: [..., task-queue]` w `juz-ide-mobile-app-develop` daje działające `kolejka/`, widoki i walidację kolizji bez kodu z repozytorium API.
- `juz-ide-api` działa bez zmian po wprowadzeniu znacznika w `runtime.yml` (oba znaczniki honorowane).
- `audit-projects --gate` i `verify-project-setup` zielone w obu projektach.
- Wpis w `CHANGELOG.md`, bump `METADATA.yml`, liczniki `count-assets.mjs --check-docs` zgodne.
