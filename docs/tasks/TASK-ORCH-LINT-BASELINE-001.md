---
id: TASK-ORCH-LINT-BASELINE-001
title: 'lint:check tymczasowo wyjęty z checks w ddd/layers, flat-service i grant-flow — przywrócić po spłacie długu per-projekt'
type: bugfix
status: done
priority: P1
story_points: 3
created_date: 2026-09-25
updated_date: 2026-11-07
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

## Stan zamknięcia (2026-11-07)

Zadanie zamknięte po stronie claude-patterns, bez zmiany bloków. Kryterium ukończenia (czysty
lint w każdym projekcie, potem powrót do `checks`) **nie jest spełnione**: żadnemu projektowi
na blokach z tego repo nie da się dziś bezpiecznie przywrócić lintu. Stan sprawdzony na develop
(35603bc) poleceniami tylko do odczytu (eslint bez `--fix`).

| Projekt (blok) | Wynik 2026-11-07 | Wniosek |
|---|---|---|
| juz-ide-api-1 (`ddd/layers`) | `pnpm run lint:check` pada z `JavaScript heap out of memory` (exit 134): po 173 s przy domyślnym stercie, po 322 s przy `--max-old-space-size=6144`. Wyniku nie udało się uzyskać | gorzej niż we wrześniu (277 błędów, 4m47s): sonda nie dostałaby żadnego werdyktu. Lint zostaje poza blokiem |
| juz-ide-api-2..8 (`ddd/layers`) | nieuruchamiane: ten sam commit 8ed4058bf i ten sam `package.json` co api-1 | dziedziczą wniosek z api-1. Od września na bloku przybyły api-5..8 |
| _uls (`ddd/layers`) | nieuruchamiane (katalogi `_*` są poza skanami) | bez zmian względem audytu: 1167 błędów |
| grant-flow (lokalny `monorepo-layers-grant-flow`) | `lint:check` (api): 37 błędów i 1180 ostrzeżeń, we wrześniu 2463 błędy i 3622 problemy. `lint:check:web`: exit 0 | dług prawie spłacony, ale nie zerowy: lint nie wraca. Szczegóły w „Odroczone" |
| marketing-hub (`monorepo-layers`) | `lint:check:api`: 0 błędów, 71 ostrzeżeń, 22 s | czysty. Blok `monorepo-layers` ma już `lint:check:api` w `checks` warstw i `lint:check` w `final_gate` |
| ai-os-bot (lokalny `bot-verifiers`) | `npm run lint` (`eslint src/`): exit 0; `eslint.config.js` wskazuje `tsconfig.eslint.json` | usterka z audytu naprawiona w repo ai-os-bot; `lint` jest w `checks` i `final_gate` |
| ai-gateway, iam (lokalne bloki) | bez zmian od września: `lint` w `checks` i `final_gate` | nic do zrobienia |
| flat-service | żaden projekt nie bierze tego bloku wprost (iam, ai-gateway, ai-os-bot mają własne bloki z `lint`) | lint zostaje wyjęty; nazwa skryptu nadal niepotwierdzona na realnym konsumencie |

Bloków `ddd/layers` i `flat-service` nie zmieniałem. Żadna zmiana zachowania nie jest uzasadniona,
a sam komentarz bloku trafia do `runtime.yml` dziewięciu projektów (api-1..8, _uls) i wymusiłby
rematerializację bez skutku dla `/orchestrate`. Komentarz w `ddd/layers` nadal mówi prawdę
(przywrócić po czystym `lint:check` w każdym projekcie bloku); nieaktualna jest tylko lista
konsumentów, bo api-5..8 doszły po wrześniu.

## Odroczone (praca w repozytoriach innych projektów)

1. **grant-flow** (najbliżej celu). W `apps/api` zostało 37 błędów: 27× `import/order`, 2×
   `prefer-const`, 1× `lines-between-class-members`, 1× `no-floating-promises`
   (`project-write-authz.e2e.spec.ts:123`) oraz 6 błędów parsowania w plikach `apps/api/test/**`
   spoza `tsconfig.json`, z którego korzysta ESLint (rozwiązanie jak `tsconfig.eslint.json` w
   ai-os-bot). Trzydzieści z 37 naprawia `--fix`. Gdy `lint:check` da exit 0, przywrócić
   `lint:check:api` w `checks` warstw i `lint:check` w `final_gate` lokalnego bloku
   `monorepo-layers-grant-flow.yml`. Pkt 2 i 5 jego nagłówka wspomina jeszcze dług 2463 błędów, co
   jest nieaktualne.
2. **juz-ide-api-1..8** (jeden kod, jedna naprawa). Najpierw sprawić, żeby `lint:check` w ogóle się
   kończył: OOM przy 6 GB sterty wskazuje na zbyt szeroki `parserOptions.project` albo reguły
   z informacją o typach na całym drzewie (`{src,apps,test}/**/*.ts`). Dopiero potem spłata
   277+ błędów. Warunek przywrócenia w `blocks/ddd/layers.yml`: czysty `lint:check` w czasie
   rzędu minut (nie 5+) w każdym projekcie na bloku.
3. **_uls**: 1167 błędów z audytu wrześniowego, osobna praca.

Gdy pierwszy z projektów 1 lub 2 będzie czysty, przywrócenie po stronie tego repo to jedna edycja
`blocks/ddd/layers.yml` (`lint:check` do `checks` warstw domain/application/infrastructure i do
`final_gate.checks`), a potem `audit-projects`, `materialize-runtime` i `verify-project-setup`
w każdym projekcie bloku. To wymaga nowego zadania, ten plik już nie jest otwarty.
