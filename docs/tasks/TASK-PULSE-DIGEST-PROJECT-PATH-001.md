---
id: TASK-PULSE-DIGEST-PROJECT-PATH-001
title: '`tasks-digest.mjs` ma na sztywno wpisaną ścieżkę do WŁASNEGO `docs/tasks/` — nie da się go użyć z satelity'
type: task
status: planned
priority: P2
story_points: 1
created_date: 2026-09-17
updated_date: 2026-09-17
assignee: '@unassigned'
labels: [kaizen, hooks, orchestration, pulse]
depends_on: []
related: [TASK-KAIZEN-002]
source: >
  Znalezione 2026-09-17 podczas realnego przebiegu /pulse w satelicie juz-ide-api-2, krok 4
  ("Regeneruj KANBAN.md"). Skill orchestration/pulse/SKILL.md każe odpalić
  `node /opt/projects/claude-patterns/scripts/tasks-digest.mjs --json` z poziomu satelity, ale
  skrypt zignorował cwd/--project i zwrócił WŁASNE taski claude-patterns (TASK-COLLECTOR-*,
  EP-COLLECTOR-0, TASK-KAIZEN-002...) zamiast 122 tasków `TS-*` z juz-ide-api-2. Digest odtworzony
  ręcznie (bulk-grep frontmatterów przez node -e), więc /pulse w tamtej sesji nie był zablokowany
  — ale to obejście, nie fix.
---

# TASK-PULSE-DIGEST-PROJECT-PATH-001 — digest tasków nieprzenośny między projektami

## 🎯 Goal

`scripts/tasks-digest.mjs` ma wyliczaną ścieżkę katalogu tasków z lokalizacji SAMEGO SKRYPTU
(`REPO = dirname(fileURLToPath(import.meta.url)) + '..'`, `TASKS_DIR = REPO/docs/tasks`), nie z
`cwd` ani z żadnego argumentu CLI. Odpalony z satelickiego projektu (dokładnie tak, jak każe go
odpalać `skills/orchestration/pulse/SKILL.md` krok 4) i tak czyta katalog `docs/tasks/`
**wewnątrz `claude-patterns`**, ignorując satelitę całkowicie. Cel: dodać obsługę katalogu
docelowego, żeby skrypt faktycznie robił to, co `/pulse` od niego oczekuje w satelitach.

## 📖 Diagnoza (zweryfikowana w kodzie, nie założona)

- `scripts/tasks-digest.mjs:18-20`:
  ```js
  const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
  const TASKS_DIR = join(REPO, 'docs/tasks');
  const JSON_OUT = process.argv.includes('--json');
  ```
  Brak jakiegokolwiek `--project`/`--dir` w parsowaniu argumentów (`process.argv` sprawdzane
  WYŁĄCZNIE pod kątem `--json`, linia 20) i brak odczytu `process.env`/`process.cwd()` gdziekolwiek
  w pliku.
- `skills/orchestration/pulse/SKILL.md` krok 4 instruuje: *"Run `node
  /opt/projects/claude-patterns/scripts/tasks-digest.mjs --json` for id/status/priority/age per
  task instead of reading every file in `project-orchestration/tasks/` in full"* — bez żadnej
  wzmianki, że trzeba dopisać ścieżkę projektu, bo skrypt jej nie przyjmuje. Instrukcja zakłada
  przenośność, której skrypt nie ma.
- Odtworzone 2026-09-17: odpalenie z `/opt/projects/juz-ide-api-2` bez żadnych flag zwróciło JSON
  z plikami `EP-COLLECTOR-0.md`, `TASK-ACL-PORT-001.md`, `TASK-COLLECTOR-001.md`,
  `TASK-KAIZEN-002.md` itd. — czyli własny `docs/tasks/` claude-patterns, mimo że `cwd` był
  satelitą z 122 plikami `TS-*.md` w `project-orchestration/tasks/`.
- Porównaj z `scripts/orchestrate-prepare.mjs` (ten sam repo) — TEN skrypt prawidłowo przyjmuje
  `--project <dir>` (domyślnie `process.cwd()`) i to jest już ustalony wzorzec w tym samym
  katalogu `scripts/`, więc fix nie wymaga nowej konwencji, tylko powielenia istniejącej.

## ⚠️ Konsekwencja

`/pulse`, `/task-health`, `/reprioritize` — wszystkie trzy powołują się na ten skrypt w swoich
SKILL.md jako "tańszą" alternatywę dla czytania każdego pliku taska w całości. W obecnym stanie
którykolwiek z nich, odpalony w satelicie zgodnie z własną instrukcją, po cichu dostaje dane
z NIEWŁAŚCIWEGO projektu — nie błąd, nie pusty wynik, tylko wiarygodnie wyglądający JSON o
tasków, które nie istnieją w bieżącym repo. Łatwo przeoczyć bez ręcznej weryfikacji liczby
plików (tak jak w tej sesji: 14 rekordów zamiast oczekiwanych 122, ale trzeba było to zauważyć
samemu, skrypt nie zgłosił żadnego ostrzeżenia).

## ✅ Kryteria akceptacji

- [ ] `tasks-digest.mjs` przyjmuje `--project <dir>` (wzorem `orchestrate-prepare.mjs`), domyślnie
      `process.cwd()` — NIE lokalizacja samego skryptu.
- [ ] Gdy `<dir>/project-orchestration/tasks` nie istnieje (ani `<dir>/docs/tasks` jako fallback
      dla repo bez symlinka), skrypt kończy się czytelnym błędem na `stderr` + exit code ≠ 0,
      zamiast cicho zwracać dane z innego katalogu albo pustą tablicę.
- [ ] `skills/orchestration/pulse/SKILL.md` (i `task-health`/`reprioritize`, jeśli wołają ten sam
      skrypt) zaktualizowane, żeby jawnie przekazywały `--project .` albo równoważnik.
- [ ] Test/weryfikacja ręczna: odpalenie z satelickiego projektu (np. `juz-ide-api-2`) zwraca
      TYLKO jego własne taski, nie taski `claude-patterns`.

## 🧪 Testy

L1/skryptowy: wywołanie z `--project <ścieżka-do-innego-repo-z-taskami>` zwraca digest tamtego
repo, nie `claude-patterns`. Wywołanie bez `docs/tasks`/`project-orchestration/tasks` w katalogu
docelowym kończy się błędem, nie pustym/cudzym wynikiem.
