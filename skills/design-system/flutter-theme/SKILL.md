---
name: flutter-theme
description: "Motyw Fluttera z pakietu `juz_ide_tokens`: `ColorScheme.fromSeed`, `TextTheme`, `ThemeExtension JuzIdeTokens` (space*, statusOk/Warn/Info), golden testy jako zabezpieczenie przed regresją motywu. Odpowiednik `design-tokens` dla Fluttera — uzupełnia `patterns/flutter/design-token-pattern.md`, nie powiela go. Użyj przy każdej pracy nad kolorem/typografią/odstępem w `juz-ide-mobile-app`."
origin: juz-ide design system (wdrożenie, faza 5, część B)
allowed-tools: Read, Glob, Grep
effort: low
paths: "**/*.dart"
---

# Motyw Fluttera (JuzIdeTheme)

Kolor, typografia i skala odstępów w `juz-ide-mobile-app` mają jedno źródło: pakiet
`juz_ide_tokens` (`design-system/packages/tokens_dart`), generowany ze `tokens/*.json`
przez `design-system/scripts/lib/generate-dart.ts` do jednego pliku —
`packages/tokens_dart/lib/theme.dart`. Widget nigdy nie sięga po ten plik bezpośrednio;
sięga po `Theme.of(context)`, który aplikacja już podłączyła w `lib/main.dart`.

## Co pakiet generuje

| Element | `JuzIdeTheme.light` / `.dark` | Skąd |
|---|---|---|
| `ColorScheme` | `ColorScheme.fromSeed(seedColor: accent.coffee, brightness: …)` z 3 jawnymi nadpisaniami: `error`, `surface`, `onSurface`. Reszta ról (primary, secondary, tertiary, containery…) wyliczona algorytmicznie przez HCT z jednego seeda — **celowo** nieidentyczna z paletą Ant Design/Tailwind w wersji web. | `tokens/brand.json` |
| `TextTheme` | Wszystkie 15 slotów Material, zmapowane z 6 tokenów produktowych (`display`, `section`, `body`, `bodyStrong`, `meta`, `label`) | `tokens/product.json` |
| `JuzIdeTokens` (`ThemeExtension`) | `space4, space8, space10, space12, space14, space16, space20, space24` (double) + `statusOk`, `statusWarn`, `statusInfo` (`error` już pokryty przez `ColorScheme.error`, nie duplikuj) | `tokens/product.json` |

## Użycie w widgecie

```dart
final colors = Theme.of(context).colorScheme;
final text = Theme.of(context).textTheme;
final tokens = Theme.of(context).extension<JuzIdeTokens>()!;

Container(
  color: colors.surface,
  padding: EdgeInsets.all(tokens.space16),
  child: Text('Zapisano', style: text.bodyMedium?.copyWith(color: colors.onSurface)),
);
```

Zero `Color(0x…)`, zero literałów rozmiaru odstępu w nowym kodzie — te same zakazy co w
skillu `design-tokens`, egzekwowane tu też przez hook `check-design-tokens`.

## Golden testy — zabezpieczenie przed regresją

Zmiana w `tokens/brand.json`/`product.json` przelicza `theme.dart` całościowo — golden test
`JuzIdeTheme` (light/dark) w `juz-ide-mobile-app` (wprowadzony 2026-09-26, `wdrozenie/POSTEP.md`
"Faza 5, część A") jest tym, co łapie niezamierzoną zmianę wizualną przy bumpie pakietu.
Przy każdej zmianie wersji `juz_ide_tokens`:

1. `flutter test --update-goldens` **tylko** gdy zmiana jest zamierzona (nowy motyw, patch
   koloru) — nigdy jako odruch na czerwony test.
2. Czerwony golden bez świadomej zmiany tokenu → regresja, nie aktualizuj złotego pliku,
   zgłoś jako finding (to dokładnie zadanie agenta `token-drift`/skilla `design-audit`).

## Czego ten skill NIE uczy

Generator (`generate-dart.ts`, sprawdzone 2026-09-27) eksportuje wyłącznie to, co w tabeli
wyżej. **Nie generuje**: animacji (`Duration`/`Curve`), helperów cienia/bordera, ikon. Te
trzy warstwy zostają w `LocalHeroDesignTokens`/`AppTypography`
(`patterns/flutter/design-token-pattern.md`) — ten skill ich nie powiela, tylko rozgranicza
zakres. Kanon dla animacji/cieni/ikon dziś: pattern, nie ten skill.

Kolizja `.claude/rules/dart/design-system.md` (DS-007) z tym podziałem — reguła każe
`AppTypography.*` dla całego tekstu bez rozróżnienia nowego/starego systemu — jest
nierozstrzygnięta i celowo nie rozstrzyga jej ten skill (`patterns/flutter/design-token-pattern.md`,
sekcja statusu, ma pełen opis). `design-audit`/`token-drift` mogą to zgłaszać jako finding,
nie zmieniać reguł.

## Sygnał driftu: motyw ciemny „ROBOCZE”

Gdy `tokens/brand.json` ma niekompletny `color.dark`, generator wstawia komentarz
`// JuzIdeTheme.dark — ROBOCZE` w wygenerowanym `theme.dart`. Ten komentarz w repo
konsumenckim (`juz-ide-mobile-app`, po `pnpm build` w `design-system`) znaczy: dark mode
tej wersji tokenów nie jest kompletny — nie buduj na nim ostatecznych decyzji wizualnych,
zgłoś w repo `design-system`, nie omijaj lokalnym patchem.

## Gdy tokenu brakuje

Tak samo jak w `design-tokens`: nie wymyślaj wartości. Nowy token powstaje w repo
`design-system` (patrz skill `token-change`), dopiero potem trafia do `juz_ide_tokens`.
