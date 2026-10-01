---
id: TASK-ORCH-PROBE-FLUTTER-LIBPATH-001
title: 'Sonda testów buduje pathspec wprost z `dirs` — prefiks `lib/` (Flutter) daje zawsze 0 nowych testów i fałszywy ESCALATE_AND_HALT'
type: bugfix
status: done
priority: P2
story_points: 2
created_date: 2026-09-28
updated_date: 2026-09-29
assignee: '@unassigned'
labels: [kaizen, orchestration, workflow, flutter]
depends_on: []
related: [ORC-016]
source: >
  docs/tasks/_inbox/DEV-orc-035-presentation.md (juz-ide-mobile-app, DESIGN-SYSTEM-009,
  warstwa presentation, 2026-09-28) — orchestrate.template.mjs buduje pathspec sondy testów
  jako :(glob)**/<dir>/** wprost z layer.scope.dirs. Gdy --overrides poda dirs z prefiksem
  'lib/' (pełna ścieżka od korzenia repo, jak w Flutter/Dart), sonda newTestBlocks liczy 0
  na zawsze, bo drzewo test/ w Flutterze lustrzanie odwzorowuje lib/ BEZ segmentu 'lib'
  (lib/core/design/x.dart -> test/core/design/x_test.dart). Fałszywy ESCALATE_AND_HALT mimo
  realnych, poprawnych testów na dysku (potwierdzone: 5 plików, ~21 bloków test/testWidgets).
  Obejście zgłaszającego: dirs w overrides bez prefiksu 'lib/'.
---

# TASK-ORCH-PROBE-FLUTTER-LIBPATH-001 — sonda testów nie widzi testów Fluttera przy `dirs` z prefiksem `lib/`

## 🎯 Goal

`orchestrate.template.mjs` buduje pathspec sondy przyrostu testów wprost z `layer.scope.dirs`
(analogiczny mechanizm do `packageRootFor`/probe scoping z ORC-016, ale dla **innego** miejsca:
liczenia nowych bloków `test`/`testWidgets`, nie skryptów `checks`). Konwencja Flutter/Dart
rozdziela drzewo `lib/` i `test/` bez wspólnego segmentu (`lib/core/design/x.dart` →
`test/core/design/x_test.dart`, nie `test/lib/core/design/x_test.dart`). Jeśli `--overrides`
poda `dirs` jako pełną ścieżkę od korzenia repo z segmentem `lib/` (naturalne dla tego stacku),
sonda buduje pathspec, który nigdy nie trafi w faktyczne pliki testowe — licznik zawsze 0,
niezależnie od tego, ile testów realnie istnieje i przechodzi.

Skutek zaobserwowany 2026-09-28 (juz-ide-mobile-app, DESIGN-SYSTEM-009): fałszywy
`ESCALATE_AND_HALT` mimo 5 plików testowych i ~21 bloków `test`/`testWidgets` faktycznie
napisanych i zielonych.

## Przyczyna

Ten sam kształt problemu co ORC-016 (probe scoping zakłada jedną konwencję układu katalogów —
tam `checks` na roocie monorepo, tu pathspec sondy testów), ale w innym miejscu kodu i dla
innego stacku (Flutter, nie pnpm monorepo). Pathspec budowany jest z założeniem, że drzewo
testów jest podkatalogiem tego samego prefiksu co kod — założenie prawdziwe dla nestjs-ddd
(`__tests__/` obok `domain/`), fałszywe dla Flutter (`test/` lustrzane względem `lib/`, bez
segmentu `lib`).

## Poprawka (do wyboru/doprecyzowania przy implementacji)

- (a) Udokumentować ograniczenie przy `--overrides`: `dirs` dla stacków z rozdzielonym
  drzewem testów (Flutter) powinno pomijać prefiks `lib/` — najszybsze, ale przenosi
  wiedzę o silniku na każdego, kto pisze override.
- (b) **Lepiej** (proponowane przez zgłaszającego): w budowie pathspecu sondy uwzględnić
  wariant bez segmentu `lib/`, gdy `dirs` go zawiera i pierwszy wariant daje 0 trafień —
  analogicznie do tego, jak ORC-016 dodał fallback po package root zamiast wymagać, żeby
  wołający znał wewnętrzną strukturę.

## ✅ Kryterium ukończenia

Eval w `tests/flow-evals/orchestrate-script/run.js` z `dirs: ['lib/core/design/']` i
odpowiadającym drzewem testów pod `test/core/design/` (bez segmentu `lib`) — sonda liczy
`newTestBlocks > 0` dla realnie dodanych testów. Test dwukierunkowy: obecny kształt (bez
poprawki) daje 0 na tym samym fixture, poprawiony > 0.

## Wynik (2026-09-29)

Zaimplementowane jako ORC-078 (docs/decisions/orchestrate-rule-history.md#orc-078), wariant (b):
`globScoped` w `buildProbePrompt()` (`orchestrate.template.mjs`) dostaje teraz, dla każdego `dir`
zaczynającego się od `lib/`, dodatkowy wariant pathspecu bez tego segmentu, OBOK oryginalnego —
nie zawęża dopasowania dla stacków, gdzie `test/` faktycznie lustrzanie odwzorowuje `lib/`.
Nowy eval `probe-prompt-flutter-lib-path-variant` (porównanie liczby wariantów pathspecu
warstwy z prefiksem `lib/` vs bez niego, split-count na konkretnych złożonych pathspecach, nie
generyczny regex — ten pojawia się też w przykładzie w treści instrukcji promptu). Pełny suite:
32/32 (30 istniejących bez regresji + 2 nowe, razem z ORC-076).
