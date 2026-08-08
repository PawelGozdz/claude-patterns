# project-orchestration — claude-patterns

Instancja systemu PM (patrz `patterns/orchestration/project-management-system.md`).
Struktura zgodna z `templates/project-orchestration/`, żeby `/pulse`, `/pm-status`,
`/task-health`, `/tech-debt` i hook `pm-task-check.js` działały tu tak samo jak
w pozostałych projektach.

## Jedno odstępstwo: `tasks/` to symlink

```
project-orchestration/tasks  →  ../docs/tasks
```

To repo miało taski w `docs/tasks/` **przed** wprowadzeniem systemu PM (11 plików
`TASK-*.md`, m.in. `TASK-OBS-001`, `TASK-RAG-001/002/003`, `TASK-BROADCAST-001`).
Do tej lokalizacji odwołuje się 14 innych plików — w tym **ADR 0003, 0004 i 0005**.
Przeniesienie plików wymagałoby przepisania ścieżek w rekordach decyzyjnych, czyli
zmiany zapisu historycznego po fakcie. Symlink daje jedno i drugie: narzędzia PM widzą
kanoniczną ścieżkę `project-orchestration/tasks/`, a wszystkie istniejące odnośniki
`docs/tasks/...` nadal działają.

**Konsekwencja praktyczna**: nowy task można tworzyć pod dowolną z dwóch ścieżek —
wyląduje w tym samym miejscu. W dokumentacji i ADR-ach używaj `docs/tasks/`
(spójność z tym, co już zapisane).

## Pliki

| plik | rola |
|---|---|
| `TEAM-STATE.md` | wspólny mózg — czytają i piszą `@tech-lead` + `@product-owner` |
| `KANBAN.md` | przepływ zadań |
| `TECH-DEBT.md` | rejestr długu technicznego |
| `tasks/` → `../docs/tasks` | taski (patrz wyżej) |
| `completed-tasks/` | zamknięte taski |
| `_archive/` | snapshoty `TEAM-STATE.md` (hook `pre-compact-pm-snapshot.js`) |

Dashboardy są świeżo zescaffoldowane z szablonu i zawierają **placeholdery, nie dane**.
Pierwsze `/pulse` je wypełni. Nie wpisuj do nich liczb ręcznie „na oko" — patrz incydent
z metryką `B2C 68% / B2B 12%` (przykład z promptu agenta skopiowany jako fakt
i raportowany przez miesiące, wykryty 2026-08-01).
