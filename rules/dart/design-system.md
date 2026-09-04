# Flutter Design System Rules (DS-007)

## CRITICAL: AppTypography — zero hardkodowanych TextStyle

NEVER używaj `TextStyle(fontSize: ...)` bezpośrednio w kodzie prezentacji.
ALWAYS używaj `AppTypography.*` tokenów.

```dart
// WRONG — hardkodowany styl
style: TextStyle(fontSize: 14.0, color: LocalHeroDesignTokens.v1Coffee)

// WRONG — hardkodowany z elder mode (ternary)
style: TextStyle(fontSize: elderMode ? 18.0 : 14.0)

// CORRECT — token bez elder mode (prezentacja bez skalowania)
style: AppTypography.bodyM.copyWith(color: LocalHeroDesignTokens.v1Coffee)

// CORRECT — token z elder mode scaling
style: AppTypography.scale(AppTypography.bodyM, elderMode: elderMode)
    .copyWith(color: LocalHeroDesignTokens.v1Coffee)
```

### Token mapping (fontSize → AppTypography):

| fontSize | Token |
|---|---|
| 11px | `AppTypography.labelS` |
| 12px | `AppTypography.labelM` / `AppTypography.bodyS` |
| 14px | `AppTypography.bodyM` |
| 16px | `AppTypography.bodyL` / `AppTypography.titleS` |
| 18px | `AppTypography.titleM` |
| 20px | `AppTypography.titleL` |
| 24px | `AppTypography.displayM` |
| 28px | `AppTypography.displayL` |
| 32px | `AppTypography.displayXL` |

### AppTypography jest NON-CONST

`GoogleFonts.*()` zwraca non-const TextStyle. Konsekwencje:
- `const Text('...', style: AppTypography.bodyM)` → BŁĄD kompilacji
- Usuń `const` z widgetów które przekazują `style: AppTypography.*`
- `const` przy `SizedBox`, `EdgeInsets`, `BorderRadius` — nadal OK

---

## CRITICAL: AppIcons / Symbols — zero Icons.*

NEVER używaj `Icons.*` z `package:flutter/material.dart`.
ALWAYS używaj `AppIcons.*` (katalogowe ikony) lub `Symbols.*` (material_symbols_icons).

```dart
// WRONG
Icon(Icons.arrow_back)
Icon(Icons.event)
Icon(Icons.check_circle_outline)

// CORRECT — katalogowe ikony przez AppIcons
Icon(AppIcons.back)
Icon(AppIcons.events)

// CORRECT — pozostałe ikony przez Symbols
Icon(Symbols.arrow_back)
Icon(Symbols.check_circle)   // _outline suffix stripped — Symbols domyślnie outlined
```

### Suffixowe zamiany przy migracji Icons.* → Symbols.*:

| Icons suffix | Symbols odpowiednik |
|---|---|
| `Icons.X` | `Symbols.X` |
| `Icons.X_outlined` | `Symbols.X` (outlined to default) |
| `Icons.X_outline` | `Symbols.X` |
| `Icons.X_rounded` | `Symbols.X` |
| `Icons.check_circle_outline` | `Symbols.check_circle` |
| `Icons.star_border` | `Symbols.star` |
| `Icons.favorite_border` | `Symbols.favorite` |
| `Icons.paste` | `Symbols.content_paste` |

### Kategorie ikon — FIXED per BRAND.md

Ikony kategorii są NIEZMIENNE. Komponenty kategorii (np. `V1EntityHubTile`) derywują ikonę
WEWNĘTRZNIE z `accent` enum — nie przyjmują `IconData` jako parametru.

```dart
// WRONG — ikona kategorii jako parametr
V1EntityHubTile(
  accent: V1CategoryAccent.events,
  icon: Icons.event,  // ← NIE rób tego
  ...
)

// CORRECT — ikona derywowana wewnętrznie z accent
V1EntityHubTile(
  accent: V1CategoryAccent.events,  // ← ikona = AppIcons.events automatycznie
  ...
)
```

---

## Interactive states — wzorzec ConsumerStatefulWidget

> **Zaktualizowane 2026-07-11** (decyzja Pawła, miękki kierunek wizualny BRAND.md 2026-07-06 +
> MOTION-FRAMEWORK.md §8.1): pressed state = **zmiana koloru tła cream → latte**, NIE
> `translate(2,2) + shadow collapse`. Stary twardy wariant jest DEPRECATED — nie kopiuj go
> z niezmigrowanych plików legacy; docelowo każdy tappable przechodzi na `SoftPressable`
> z `lib/core/motion/` (gdy MOTION-001 wyląduje).

Każdy interaktywny komponent (tappable) MUSI implementować:

1. **Pressed state**: tween koloru tła `v1Cream → v1Latte` (`animationFast`) — bez translate,
   bez kolapsu cienia (w miękkim stylu nie ma twardego cienia, który mógłby się „zapadać")
2. **Focus ring**: WCAG SC 2.4.7 — widoczny focus indicator klawiaturowy
3. **Semantics**: `button: true` + `label:`
4. **Tap target**: min 44×44dp (`BoxConstraints(minHeight: 44)`)

```dart
class MyWidget extends ConsumerStatefulWidget {
  @override
  ConsumerState<MyWidget> createState() => _MyWidgetState();
}

class _MyWidgetState extends ConsumerState<MyWidget> {
  bool _pressed = false;
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final elderMode = ref.watch(elderModeProvider);

    return Focus(
      onFocusChange: (f) => setState(() => _focused = f),
      child: AnimatedContainer(
        duration: LocalHeroDesignTokens.animationFast,
        decoration: _focused
            ? BoxDecoration(boxShadow: [BoxShadow(
                color: LocalHeroDesignTokens.v1Coffee.withAlpha(180),
                spreadRadius: 3,
              )])
            : const BoxDecoration(),
        child: Semantics(
          button: true,
          label: widget.label,
          child: GestureDetector(
            onTap: widget.onTap,
            onTapDown: (_) => setState(() => _pressed = true),
            onTapUp: (_) => setState(() => _pressed = false),
            onTapCancel: () => setState(() => _pressed = false),
            child: AnimatedContainer(
              duration: LocalHeroDesignTokens.animationFast,
              curve: Curves.easeInOut,
              constraints: const BoxConstraints(minHeight: 44),
              decoration: BoxDecoration(
                color: _pressed
                    ? LocalHeroDesignTokens.v1Latte
                    : LocalHeroDesignTokens.v1Cream,
                borderRadius: BorderRadius.circular(8),
                border: LocalHeroDesignTokens.getSoftBorder(),
                boxShadow: LocalHeroDesignTokens.getSoftShadow(),
              ),
              child: ...,
            ),
          ),
        ),
      ),
    );
  }
}
```

---

## LocalHeroDesignTokens — zero hardkodowanych wartości

Wszystkie kolory, paddingi, bordery, animacje przez tokeny:

```dart
// WRONG
color: Color(0xFF3E2723)
padding: EdgeInsets.all(16.0)
border: Border.all(width: 3.0)

// CORRECT
color: LocalHeroDesignTokens.v1Coffee
padding: EdgeInsets.all(LocalHeroDesignTokens.space16)
border: Border.all(width: LocalHeroDesignTokens.borderMedium)
```

---

## Podział ról: core/design/components (V1) vs core/ui + core/widgets

`core/ui/` i `core/widgets/` to sankcjonowana warstwa ogólnych utili (avatar, loading
state, error state, kontekstowa pomoc, elderly-friendly button) — NIE migrować mechanicznie
do V1. `core/design/components/` (V1, `v1_*.dart`) jest zarezerwowany dla komponentów
card/feed/badge/detail-screen-specific. Decyzja: `UX-POLISH-001-FOLLOWUPS-020`
(`completed-tasks/`, 2026-09-04).

---

## Enforced by

- `check-clean-arch.js` hook — forbidden imports in domain/application
- `check-riverpod-patterns.js` hook — ref.read() inside build()
- `flutter-quality-verifier` agent — weryfikuje AppTypography, AppIcons, interactive states
- `flutter-ui-verifier` agent — weryfikuje WCAG, focus ring, tap targets
