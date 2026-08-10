# Localization (Flutter, ARB) — Rule Card
<!-- Egzekwowalne streszczenie localization-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (kontekst, uzasadnienie, real-code przykłady): localization-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Cross-Layer · **Applies to**: `lib/features/*/presentation/**`;
`lib/l10n/app_*.arb`; `lib/**/domain/**` (dla reguł o hardkodowanym tekście)

## MUST

- **L1** — Tekst widoczny dla użytkownika w `presentation/**` idzie przez `context.l10n.keyName`, nie literał string.
- **L2** — Nowy klucz: `lowerCamelCase`, `featureName_screenContext_element`.
- **L3** — Klucz z placeholderem/liczbą mnogą ma blok `@klucz` z `description` i typowanymi `placeholders` w OBU plikach ARB.
- **L4** — Tekst zależny od liczby przez ICU `{count, plural, ...}` z gałęziami `one`/`few`/`many`/`other` w `app_pl.arb`.
- **L5** — Nowy klucz dodany jednocześnie do `app_en.arb` i `app_pl.arb` w tym samym PR.
- **L6** — Data/liczba/waluta przez `intl` (`DateFormat`/`NumberFormat`) z bieżącym `Localizations.localeOf(context)`.
- **L7** — `domain/` zwraca klucz lub sam wariant `enum` — tekst gotowy do wyświetlenia rozwiązywany wyłącznie w `presentation/`.

## MUST NOT

- **N1** — ❌ Hardkodowany string w `presentation/screens\|widgets/**`.
- **N2** — ❌ Gotowy tekst zwracany z `domain/entities/**`/`domain/failures/**` (`case X: return 'Tekst';`, `super('Komunikat')`).
- **N3** — ❌ Klucz dodany tylko do jednego z dwóch plików ARB.
- **N4** — ❌ Polska liczba mnoga obsłużona przez `one`/`other` bez `few`/`many`.
- **N5** — ❌ Sklejanie zdania wokół zmiennej liczbowej (`'Masz ' + n + ' wiadomości'`) zamiast ICU plural.
- **N6** — ❌ Ręczne formatowanie daty/kwoty zamiast `intl` z locale.
- **N7** — ❌ Klucz-śmieć bez kontekstu (`text1`, `label2`).

## Minimal correct skeleton

```dart
// domain/entities/availability_type.dart — L7
enum AvailabilityType { available, canHelp, offering } // bez displayName

// presentation/extensions/availability_type_l10n.dart — L1, L7
extension AvailabilityTypeL10n on AvailabilityType {
  String label(AppLocalizations l10n) => switch (this) {
    AvailabilityType.available => l10n.availabilityAvailable,           // L1
    AvailabilityType.canHelp => l10n.availabilityCanHelp,
    AvailabilityType.offering => l10n.availabilityOffering,
  };
}
```

```json
// app_en.arb — L3, L4, L5
"unreadMessagesCount": "{count, plural, =0{No messages} one{1 message} other{{count} messages}}",
"@unreadMessagesCount": { "description": "Unread message count", "placeholders": { "count": { "type": "int" } } },

// app_pl.arb — L4: pełny rozkład polskich form
"unreadMessagesCount": "{count, plural, =0{Brak wiadomości} one{1 wiadomość} few{{count} wiadomości} many{{count} wiadomości} other{{count} wiadomości}}",
```

```dart
// L6
DateFormat.yMMMd(Localizations.localeOf(context).toString()).format(date);
```

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| `Text('...')` z literałem w `presentation/screens\|widgets/**` | **L1 / N1** |
| `case X: return 'Tekst';` / `super('Komunikat')` w `domain/**` | **L7 / N2** |
| Klucz w `app_en.arb`, brak w `app_pl.arb` (lub odwrotnie) | **L5 / N3** |
| ICU plural z tylko `one{...} other{...}` w `app_pl.arb` | **L4 / N4** |
| `'...' + count.toString() + '...'` budujące zdanie zależne od liczby | **N5** |
| Ręczny format daty/kwoty zamiast `intl` | **L6 / N6** |
| Klucz z placeholderem bez `@klucz`/`placeholders`/`description` | **L3** |
| Klucz `text1`/`label2` bez kontekstu semantycznego | **N7** |

**Pełny wzorzec**: [`localization-pattern.md`](./localization-pattern.md)
