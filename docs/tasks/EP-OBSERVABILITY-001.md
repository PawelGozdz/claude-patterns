---
id: EP-OBSERVABILITY-001
title: '[EPIC] Raportowanie i telemetria floty — skrzynka problemów + metryki wszystkich przebiegów'
type: epic
status: in-progress
priority: P1
created_date: 2026-10-10
updated_date: 2026-10-10
labels: [observability, telemetry, reporting]
external_ref: 'docs/adr/0011-raportowanie-dryfu-i-telemetria-floty.md, docs/adr/0012-metryki-przebiegow-zdarzenia-v1.md'
member_tasks: [TASK-OBS-003, TASK-OBS-004, TASK-OBS-005, TASK-OBS-006, TASK-OBS-007, TASK-OBS-008]
---

# EP-OBSERVABILITY-001 — Raportowanie i telemetria floty

## Po co

Decyzja użytkownika z 2026-10-10: system raportowania to najważniejsza funkcja claude-patterns,
bo pozwala poprawiać narzędzie każdego dnia. Docelowo dane trafiają na serwer zespołu, który
rozwija claude-patterns i podejmuje decyzje na ich podstawie. Do tego potrzebne są dwa
strumienie: **skrzynka** (`docs/tasks/_inbox/` — co dokładnie się psuje i dlaczego) i
**zdarzenia** (`telemetry/events/` — jak często, w jakiej części całej pracy, ile to kosztuje).

Refaktor z 2026-10-10 znalazł 15 problemów fundamentu, z których skrzynka znała jeden, a
migracja historii pokazała, że stara telemetria raportowała 420/420 udanych przebiegów
`/orchestrate`, z których bramka końcowa odrzuciła 172 (41%).

## Stan (2026-10-10)

| Obszar | Stan | Gdzie |
|---|---|---|
| Skrzynka zasilana przez `/orchestrate`, `/analyze`, audyt floty | ✅ | ADR 0011 A, `8e84867` |
| Codzienny audyt floty (cron 7:30 dni robocze, `--report`) | ✅ | ADR 0011 B1 |
| Format zdarzeń v1, `report-deviation` → zdarzenie `deviation` | ✅ | ADR 0012 krok 1, `f11191e` |
| Collector w v1 + migracja historii (12 953 zdarzenia od 2026-07) | ✅ | ADR 0012 krok 2, `0c82a8f` |
| Pole `category` w skrzynce = `cause` w zdarzeniach | ✅ | `0ae7587` |
| Opis `deviation_note` w schematach orchestratora | ✅ | `002d49e` (ADR 0011 B2) |
| Metryki `/analyze` (dwa hooki + `run-start/run-end`, test na żywym Claude) | ✅ zmergowane do `develop`, hooki wpięte globalnie | TASK-OBS-003, ADR 0012 krok 3 |
| Agregaty dzienne + `_inbox/index.json` | ⏳ **następny** — gałąź `feature/TASK-OBS-005` | TASK-OBS-005 |
| Audyt i setup jako źródła metryk, setup zgłasza do skrzynki | ⏳ | TASK-OBS-004 |
| Plan przebiegu w `run.start` (orchestrate) | ⏳ odblokowane 2026-10-10 | TASK-OBS-006 |
| Higiena raportowania (postarzanie triage, nadmiary, świeżość crona) | ⏳ | TASK-OBS-007 |
| Dashboard na żywo + transport na serwer | ⏳ później | TASK-OBS-008 |

## Kolejność

TASK-OBS-003 → TASK-OBS-005 → TASK-OBS-006 → TASK-OBS-004 → TASK-OBS-007 → TASK-OBS-008. Uzasadnienie: `/analyze` nie ma dziś żadnych danych (ślepa
plamka), agregaty dają wartość od razu na 13 tys. istniejących zdarzeń, reszta je uzupełnia.

## Jak zacząć (świeża sesja)

1. Przeczytaj ADR 0012 (format, prywatność, emitery) i ten epik. ADR 0011 = skrzynka i audyt.
2. Gałąź: `feature/TASK-OBS-NNN` wychodzi z `develop`, praca **w głównym katalogu**
   `/opt/projects/claude-patterns` (decyzja użytkownika 2026-10-10: bez worktree).
3. **Ten katalog jest żywy dla całej floty**: `~/.claude/hooks` → `claude-patterns/hooks`,
   wzorce/agenci/reguły projektów to symlinki tutaj. Checkoutowana gałąź = kod, którego używają
   wszystkie sesje we wszystkich projektach. Nie zostawiaj w drzewie niedziałającego hooka ani
   skryptu; nowy hook rejestruj w `hooks/hooks.json` dopiero, gdy jego eval jest zielony.
4. Gotowe klocki (nie pisz od nowa):
   - `scripts/lib/telemetry-events.mjs` — `appendEvent`, `appendEventsDedup`, `deterministicId`,
     `validateEvent`, `normalizeOutcome`, `defaultCategory`, listy z schematu;
   - `scripts/telemetry-emit.mjs` — CLI `run-start | step | run-end` dla procesów bez Workflow;
   - `scripts/lib/telemetry-legacy.mjs` — wzorzec mapowania etykiet kroków na rolę/rundę/`fixes`;
   - `tests/flow-evals/telemetry-events/run.js` — eval; nowe przypadki dopisuj tutaj albo w
     evalu emitera; `CLAUDE_TELEMETRY_DIR=<tmp>` kieruje zapis poza prawdziwe dane.
5. Każdy nowy eval rejestruj w `scripts/pre-commit-guards.mjs` (`runCheck('eval: …')`).
6. Weryfikacja na danych: zdarzenia w `telemetry/events/RRRR-MM.jsonl` (poza gitem) czyta się
   krótkim skryptem node — bez czytania plików przez model.
7. Środowisko sesji: aktywny Fact-Forcing Gate (przed pierwszą edycją pliku podaj importerów,
   API, schemat danych i polecenie użytkownika); żadnego `grep -r`/`rg` na korzeniu repo —
   tylko na podkatalogach (`scripts/ hooks/ docs/ tests/`); commit tylko na prośbę użytkownika.

## Zasady wspólne dla tasków epiku

- Zdarzenie zgodne ze `schemas/telemetry-event-v1.schema.json`; nowa wartość listy zamkniętej
  = świadoma zmiana schematu + ADR 0012.
- Prywatność u źródła: bez treści promptów, powodów ze skrzynki, ścieżek plików i konfiguracji
  projektów. `taskRef` tylko lokalnie — agregaty i serwer go pomijają.
- Zapis metryki nigdy nie przerywa mierzonej pracy (best-effort, ostrzeżenie na stderr).
- Każdy emiter ma eval w `tests/flow-evals/telemetry-events/` albo własny.

## Poza epikiem, ale do domknięcia (stan floty po refaktorze 2026-10-10)

- juz-ide-api-2: zmiany konfiguracji niezacommitowane — husky tsc pada na braku `firebase-admin` (`pnpm install`).
- juz-ide-api-3: zmiany niezacommitowane — hook odpala pełne testy NX (przekroczony limit czasu).
- juz-ide-api-4: pominięte decyzją użytkownika; audyt zgłasza je codziennie (`DEV-aud-*`).
- ai-os-bot, grant-flow, iam, platform, marketing-hub, juz-ide-api-1, juz-ide-mobile-app,
  aegis-flow: porządki konfiguracji w drzewie, niezacommitowane (gałęzie z cudzą pracą w toku).
