# Component Creation Pattern (DS-007)

> Każdy nowy komponent w `lib/core/design/components/` musi przejść 6 gates.
> Wzorzec V1 components (v1_entity_card, v1_menu_row_card, v1_filter_chip) jest referencją.

## 6 Gates — obowiązkowe

| Gate | Check | Fail action |
|---|---|---|
| G1 Domain rule | Pure UI, zero infra imports (`package:dio/`, `dart:io`, itp.) | VETO — usuń import |
| G2 Token compliance | Zero hardcoded hex/dp/px. Wszystkie przez `LocalHeroDesignTokens.*` | VETO — zastąp tokenem |
| G3 WCAG AA | Kontrast 4.5:1 text, 3:1 UI, tap target ≥44dp, focus ring obecny | VETO — napraw |
| G4 Widget test | Każdy wariant + semantics tree | WARN bez testów — VETO na merge |
| G5 Golden test | Per variant przy `flutter test --update-goldens` | WARN bez golden — VETO na merge |
| G6 Component story | Markdown w `lib/core/design/components/stories/` z 4+ visual examples | WARN — blokuje Sprint F |

---

## Anatomia komponentu V1 — minimalny szablon

```dart
// G1: pure UI — no infra imports.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_symbols_icons/symbols.dart';      // dla ikon

import 'package:local_hero_mobile_app/core/design/tokens/app_icons.dart';
import 'package:local_hero_mobile_app/core/design/tokens/app_typography.dart';
import 'package:local_hero_mobile_app/core/design/tokens/local_hero_design_tokens.dart';
import 'package:local_hero_mobile_app/core/providers/elder_mode_provider.dart';

/// DocString: przeznaczenie, struktura ASCII art, usage snippet.
class V1MyComponent extends ConsumerStatefulWidget {
  const V1MyComponent({
    required this.onTap,
    required this.label,
    super.key,
  });

  final VoidCallback onTap;
  final String label;

  @override
  ConsumerState<V1MyComponent> createState() => _V1MyComponentState();
}

class _V1MyComponentState extends ConsumerState<V1MyComponent> {
  bool _pressed = false;
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final elderMode = ref.watch(elderModeProvider);

    final card = AnimatedContainer(
      duration: LocalHeroDesignTokens.animationFast,
      curve: Curves.easeInOut,
      transform: _pressed
          ? Matrix4.translationValues(2.0, 2.0, 0.0)
          : Matrix4.identity(),
      constraints: const BoxConstraints(minHeight: 44),
      decoration: BoxDecoration(
        color: LocalHeroDesignTokens.v1Cream,
        border: Border.all(
          color: LocalHeroDesignTokens.v1Coffee,
          width: LocalHeroDesignTokens.borderMedium,
        ),
        boxShadow: [
          BoxShadow(
            color: LocalHeroDesignTokens.v1Coffee,
            offset: _pressed
                ? LocalHeroDesignTokens.shadowSmall
                : LocalHeroDesignTokens.shadowMedium,
          ),
        ],
      ),
      child: Padding(
        padding: EdgeInsets.all(
          elderMode ? LocalHeroDesignTokens.space20 : LocalHeroDesignTokens.space16,
        ),
        child: Text(
          widget.label,
          style: AppTypography.scale(AppTypography.bodyM, elderMode: elderMode)
              .copyWith(color: LocalHeroDesignTokens.v1Coffee),
        ),
      ),
    );

    return Focus(
      onFocusChange: (focused) => setState(() => _focused = focused),
      child: AnimatedContainer(
        duration: LocalHeroDesignTokens.animationFast,
        decoration: _focused
            ? BoxDecoration(
                boxShadow: [
                  BoxShadow(
                    color: LocalHeroDesignTokens.v1Coffee.withAlpha(180),
                    spreadRadius: 3,
                  ),
                ],
              )
            : const BoxDecoration(),
        child: Semantics(
          button: true,
          label: widget.label,
          child: GestureDetector(
            onTap: widget.onTap,
            onTapDown: (_) => setState(() => _pressed = true),
            onTapUp: (_) => setState(() => _pressed = false),
            onTapCancel: () => setState(() => _pressed = false),
            child: card,
          ),
        ),
      ),
    );
  }
}
```

---

## Reguły kategorii ikon

Komponenty kategorii MUSZĄ derywować ikony wewnętrznie z `V1CategoryAccent` — nie przyjmują `IconData` jako parametru publicznego.

```dart
// CORRECT — wewnętrzna derywacja
IconData _accentIcon() => switch (widget.accent) {
  V1CategoryAccent.localShares      => AppIcons.localShares,
  V1CategoryAccent.quickJobs        => AppIcons.quickJobs,
  V1CategoryAccent.serviceOfferings => AppIcons.offerings,
  V1CategoryAccent.events           => AppIcons.events,
  V1CategoryAccent.groups           => AppIcons.groups,
  V1CategoryAccent.announcements    => AppIcons.announcements,
};

// WRONG — publiczny IconData parametr
const V1MyTile({required this.icon, ...})  // ← NIE
final IconData icon;                        // ← NIE
```

---

## Elder mode — obowiązkowy pattern

```dart
// Typography
AppTypography.scale(AppTypography.bodyM, elderMode: elderMode)

// Padding
EdgeInsets.all(elderMode ? LocalHeroDesignTokens.space20 : LocalHeroDesignTokens.space16)

// Icon size
size: elderMode ? 36.0 : 32.0

// Badge icon size
size: elderMode ? AppIcons.sizeBadgeChip * 1.25 : AppIcons.sizeBadgeChip
```

---

## Checklist przed PR

```
[ ] G1: brak importów z features/ lub infra (dio, hive, http)
[ ] G2: zero hardcoded hex, zero literal EdgeInsets/double
[ ] G3: focus ring (Focus widget), tap target ≥44dp, semantics label
[ ] G3: kontrast: coffee na cream = 11.28:1 (AAA ✓)
[ ] Pressed: Matrix4.translationValues(2.0, 2.0, 0.0) + shadowSmall
[ ] Elder mode: AppTypography.scale, padding space20, icon +25%
[ ] AppTypography.* zamiast TextStyle(fontSize:)
[ ] AppIcons.* / Symbols.* zamiast Icons.*
[ ] G4: widget test (min: renders, semantics, onTap)
[ ] G5: golden test (min: normal + elder variant)
[ ] G6: story markdown (min: 4 przykłady użycia)
```

---

## Istniejące komponenty V1 (referencje)

| Komponent | Plik | Wzorzec |
|---|---|---|
| `V1EntityCard` | `v1_entity_card.dart` | browse list card z accent strip |
| `V1MenuRowCard` | `v1_menu_row_card.dart` | settings/profile row z count badge |
| `V1EntityHubTile` | `v1_entity_hub_tile.dart` | 1:1 kategoria tile, icon z accent |
| `V1FilterChip` | `v1_filter_chip.dart` | selected/unselected chip z accent fill |
| `V1StatusBadge` | `v1_status_badge.dart` | status pill, non-interactive |
| `V1Keyring` | `v1_keyring.dart` | horizontal scroll z brass key metaphor |
| `V1InfoTile` | `v1_info_tile.dart` | detail screen data row |
