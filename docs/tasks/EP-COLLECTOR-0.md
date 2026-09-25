---
id: EP-COLLECTOR-0
title: '[EPIC] Lokalny kolektor sygnałów pracy (hooki + post-commit + obecność + bufor JSONL) — krok zero bez grant-flow'
type: epic
status: todo
priority: P1
created_date: 2026-09-12
updated_date: 2026-09-12
external_ref: 'grant-flow EP-WORKLEDGER (project-orchestration/tasks/EP-WORKLEDGER-work-ledger-canon.md)'
member_tasks: [TASK-COLLECTOR-001, TASK-COLLECTOR-002, TASK-COLLECTOR-003]
---

# EP-COLLECTOR-0 — Lokalny kolektor sygnałów pracy (krok zero)

**Kontekst zewnętrzny:** kanon produktowy grant-flow
`/opt/projects/grant-flow/docs/product/work-ledger-canon.md` (§2.6, §2.8, §3.3, §3.7, decyzje D5, D6, D19). Właściciel zdecydował:
najpierw zbieramy sygnały lokalnie, bez żadnej zmiany w grant-flow, żeby dane były od
pierwszego tygodnia i posłużyły do kalibracji, zanim powstanie ingest i silnik alokacji.

## Dlaczego tutaj

Kolektor to część toolingu deweloperskiego na komputerze osoby: hooki Claude Code, hook gita,
nasłuchiwacz bezczynności, bufor plikowy. To dokładnie to, co claude-patterns dystrybuuje przez
`setup-project.sh` do wszystkich repozytoriów (`juz-ide-api` ×4, `iam`, `grant-flow`, …).
grant-flow dostanie tylko punkt docelowy (`POST /work-signals/batch`) i przyjmie format bufora
bez konwersji — **format JSONL z tego epiku jest kontraktem** (wersjonowany `schemaVersion`).

## Zasady (z kanonu)

- Zero sieci w hooku. Hook dopisuje jedną linię do `~/.grantflow/spool/<host>-<pid>.jsonl` i kończy.
- Sygnał niesie metadane, **nigdy treść promptów ani transkryptów**: `ts`, `kind`, `sessionId`,
  `repositoryRef` (nazwa katalogu gita), `branch`, `taskKey?` (z `.claude/run-state/orchestrating.json`,
  w drugiej kolejności z nazwy brancha `feature/TS-XXX-…`), `tool?` (nazwa narzędzia), `command?`
  (nazwa skilla/komendy, np. `/orchestrate` — potrzebna do `activityKind`).
- `id = sha256(source, sessionId, kind, ts)` — idempotencja; commit deduplikowany po hashu
  po stronie grant-flow (4 instancje tego samego repo).
- Dwie serie czasu: sygnały człowieka (`prompt`, `commit` z terminala, odpowiedź na `waiting`,
  `presence` nieidle) i sygnały agenta (`tool`, tura `prompt → session.stop`). Kolektor ich nie
  interpretuje, tylko oznacza `kind` poprawnie — interpretacja jest w silniku po stronie grant-flow.
- `PostToolUse` agregowany do okien minutowych (`tool` z `count`), żeby 4 instancje nie
  produkowały tysięcy linii na godzinę.
- Nasłuchiwacz obecności: opt-in, tylko `idleSeconds`, bez tytułów okien; widoczny w pasku statusu.

## Zadania

| ID | Zakres | Pts |
|----|--------|-----|
| [TASK-COLLECTOR-001](./TASK-COLLECTOR-001.md) | hooki Claude Code + hook `post-commit` + bufor JSONL + kontrakt formatu | 3 |
| [TASK-COLLECTOR-002](./TASK-COLLECTOR-002.md) | nasłuchiwacz obecności (idle) z wymiennym źródłem, wskaźnik w statusline | 3 |
| [TASK-COLLECTOR-003](./TASK-COLLECTOR-003.md) | `grantflow spool show <date>` — lokalny podgląd dnia z bufora (kontrola sensu danych) | 2 |

Kolejność: 001 → 003 (wgląd w dane) → 002 (obecność). 002 może iść równolegle z 003.

## Poza zakresem

- Wysyłka do grant-flow (`--flush`) — dopiero gdy istnieje `POST /work-signals/batch`
  (grant-flow EP-WORK-SIGNALS); do tego czasu bufor rośnie lokalnie (rotacja dzienna plików).
- Jakiekolwiek liczenie godzin — kanon §2.11: liczy silnik w grant-flow, nie kolektor.
- Ekstrakcja zużycia tokenów z transkryptów — grant-flow EP-AI-COST (sygnał `usage` dojdzie
  do tego samego bufora później).

## Ryzyka

- Hook, który spowalnia sesję (fs sync, blokada pliku) — pomiar: < 20 ms na wywołanie.
- Wayland: odczyt bezczynności zależy od kompozytora — testować na hoście właściciela (D20),
  źródło wymienne.
- RODO: dla osób innych niż właściciel to monitoring aktywności — przegląd prawny przed
  dystrybucją w `setup-project.sh` (domyślnie wyłączony, włączany per osoba).
