---
id: TASK-ONBOARD-001
title: 'Jeden spójny sposób zakładania projektu: instrukcja, schemat project.yml i walidator'
type: feature
status: todo
priority: P1
story_points: 5
created_date: 2026-10-10
updated_date: 2026-10-10
assignee: '@unassigned'
labels: [setup, onboarding, config, validation]
depends_on: []
related: [TASK-OBS-004, TASK-OBS-007]
source: 'Decyzja użytkownika 2026-10-10: „niech to będzie jedynym spójnym sposobem budowania" + plik, który programistycznie weryfikuje poprawność'
---

# TASK-ONBOARD-001: jeden sposób zakładania projektu

## 🎯 Goal

Nowy projekt zakłada się jedną drogą, opisaną w jednym dokumencie, a poprawność `project.yml`
sprawdza maszyna — przy setupie, w audycie floty i w pre-commit claude-patterns. Pole spoza
kontraktu, brak `stack_blocks` albo drugi, równoległy tor konfiguracji (`patterns:`) to błąd,
a nie cicha różnica między projektami.

## Kontekst dla świeżej sesji

Stan na 2026-10-10 (zbadany, nie zakładany):

- **Wiedza jest rozrzucona**: `templates/project.yml.example` (wzorzec z komentarzami),
  `docs/ARCHITECTURE.md` § „Composition flow" i „Anti-patterns", `blocks/README.md` (katalog bloków),
  ADR 0007 i 0008, `README.md` § „Quick Setup" (stare liczby agentów/komend/hooków) i § „Setup for
  New Project" (dotyczy tylko systemu PM). Nie ma jednej instrukcji od zera do działającego `/analyze`.
- **Template jest nieaktualny**: ścieżki `~/projects/claude-patterns` (realnie `/opt/projects/…`),
  przykład oparty na LocalHero (`contexts`, `rules`, `docs`), brak pól, które kod faktycznie czyta:
  `block_params`, `extra_hooks`, `knowledge_collection`, `human_voice`, `pm_system`, `mcp_servers`,
  `exclude_skills`.
- **Nie ma schematu `project.yml`**. `schemas/` ma `block`, `business-rules`, `hooks`,
  `telemetry-event-v1` — nie ma projektu.
- **Kto czyta które pole** (to jest kontrakt do spisania):
  - `scripts/materialize-runtime.mjs`: `project.stack_blocks` (wymagane, inaczej `fail`),
    `project.block_params`, `project.extra_hooks`, `project.knowledge_collection`,
    `project.human_voice`, budżety (nadpisanie OQ3).
  - `scripts/setup-project.sh` (przez `scripts/lib/project-yml.mjs`): `patterns` (lista jawna —
    **ma pierwszeństwo przed `stack_profile`**, czyli drugi tor obok bloków, sprzeczny z ADR 0008
    „jedyny tor"), `exclude_skills`, `project.mcp_servers`, `project.knowledge_collection`,
    `project.pm_system`, `broadcast.*`.
  - `scripts/generate-claude-md.sh`: `project.{name,description,stack,testing,language,stack_profile}`,
    pola tabeli `project.{ddd_library,database,framework,state_management,platforms,runtime}`,
    `skills`, `rules`, `docs`, `cost.*`, `entry_points.*`, `project.stack_blocks`.
  - `agent_profile`: sprawdzić, czy cokolwiek go jeszcze czyta; jeśli nie — pole martwe.
- **Flota (22 projekty z `project.yml`, bez katalogów `_*`)** — odstępstwa od kontraktu dziś:

  | Projekt | Odstępstwo |
  |---|---|
  | juz-ide-blog, wiki | brak `stack_blocks` (materializacja odmówi) |
  | juz-ide-pl | brak `stack_blocks`, `cost_targets` (nikt nie czyta; jest `cost`), `project.url` |
  | aegis-flow, ai-gateway, iam | `patterns:` — drugi tor doboru wzorców obok bloków |
  | aegis-flow, my-intelligence | `project.agent_profile` |
  | pcu | `modules`, `project.ai_sdk`, `project.architecture`, `project.frontend` (nieczytane) |

  Odtworzenie tabeli: jednolinijkowiec w Node z pakietem `yaml` uruchomiony z katalogu
  claude-patterns (z innego katalogu `yaml` się nie rozwiąże), iterujący
  `/opt/projects/*/.claude/config/project.yml` z pominięciem `_*`.
- **Wzorzec walidatora już jest**: `scripts/ci/validate-blocks.mjs` — bez ajv (jedyna zależność
  repo to `yaml`), czyta schemat JSON i sprawdza wymagane klucze, dozwolone klucze i enumy;
  zarejestrowany w `scripts/pre-commit-guards.mjs` (`runCheck('validate-blocks', …)`). Nowy walidator
  ma iść tym samym torem i współdzielić logikę (wydziel do `scripts/lib/`, nie kopiuj).
- Testy: `tests/flow-evals/project-yml/` (parser), `tests/flow-evals/setup-project/`,
  `tests/flow-evals/audit-projects/` — dopisuj tam, w katalogach tymczasowych.
- Zasady sesji: katalog claude-patterns jest żywy dla floty (`~/.claude/hooks`, symlinki projektów);
  pracuj na `feature/TASK-ONBOARD-001` z `develop`, w głównym katalogu, bez worktree; inna sesja
  może mieć staged pliki — commituj tylko swoje. Bez rekurencyjnego grepa na korzeniu repo.

## Zakres

1. **Kontrakt**: `schemas/project-yml.schema.json` — każde pole czytane przez kod, z opisem, kto je
   czyta. `project.stack_blocks` wymagane. Pola wyłącznie opisowe dla tabeli CLAUDE.md jawnie
   wymienione (nie wolny worek). Pola wycofane (`patterns`, `agent_profile`, `cost_targets`, …)
   w osobnej sekcji `deprecated` z komunikatem „zamień na …".
2. **Walidator**: `scripts/validate-project-yml.mjs <projekt|project.yml> [--all] [--json]` —
   nieznany klucz, brak wymaganego, zła wartość enum, lista blokowa tam, gdzie bash wymaga inline,
   blok z `stack_blocks`, którego nie ma w `blocks/` ani `.claude/blocks/`, `block_params` dla
   bloku spoza kompozycji. Wyjście: błędy (exit 1) i ostrzeżenia (pola `deprecated`).
3. **Trzy miejsca wywołania tego samego walidatora**:
   - `setup-project.sh` na samym początku — błąd zatrzymuje setup przed jakąkolwiek zmianą;
   - `audit-projects.mjs` — kontrola per projekt; przy `--report` błąd trafia do skrzynki
     (`report-deviation --once-per-project`, `category: config`);
   - `pre-commit-guards.mjs` — `templates/project.yml.example` musi przechodzić walidator
     (template nie może się znów rozjechać z kodem).
4. **Jeden tor**: `patterns:` w `setup-project.sh` przestaje mieć pierwszeństwo — ostrzeżenie
   „przenieś do bloku lokalnego `.claude/blocks/`", a po migracji floty usunięcie gałęzi kodu.
5. **Instrukcja**: `docs/NOWY-PROJEKT.md` — jedyne źródło: wymagania → `project.yml` (minimalny
   przykład + pola opcjonalne z odesłaniem do schematu) → `taxonomy.yml` → bloki lokalne i
   `block_params` → `CLAUDE-LOCAL.md` → `setup-project.sh` → weryfikacja (`validate-project-yml`,
   `audit-projects <projekt>`, pierwszy `/analyze`). README, ARCHITECTURE.md i template
   linkują do niej zamiast powtarzać.
6. **Template**: `templates/project.yml.example` przepisany na minimalny, neutralny projekt;
   wszystkie pola z kontraktu obecne (opcjonalne zakomentowane), aktualne ścieżki.
7. **Migracja floty**: projekty z tabeli wyżej doprowadzone do zgodności (osobne commity w
   projektach, na prośbę użytkownika); dla juz-ide-blog / wiki / juz-ide-pl decyzja: bloki czy
   świadome wyłączenie z systemu (wtedy jawnie, np. lista w audycie, a nie cichy brak).

## Kryteria akceptacji

- [ ] `node scripts/validate-project-yml.mjs --all` przechodzi albo pokazuje wyłącznie
      odstępstwa z tabeli powyżej (przed migracją) — żadnych fałszywych alarmów.
- [ ] Eval: nieznany klucz, brak `stack_blocks`, nieistniejący blok, lista blokowa w polu inline,
      pole `deprecated` → odpowiednio błąd/ostrzeżenie; template przechodzi.
- [ ] `setup-project.sh` z niepoprawnym `project.yml` kończy się błędem, zanim cokolwiek zmieni
      w projekcie (eval na katalogu tymczasowym).
- [ ] Audyt raportuje niezgodny `project.yml` do skrzynki z `category: config`.
- [ ] `docs/NOWY-PROJEKT.md` jest jedynym miejscem z procedurą; README/ARCHITECTURE linkują.
- [ ] Walidator i template w `pre-commit-guards.mjs`.
