---
id: TASK-ORCH-LINT-BASELINE-001
title: 'lint:check tymczasowo wyjęty z checks w ddd/layers, flat-service i grant-flow — przywrócić po spłacie długu per-projekt'
type: bugfix
status: in-progress
priority: P1
story_points: 3
created_date: 2026-09-25
updated_date: 2026-09-25
assignee: '@unassigned'
labels: [kaizen, orchestration, lint, tech-debt]
depends_on: [TASK-ORCH-FALSE-GO-001]
related: []
source: >
  2026-09-25: użytkownik zgłosił, że każdy projekt na /orchestrate stanął przez linter po
  wdrożeniu TASK-ORCH-FALSE-GO-001 (final_gate.checks + checks warstw domain/application/
  infrastructure, dodane 2026-09-24). Audyt 10 projektów tego samego dnia.
---

# TASK-ORCH-LINT-BASELINE-001 — lint tymczasowo wyjęty z checks

## 🎯 Goal

`final_gate.checks` (ORC-022, TASK-ORCH-FALSE-GO-001) po raz pierwszy uruchomił `lint`/`lint:check`
na warstwach `domain`/`application`, które wcześniej nigdy nie były sondowane. W czterech na dziesięć
sprawdzonych projektów lint miał realny, pre-istniejący dług — nie coś, co wprowadził bieżący task —
więc sonda dawała NO_GO niezależnie od zmiany, a przy budżecie 3 prób kończyło się ESCALATE_AND_HALT
na każdym przebiegu. Lint jest tymczasowo wyjęty z `checks` tam, gdzie dług jest realny; `typecheck`
zostaje (szybki, czysty wszędzie).

## Audyt (2026-09-25, `npm run lint:check` / `npm run lint` bezpośrednio, poza silnikiem)

| Projekt | Wynik | Decyzja |
|---|---|---|
| ai-gateway | exit 0, czysty | bez zmian — `lint` zostaje w `checks` |
| iam | exit 0, tylko warningi (0 błędów) | bez zmian |
| marketing-hub | 1 błąd `import/order` w `lead-token.mapper.ts` | **naprawione** (przestawienie 2 linii importu) — `lint:check` zostaje |
| ai-os-bot | `eslint.config.js`: `parserOptions.project` wskazuje `tsconfig.json`, który wyklucza `**/*.test.ts`; istnieje gotowy `tsconfig.eslint.json` bez tego wykluczenia, ale nic go nie używa — 25 błędów, wszystkie z tego samego powodu | **fix zablokowany przez hook `config-protection`** (nie obszedłem go) — final_gate i tak nie miał `lint` (moja wcześniejsza edycja bloku nie przetrwała checkoutu brancha w trakcie sesji), więc bez zmian w bloku; wymaga ręcznej decyzji człowieka |
| juz-ide-api-1 (identyczne skrypty/`.eslintrc` w 2/3/4, zweryfikowane diffem) | 277 błędów, 3259 problemów, **przebieg 4m47s** | osłabione — dług + czas nie do przyjęcia dla sondy |
| _uls | 1167 błędów, 2760 problemów | osłabione |
| grant-flow | 2463 błędy, 3622 problemy | osłabione |

## Zmiany

- `blocks/ddd/layers.yml`: `lint:check` usunięty z `checks` warstw domain/application/infrastructure
  i z `final_gate.checks`. Dotyczy: juz-ide-api-1..4, _uls (przez alias `ddd`).
- `blocks/flat-service.yml`: `lint:check` usunięty z `final_gate.checks` — nazwa skryptu i baseline
  nie były potwierdzone na żadnym realnym projekcie tego bloku (obecnie żaden aktywny projekt go nie
  konsumuje bezpośrednio).
- `grant-flow/.claude/blocks/ddd-layers-grant-flow.yml` (lokalny blok, projekt satelicki): to samo.
- `ai-os-bot/.claude/blocks/bot-verifiers.yml`: **bez zmian** — final_gate już nie miał `checks`
  (stan po niezacommitowanej wcześniejszej edycji, która nie przetrwała `git checkout` na inny branch
  w trakcie sesji). Warstwa `implementation` nadal ma `checks: ["typecheck", "lint"]` z WCZEŚNIEJSZEJ,
  osobnej sesji (widoczne w `git log` tego pliku, commit `7b4106a`) — to nie jest ten sam dodatek i
  nie zostało ruszone tutaj; realny fix (tsconfig) czeka na człowieka z powodu `config-protection`.
- `ai-gateway`, `iam`: bez zmian bloku — czyste.
- `marketing-hub`: bez zmian bloku, naprawiony 1 błąd w kodzie źródłowym (patrz wyżej).

## ⚠️ Ostrzeżenie operacyjne

Fix w `marketing-hub` (`lead-token.mapper.ts`) zrobiony przy **żywym procesie** `/orchestrate` w tym
repo (PID z cwd=marketing-hub, task TS-MH-005, znacznik `orchestrating.json` z mtime 85 sekund przed
edycją). Edycja była semantycznie neutralna (zamiana kolejności 2 linii importu) i nie kolidowała na
poziomie plików, ale zrobiona bez wcześniejszego sprawdzenia żywych procesów — błąd procesu, nie
powtarzać. `grant-flow` i `ai-os-bot` miały też znaczniki `orchestrating.json` (odpowiednio ~4h55min
i ~3h20min stare w chwili audytu) z żywymi procesami `claude` o cwd w tych katalogach (uptime 4h55min
i 17h32min) — prawdopodobnie utknięte przebiegi (zgodne z hipotezą: lint na pre-istniejącym długu
blokował je od startu). Tam ograniczyłem się do samej konfiguracji (`.claude/blocks/*.yml` +
`runtime.yml`) — nie dotyka `src/`, nie wpływa na już wczytane argumenty trwającego przebiegu.

## ✅ Kryterium ukończenia (per projekt, niezależnie)

`lint`/`lint:check` wraca do `checks` warstwy i `final_gate` dopiero gdy `npm run lint:check`
(albo `lint`) jest **czysty (0 błędów)** na całym repo, niezależnie od żadnego taska — nie
wystarczy naprawić tylko plików dotkniętych bieżącą zmianą. Do czasu spłaty długu:
- ai-os-bot: naprawić `eslint.config.js` → `project: './tsconfig.eslint.json'` (wymaga zgody
  człowieka na ominięcie `config-protection` albo edycji ręcznej poza tym hookiem).
- juz-ide-api-1..4, _uls, grant-flow: real backlog (277–2463 błędów) — osobna, świadoma praca,
  nie coś do zrobienia przy okazji tego tasku.
