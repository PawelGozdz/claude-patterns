---
id: TASK-COLLECTOR-001
title: 'Hooki Claude Code + hook post-commit + lokalny bufor JSONL sygnałów pracy (kontrakt formatu)'
type: task
status: todo
priority: P1
created_date: 2026-09-12
updated_date: 2026-09-12
epic_id: EP-COLLECTOR-0
story_points: 3
dependencies: []
blocks: [TASK-COLLECTOR-002, TASK-COLLECTOR-003]
---

# TASK-COLLECTOR-001 — Hooki i bufor sygnałów

**Epik:** [EP-COLLECTOR-0](./EP-COLLECTOR-0.md). **Kanon:** `/opt/projects/grant-flow/docs/product/work-ledger-canon.md` §2.6, §3.3.

## Cel

Każda sesja Claude Code w każdym repozytorium skonfigurowanym przez `setup-project.sh` oraz każdy
commit gita zostawiają ślad w lokalnym buforze JSONL. Bez sieci, bez treści, bez liczenia.

## Zakres

1. **Hook `work-signal.js`** (jeden skrypt, rozpoznaje zdarzenie po payloadzie) rejestrowany
   w `hooks/hooks.json` dla: `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Notification`
   (→ `waiting`), `Stop` (→ `session.stop`, z opcjonalnym `summary` ≤ 500 zn. jeśli hook ma
   do niego dostęp; jeśli nie — `summary` dopisuje skill w kroku późniejszym), `SubagentStop`
   (ignorowany lub `tool` z `count`).
2. **Agregacja `PostToolUse`**: okno minutowe per sesja → jedna linia `tool { count, tools: [..] }`.
   Bez tego 4 instancje generują tysiące linii na godzinę.
3. **Hook gita `post-commit`** (instalowany przez `setup-project.sh`, idempotentnie, bez
   nadpisywania cudzych hooków): `commit { hash, message (pierwsza linia, ≤ 200 zn.), filesChanged,
   insertions, deletions, branch, repositoryRef }`. Działa niezależnie od tego, czy commit zrobił
   agent, czy człowiek.
4. **`taskKey`**: z `.claude/run-state/orchestrating.json` (aktywne TASK-ID), w drugiej kolejności
   z nazwy brancha (`feature/TS-XXX-…`, `TS-XXX` jako prefiks). `command`: nazwa skilla, jeśli
   payload `UserPromptSubmit` zaczyna się od `/`.
5. **Bufor**: `~/.grantflow/spool/YYYY-MM-DD/<host>-<pid>.jsonl`, append-only, `O_APPEND`
   (linie < 4 KB, atomowe); rotacja dzienna przez katalog; brak blokad między procesami.
6. **Kontrakt formatu** `docs/work-signal-schema.md` + JSON Schema (`schemaVersion: 1`):
   pola wspólne (`id, schemaVersion, ts, kind, source, host, sessionId?, repositoryRef?, branch?,
   taskKey?, command?`) i `payload` per `kind`. Ten dokument jest wejściem dla grant-flow
   EP-WORK-SIGNALS — bez konwersji.
7. Wyłącznik: `GRANTFLOW_COLLECTOR=off` w env lub brak `~/.grantflow` → hook kończy natychmiast.

## Kryteria akceptacji

- [ ] Sesja w dowolnym repo z hookami produkuje `session.start`, `prompt`, `tool` (zagregowane),
      `waiting`, `session.stop` z poprawnym `repositoryRef`, `branch`, `taskKey` (gdy jest `orchestrating.json`)
- [ ] `git commit` w terminalu (poza Claude Code) produkuje `commit` w tym samym buforze
- [ ] Ten sam sygnał zapisany dwa razy ma ten sam `id` (test jednostkowy hasha)
- [ ] Hook nie czyta transkryptu, nie zapisuje treści promptu (test: prompt z sekretem →
      brak sekretu w buforze)
- [ ] Czas wykonania hooka < 20 ms (pomiar w teście)
- [ ] `setup-project.sh` instaluje hook gita idempotentnie i nie nadpisuje istniejącego `post-commit`
      (dopisuje wywołanie)
- [ ] Schemat JSON + dokument kontraktu; przykładowy dzień w `examples/`
- [ ] README hooków zaktualizowane; wpis w `CHANGELOG`/K-notatce

## Pliki (planowane)

- `hooks/work-signal.js`, `hooks/lib/work-signal-spool.js`, `hooks/hooks.json`
- `scripts/git-hooks/post-commit-work-signal.sh`, `scripts/setup-project.sh`
- `docs/work-signal-schema.md`, `schemas/work-signal.schema.json`
- `hooks/__tests__/work-signal.test.js`
