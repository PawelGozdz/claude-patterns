---
id: TASK-ORCH-PREPARE-FORMS-001
title: '`orchestrate-prepare` nie ma formy na to, co zatwierdzona analiza już wyraża: units, pliki towarzyszące, patterns_exclude, nadpisania args'
type: feature
status: done
priority: P2
story_points: 5
created_date: 2026-09-24
updated_date: 2026-09-24
assignee: '@unassigned'
labels: [kaizen, orchestration, analyze]
depends_on: [TASK-ORCH-FALSE-GO-001]
related: [TASK-ORCH-PROBE-NEW-FILES-001, TASK-ORCH-IMPL-SILENT-001]
source: >
  Feedback z marketing-hub, 2026-09-24, run wf_a95b083c-a06 (TS-MH-005). Punkty 5, 7, 8, 9
  feedbacku. Zweryfikowane w kanonie 2026-09-24.
---

# TASK-ORCH-PREPARE-FORMS-001: formy w prepare

## 🎯 Goal

Analiza wyraża rzeczy, których prepare nie umie przenieść do silnika: podział na jednostki,
pliki towarzyszące zmienianym plikom, fałszywe trafienia wzorców. Dziś prepare je po cichu
gubi albo człowiek łata je ręczną kopią skryptu. Każde pole ma albo zostać skonsumowane, albo
zatrzymać start (exit 2) z komunikatem. Ciche pominięcie nie jest trzecią opcją
(ta sama zasada co ANL-037).

## 1. `units[]` ignorowane po cichu

Analiza TS-MH-005 zaplanowała 4 przebiegi infrastruktury, prepare zbudował jeden. Szablon
analizy opisuje `units: []` jako „Ralphinho seam, MVP: zostaw []", a prepare pola nie czyta
wcale. Człowiek zauważył to dopiero przy czytaniu wyjścia.

- Etap 1 (tani, od razu): niepuste `units` → exit 2 z komunikatem „units nieobsługiwane,
  rozbij na osobne taski albo użyj layers_scope". Zamyka ciche gubienie.
- Etap 2: prepare rozwija `units: [{ id, layer, dirs, role?, checks? }]` w pod-warstwy
  (`<layer>:<unit>`) w kolejności z artefaktu; `layers_done` przyjmuje id pod-warstw.
  To odpowiada też na otwartą kwestię z ANL-037 (scope per unit zamiast per warstwa).

## 2. Pliki towarzyszące (ORC-016)

`pnpm -r run test` zatrzymuje się na pierwszym czerwonym pakiecie. Warstwa zmienia
`role-permissions.map.ts`, ale `layerTouches` i blok ZAKRES traktują
`role-permissions.adapter.spec.ts` jako plik spoza zakresu, gdy zakres jest zawężony do
pliku. To samo z `env.schema.ts` i jego specem; nowa wymagana zmienna środowiskowa wywraca
setup testów L2/L3.

- `layerTouches` i `scopeBlock`: plik `<nazwa>.spec.ts` / `.test.ts` obok pliku z zakresu
  należy do zakresu.
- `/analyze` wypisuje sekcję „pliki towarzyszące" (specy, setupy testowe, `.env.example`,
  compose) dla każdej jednostki, a prepare dołącza ją do `scope.dirs`.
- `layers-monorepo` w marketing-hub to blok lokalny; w kanonie ORC-016 dotyczy `checks`
  (`pnpm --filter <pkg>...` zamiast `-r`). Sprawdzić, czy przykład w
  `templates/project.yml.example` nie podpowiada `-r run test` bez `--no-bail`.

## 3. `patterns_exclude[]`

Analiza TS-MH-005 wypisała w komentarzu fałszywe trafienia keywordów (TCC na „confirm",
wzorce web na „dashboard"), ale artefakt nie ma pola, żeby je odrzucić, więc karty i tak
trafiły do promptu.

- Pole `patterns_exclude: [<ścieżka wzorca>]` w szablonie analizy i w prepare. Wpis
  nieistniejący w wyniku dopasowania → ostrzeżenie (literówka), nie błąd.
- Brakujące karty, o które prepare już ostrzega: `patterns/infrastructure/zod-schema-validation-pattern_summary.md`
  (pełny wzorzec 13,5 KB idzie w każdej turze implementera) i
  `patterns/infrastructure/rate-limit-guard-pattern_summary.md`. Tworzone przez `/add-pattern`
  (tryb karty), potem `./scripts/reseed-patterns.sh`.

## 4. Nadpisania args wymagają ręcznej kopii szablonu

Przy ~150 KB args nie da się ich przekazać ręcznie. Każdy przebieg w marketing-hub kończy się
skryptem, który kopiuje szablon i podmienia treść; była już pułapka `$'` w `String.replace`.

- `orchestrate-prepare.mjs --emit-script <ścieżka>`: zapisuje kopię szablonu z wbudowanym
  `const args = …` (bez `String.replace` ze stringiem zastępczym; funkcja albo sklejanie),
  przepuszcza ją przez `hooks/workflow-lint.js` i zwraca `scriptPath` do tej kopii.
- `--overrides <plik.json>`: głębokie scalenie z wyjściem prepare przed emisją
  (budżety, wyłączenie warstwy, dodatkowe `checks`). Nadpisanie klucza, którego wyjście nie
  zna → exit 2.

## ✅ Kryterium ukończenia

- Testy prepare: niepuste `units` → exit 2 (etap 1); `patterns_exclude` usuwa wzorzec;
  `--emit-script` daje plik, który przechodzi `workflow-lint` i zawiera args z `$'` bez
  zniekształcenia; `--overrides` z nieznanym kluczem → exit 2.
- Eval szablonu: zmiana w `x.ts` i `x.spec.ts` przy zakresie zawężonym do `x.ts` → spec
  w `layerFiles`.
- Karty zod-schema-validation i rate-limit-guard istnieją i są zaseedowane.
- `commands/orchestrate.md`, `commands/analyze.md`, `templates/task-analysis-template.md`,
  `orchestrate-rule-history.md`, `CHANGELOG.md` zaktualizowane.

## Wynik (2026-09-24)

- Punkt 1: od razu etap 2. `units[]` rozwijane w pod-warstwy `<warstwa>:<id>` (`base`, zakres jak
  `layers_scope`, checks/rola jednostki), `layers_done` przyjmuje id pod-warstwy i warstwy bazowej;
  błędny wpis = exit 2. ORC-064.
- Punkt 2: test w tym samym katalogu i z tym samym rdzeniem nazwy co plik z zakresu należy do
  zakresu (`isCompanion` w `layerTouches`, sonda przyrostu, blok ZAKRES). Pozostałe pliki
  towarzyszące analiza wpisuje do `dirs` (ANL-038, szablon analizy). `templates/project.yml.example`
  nie podpowiada `pnpm -r`, zmiana niepotrzebna.
- Punkt 3: `patterns_exclude[]` (wzorce globalne i warstwowe), ostrzeżenie dla wpisu bez trafienia.
  Karty `zod-schema-validation` (9 reguł, ~4 KB) i `rate-limit-guard` (6 reguł, ~2,7 KB).
- Punkt 4: `--overrides` i `--emit-script`. Odstępstwo od planu: nieznany klucz w nadpisaniu daje
  exit 1 (błąd użycia), nie 2 (2 jest zarezerwowane dla bramki analizy). Smoke na TS-MH-005
  z marketing-hub: 190 KB skryptu, lint zielony. ORC-065.
