# Pattern: Localization (Flutter, ARB)

**Layer**: Cross-Layer
**Status**: production

## What This Is

Wzorzec lokalizacji tekstu UI we Flutterze przez pliki ARB (`app_<locale>.arb`)
jako **jedyne źródło prawdy** dla stringów prezentacyjnych, z generowaniem
klas `AppLocalizations` przez `flutter gen-l10n`. Pokrywa: (1) ARB jako
jedyne źródło tekstów, (2) konwencję nazewnictwa kluczy, (3) placeholdery i
liczbę mnogą — w tym **trzy formy mnogie polskiego** (1 / 2-4 / 5+), które
angielski (`one`/`other`) nie ma i które łatwo pominąć, jeśli projektuje się
lokalizację z myślą wyłącznie o angielskim, (4) utrzymywanie ARB w
synchronizacji między językami, (5) formatowanie dat/liczb/walut przez
`intl` z locale zamiast ręcznego sklejania stringów.

Materiał źródłowy i przykłady real-code pochodzą z audytu
`juz-ide-mobile-app` — repo z **4840 kluczami** w każdym z dwóch plików ARB
(`app_en.arb`, `app_pl.arb`), formalnie dwujęzyczne, ale z odkrytym w
audycie długiem: setki plików z twardo zakodowanym polskim tekstem poza
warstwą prezentacji (patrz sekcja Anti-Patterns) — mimo istnienia kompletu
tłumaczeń.

## When to Use

**Use this pattern for:**
- ✅ Aplikacja Flutter obsługuje więcej niż jeden język (lub planuje w
  najbliższej przyszłości — koszt wdrożenia ARB od początku jest dużo niższy
  niż retrofit setek hardkodowanych stringów później)
- ✅ Projekt ma warstwę domenową (DDD-lite, clean architecture) i trzeba
  zdecydować, gdzie żyje tekst prezentowany użytkownikowi, a gdzie klucz
- ✅ Tekst zawiera liczby wymagające odmiany (liczba mnoga), zwłaszcza przy
  języku z więcej niż dwiema formami (polski, rosyjski, arabski...)
- ✅ Code review / audyt przed wydaniem — sekcja Anti-Patterns to gotowa
  lista grep-owalnych sygnałów problemu

**Do NOT use for:**
- ❌ Logów deweloperskich (`debugPrint`, `log.error(...)`), komunikatów
  wyjątków przeznaczonych dla programisty (stack trace, komunikaty w
  narzędziach diagnostycznych) — te zostają po angielsku i **nie** trafiają
  do ARB; tłumaczenie ich to szum, nie wartość
- ❌ Identyfikatorów technicznych — nazwy tras (`route paths`), klucze
  widgetów (`Key('email_field')`), wartości JSON/API, nazwy w `enum` (sam
  identyfikator `AvailabilityType.available`, nie jego tekst do wyświetlenia)
- ❌ Reguł dostępności (kontrast, rozmiar dotyku, semantyka) — to siostrzany
  wzorzec [`accessibility-pattern.md`](./accessibility-pattern.md); tam,
  gdzie się przecinają (`Semantics(label: context.l10n.xyz)`), ten wzorzec
  odpowiada za *skąd bierze się tekst*, tamten za *czy jest dostępny*

## Implementation

### 1. ARB jako jedyne źródło tekstów UI

Zakaz obowiązuje w całej warstwie prezentacji — żaden string użytkownika nie
jest wpisany bezpośrednio w widgecie:

```dart
// WRONG
Text('Zapisz')
Text('Edytuj profil')

// CORRECT
Text(context.l10n.saveButton)
Text(l10n.profileEditTitle)
```

Zakres egzekwowania (z `rules/dart/l10n.md`, spójne z tym wzorcem):
- **Wymagane**: `lib/features/*/presentation/screens/**`,
  `lib/features/*/presentation/widgets/**`, każdy plik renderujący tekst
  użytkownikowi
- **Niewymagane**: warstwa domenowa (klucze, nie gotowy tekst), warstwa
  danych (wartości API, klucze JSON), pliki testowe, ścieżki tras, klucze
  widgetów, wartości `enum`

### 2. Konwencja nazewnictwa kluczy

`lowerCamelCase`, wzorzec `featureName_screenContext_element` — wystarczająco
opisowy, by dwie osoby dodające klucz niezależnie nie stworzyły duplikatu o
innej nazwie:

```
authLoginTitle
profileEditSaveButton
localSharesEmptyState
quickJobsPriceRange
trust_operates_since
```

(W praktyce repo zawiera oba style — `lowerCamelCase` i `snake_case` — bo
klucze rosły organicznie z dwóch źródeł historycznych; nowe klucze trzymaj
się `lowerCamelCase`, nie wprowadzaj trzeciej konwencji.)

### 3. Placeholdery i liczba mnoga — **polski ma trzy formy**

Angielski ICU plural rozróżnia `one` / `other`. Polski wymaga **czterech**
gałęzi w praktyce: `one` (1), `few` (2–4), `many` (5+ oraz 0 w wielu
kontekstach), `other` (formy ułamkowe/nietypowe — ICU wymaga jej jako
fallbacku nawet gdy w praktyce nieużywana). Pominięcie `few`/`many` i
poleganie tylko na `one`/`other` (jak w angielskim) daje gramatycznie błędny
polski dla 2–4 i 5+ — częsty błąd, gdy lokalizację projektuje się najpierw
po angielsku i "dopisuje" polski przez kalkę.

Realny przykład z `app_en.arb` (dwie gałęzie wystarczają angielskiemu):

```json
"quickJobsOffers": "{count, plural, =0{No offers} one{1 offer} other{{count} offers}}",
"@quickJobsOffers": {
  "description": "Number of offers with plural forms",
  "placeholders": { "count": { "type": "int" } }
}
```

Ten sam klucz w `app_pl.arb` — pełny rozkład polskich form:

```json
"quickJobsOffers": "{count, plural, =0{Brak ofert} one{1 oferta} few{{count} oferty} many{{count} ofert} other{{count} ofert}}",
"@quickJobsOffers": {
  "description": "Number of offers with Polish plural forms",
  "placeholders": { "count": { "type": "int" } }
}
```

Weryfikacja formy: 1 → `oferta` (one), 2/3/4 → `oferty` (few), 5+ oraz 0 →
`ofert` (many, przy `=0` nadpisane jawnym `Brak ofert`). Drugi realny
przykład z tego samego pliku (`repliesCount`, `app_pl.arb`):

```json
"repliesCount": "{count, plural, one{{count} odpowiedź} few{{count} odpowiedzi} other{{count} odpowiedzi}}",
```

Zwykły placeholder (bez liczby mnogiej), z typowaniem i opisem — wymagany
dla każdej wartości wstawianej dynamicznie, nie tylko dla liczb:

```json
"trust_operates_since": "Działa od {year}",
"@trust_operates_since": {
  "description": "Wskaźnik lat działalności firmy",
  "placeholders": {
    "year": { "type": "int", "description": "Rok rozpoczęcia działalności" }
  }
}
```

Reguła: **każdy** klucz z placeholderem lub liczbą mnogą ma blok `@klucz` z
`description` (kontekst dla tłumacza — bez niego "Active" po polsku to
zgadywanka między "Aktywny", "Aktywna", "Aktywne") i typowanymi
`placeholders`.

### 4. Utrzymanie ARB w synchronizacji między językami

Oba pliki muszą mieć **identyczny zestaw kluczy najwyższego poziomu** —
`flutter gen-l10n` domyślnie nie waliduje tego twardo (brakujący klucz w
locale niż-domyślnym po prostu nie generuje gettera albo cicho spada na
fallback), więc rozjazd wykrywa się dopiero w runtime na ekranie w drugim
języku. Praktyczna weryfikacja przed merge:

```bash
# Policz klucze najwyższego poziomu w obu plikach (parser JSON, nie grep —
# grep liczy też linie wewnątrz bloków @meta i zawyża wynik)
python3 -c "
import json
en = set(json.load(open('lib/l10n/app_en.arb')).keys())
pl = set(json.load(open('lib/l10n/app_pl.arb')).keys())
en = {k for k in en if not k.startswith('@')}
pl = {k for k in pl if not k.startswith('@')}
print('only in EN:', en - pl)
print('only in PL:', pl - en)
"
```

Kolejność dodawania (z `rules/dart/l10n.md`): dopisz klucz do **obu** plików
w tym samym PR, dopiero potem wygeneruj (`flutter gen-l10n`) i użyj w
prezentacji. Dodanie klucza tylko do jednego pliku i "dorobienie" drugiego
później to najczęstsza przyczyna rozjazdu.

### 5. Formatowanie dat/liczb/walut przez `intl`, nie ręcznie

Ręczne sklejanie formatu daty/liczby/waluty ignoruje konwencje locale
(separator dziesiętny, kolejność dzień/miesiąc, symbol waluty przed/po
kwocie) i psuje się przy zmianie języka w runtime:

```dart
// WRONG — zakodowana konwencja (kropka jako separator, format US)
'${date.month}/${date.day}/${date.year}'
'\$${price.toStringAsFixed(2)}'

// CORRECT — intl z bieżącym locale
DateFormat.yMMMd(Localizations.localeOf(context).toString()).format(date)
NumberFormat.currency(
  locale: Localizations.localeOf(context).toString(),
  symbol: currencySymbol,
).format(price)
```

`intl` sam dobiera separator tysięcy/dziesiętny i kolejność elementów daty
zgodnie z locale — nie trzeba (i nie wolno) tego re-implementować ręcznie
per język.

## Anti-Patterns

### Stringi prezentacyjne w warstwie `domain/` — podwójne naruszenie

To nie tylko naruszenie l10n (tekst poza ARB) — to też naruszenie czystości
warstw: encja domenowa nie powinna wiedzieć, *jak* jej stan jest
prezentowany, tylko *czym* jest. Trzy realne przykłady z audytu
`juz-ide-mobile-app`:

```dart
// lib/features/user_profile/domain/entities/availability_type.dart
// WRONG — enum domenowy zwraca gotowy polski tekst
String get displayName {
  switch (this) {
    case AvailabilityType.available:
      return 'Dostępny/a';
    case AvailabilityType.canHelp:
      return 'Mogę pomóc';
    case AvailabilityType.offering:
      return 'Oferuję';
    // ...
  }
}
```

```dart
// lib/features/notifications/domain/entities/digest_frequency.dart
// WRONG — to samo dla częstotliwości powiadomień
String get displayName {
  switch (this) {
    case DigestFrequency.hourly:
      return 'Co godzinę';
    case DigestFrequency.weekly:
      return 'Co tydzień';
    // ...
  }
}
```

```dart
// lib/features/auth/domain/failures/email_add_failure.dart
// WRONG — komunikat błędu domenowego zaszyty na sztywno w konstruktorze
class InvalidEmailFormat extends Failure {
  const InvalidEmailFormat() : super('Nieprawidłowy format adresu e-mail');
}
```

**Poprawne rozwiązanie**: domena zwraca **klucz** (string identyfikator lub
sam wariant `enum`), warstwa prezentacji mapuje klucz na tekst przez
`context.l10n`:

```dart
// domain/entities/availability_type.dart — CORRECT
// Domena nie zna żadnego języka, zwraca tylko siebie (enum) — bez displayName.
enum AvailabilityType { available, canHelp, lookingForJob, offering, busy, custom }

// presentation/extensions/availability_type_l10n.dart — CORRECT
extension AvailabilityTypeL10n on AvailabilityType {
  String label(AppLocalizations l10n) => switch (this) {
    AvailabilityType.available => l10n.availabilityAvailable,
    AvailabilityType.canHelp => l10n.availabilityCanHelp,
    AvailabilityType.offering => l10n.availabilityOffering,
    // ...
  };
}

// domain/failures/email_add_failure.dart — CORRECT
// Failure niesie klucz, nie gotowy tekst — analogicznie do PasswordRequirement
// z rules/dart/l10n.md.
class InvalidEmailFormat extends Failure {
  const InvalidEmailFormat() : super(key: 'authInvalidEmailFormat');
}

// presentation — resolve przy wyświetlaniu
Text(l10n.resolveFailure(failure.key))
```

### Skala problemu — ostrzeżenie z realnego audytu

W `juz-ide-mobile-app`, mimo że `app_en.arb` ma pełne 4840 kluczy (identyczny
zestaw co `app_pl.arb`), audyt naliczył **~1400 linii w ~360 plikach**
zawierających twardo zakodowany polski tekst poza katalogiem `lib/l10n/`
(z czego **80 plików leży w warstwie `domain/`** — bezpośrednie naruszenie
zasady z sekcji 1 powyżej). Efekt: aplikacja jest **formalnie dwujęzyczna**
(komplet tłumaczeń istnieje), ale **realnie nie da się** jej przełączyć na
angielski bez regresji — przełącznik języka w ustawieniach zmieni ekrany
zbudowane poprawnie, ale zostawi setki miejsc po polsku. To klasyczny "false
sense of coverage": metryka "czy mamy tłumaczenia" (tak) mówi co innego niż
metryka, która faktycznie interesuje użytkownika ("czy apka działa po
angielsku", nie). Traktuj pokrycie ARB i pokrycie *użycia* ARB w kodzie jako
dwie osobne metryki — completness pliku ARB nie dowodzi braku hardkodowania.

### Sklejanie zdań zamiast ICU plural

```dart
// WRONG — poprawne dla "1", gramatycznie błędne dla 2 i dla 5
Text('Masz ' + count.toString() + ' wiadomości')

// CORRECT
Text(l10n.unreadMessagesCount(count)) // ICU plural w ARB, patrz sekcja 3
```

### Klucze-śmieci

```json
// WRONG — nazwa nic nie mówi o kontekście, kolejna osoba doda duplikat
"text1": "Zapisz",
"label2": "Anuluj",

// CORRECT
"formSaveButton": "Zapisz",
"formCancelButton": "Anuluj",
```
