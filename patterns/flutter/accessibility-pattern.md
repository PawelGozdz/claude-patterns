# Pattern: Accessibility (Flutter)

**Tags**: "mobile:ui:accessibility"

**Layer**: Cross-Layer
**Status**: production
**Scope**: project-specific (juz-ide-mobile-app) — single-project derivation, not yet validated
in a second codebase. Excluded from `retrieve_patterns` by default; pass
`project: "juz-ide-mobile-app"` to include it. Promote to universal once a second project adopts
this shape.


## What This Is

Sześć filarów dostępności w aplikacji Flutter, wyprowadzonych z realnego wdrożenia
w `juz-ide-mobile-app`: (1) rozmiar i odstępy celów dotykowych, (2) kontrast i
czytelność tekstu przez tokeny projektowe, (3) semantyka dla czytników ekranu —
kiedy dodawać `Semantics`, kiedy go wyciszać, (4) skalowanie tekstu do 200% bez
rozjeżdżania layoutu, (5) fokus i nawigacja klawiaturą/switch accessem, (6)
`reduced motion`.

Ten dokument **ratuje reguły strukturalne** z wcześniejszego,
projektowego `.claude/knowledge/accessibility/ACCESSIBILITY_IMPLEMENTATION.md`
(`juz-ide-mobile-app`), który zostaje usunięty, ponieważ jego przykłady kodu
odwoływały się do nieistniejącej już palety `LocalHeroColors` sprzed
rebrandingu. Same reguły — minimalny rozmiar dotyku, minimalny kontrast,
wymagana semantyka, skalowanie do 200% — pozostają w pełni aktualne i zostały
tu przeniesione bez odwołań do martwej marki, z podmienionymi przykładami na
kod, który faktycznie istnieje w repo dzisiaj (`LocalHeroDesignTokens`,
`AccessibilityTokens`, `ElderModeTokens` — inna, żywa klasa tokenów, mimo
podobnie brzmiącej nazwy).

Osobny, ale ściśle powiązany wątek: projekt ma **tryb dla seniorów** (elder
mode) celujący w starszych użytkowników (persona "Pani Janina", 55+, ok. 25%
bazy użytkowników wg wewnętrznych statystyk dostępności projektu). Elder mode
nie jest osobną funkcją kosmetyczną — to warstwa skalująca te same tokeny
dostępności (czcionka, odstępy, cel dotyku, czas animacji) o stały,
przewidywalny współczynnik. Traktuj go jako rozszerzenie tego wzorca, nie
osobny system.

## When to Use

**Use this pattern for:**
- ✅ Każdy ekran/widget z elementem interaktywnym (przycisk, checkbox, pole
  formularza, karta z `onTap`) — wymaga sprawdzenia rozmiaru dotyku i semantyki
- ✅ Każdy tekst prezentowany użytkownikowi — wymaga sprawdzenia skalowania do
  200% i kontrastu
- ✅ Ekrany z animacjami (przejścia, showcase, onboarding) — wymagają obsługi
  `MediaQuery.disableAnimations`
- ✅ Projekt z realnym udziałem starszych użytkowników lub użytkowników
  czytników ekranu w grupie docelowej — elder mode i pełna semantyka nie są
  opcjonalnym polish, tylko wymaganiem funkcjonalnym
- ✅ Code review / `/security-review`-podobny audyt przed wydaniem nowego
  ekranu — lista Anti-Patterns poniżej to gotowa checklista

**Do NOT use for:**
- ❌ Dobór konkretnych kolorów marki, konkretnych wartości hex, motion
  brandingu (np. "logo animuje się przez 400ms z krzywą X") — to należy do
  osobnego wzorca zarządzania tokenami wizualnymi (design tokens), nie do
  tego dokumentu. Tu interesuje nas tylko *strukturalna* reguła ("kontrast
  ≥ 4.5:1", nie "który dokładnie odcień zielonego").
- ❌ Testowania wydajności animacji (jank, dropped frames) — to
  `performance`/`motion` pattern, nie accessibility
- ❌ Lokalizacji tekstu (klucze ARB, liczba mnoga, tłumaczenia) — patrz
  siostrzany wzorzec [`localization-pattern.md`](./localization-pattern.md).
  Te dwa wzorce się przecinają (np. `Semantics(label:)` często bierze tekst z
  `context.l10n`), ale każdy pilnuje innego wymiaru: ten — czy treść jest
  *dostępna*, tamten — czy treść jest *przetłumaczalna*.

## Implementation

### 1. Rozmiar i odstępy celów dotykowych

**Reguła strukturalna**: minimum **44×44dp** (WCAG 2.1 AA, kryterium 2.5.5).
Realny kod w `juz-ide-mobile-app` idzie dalej i przyjmuje jako bazę
**48dp** (standard Material), z dodatkowym powiększeniem w elder mode:

```dart
// core/design/tokens/local_hero_design_tokens.dart — AccessibilityTokens
static const double recommendedTouchTarget = 48.0;   // baza, > WCAG 44dp
static const double elderTouchTarget = 56.0;          // elder mode
static const double elderCriticalTouchTarget = 64.0;  // elder mode, akcje krytyczne

// ElderModeTokens
static double getResponsiveTouchTarget({required bool elderMode, bool critical = false}) {
  if (elderMode) {
    return critical
        ? AccessibilityTokens.elderCriticalTouchTarget   // 64.0
        : AccessibilityTokens.elderTouchTarget;          // 56.0
  }
  return AccessibilityTokens.recommendedTouchTarget;     // 48.0
}
```

Konsekwencja praktyczna: gdy wizualna ikona ma być mniejsza niż cel dotyku
(np. ikona 24×24 w liście), **obszar dotyku** i **obszar wizualny** to dwie
różne wartości — powiększ obszar klikalny paddingiem/`Container`, nie samą
ikonę:

```dart
// GOOD — wizualnie 24x24, dotykowo min. 48x48
IconButton(
  iconSize: 24,
  padding: const EdgeInsets.all(12), // 24 + 2*12 = 48
  onPressed: _onFavoritePressed,
  icon: const Icon(Icons.favorite_border),
)
```

### 2. Kontrast i czytelność — przez tokeny, nie przez hex

**Reguła strukturalna**: kontrast tekst/tło ≥ **4.5:1** dla tekstu
zwykłego, ≥ 3:1 dla tekstu dużego (WCAG AA). Minimalny rozmiar czcionki:
**16px dla tekstu głównego**, **14px dla elementów interaktywnych**
(etykiety przycisków, linki). Interlinia 1.4–1.5 dla czytelności.

Egzekwuj to **na poziomie tokenów**, nie przez ręcznie dobierane hexy w
widgetach — para (tekst, tło) w design-tokenach ma z definicji zweryfikowany
kontrast, więc konsument tokenu nie może przypadkiem złamać reguły:

```dart
// GOOD — token niesie już zweryfikowaną parę (tekst, tło)
Container(
  color: LocalHeroDesignTokens.surface,
  child: Text('Zapisz', style: TextStyle(color: LocalHeroDesignTokens.textPrimary)),
)

// BAD — hardkodowany hex bez gwarancji kontrastu z tłem, którego autor
// widgetu może nawet nie znać (dziedziczone z rodzica)
Text('Zapisz', style: TextStyle(color: Color(0xFF9E9E9E)))
```

Rozmiary czcionek również jako tokeny, nie literały:

```dart
// LocalHeroDesignTokens — zakres fontSizeBadge … fontSizeDisplayXL
// ElderModeTokens — te same nazwy, +40%: elderFontSizeSmall … elderFontSizeDisplayXL
static double getResponsiveFontSize(double baseFontSize, {required bool elderMode}) {
  return elderMode ? baseFontSize * 1.4 : baseFontSize;
}
```

### 3. Semantyka dla czytników ekranu

Zasada wyjściowa: **natywne widgety Material (`ElevatedButton`, `TextButton`,
`Checkbox`, `Switch`, `TextFormField`) już niosą poprawną semantykę same z
siebie** — nie owijaj ich w dodatkowy `Semantics()`, chyba że musisz nadpisać
etykietę (np. bo widoczny tekst to sam skrót/ikona, a czytnik potrzebuje
pełnego zdania). `Semantics()` jest obowiązkowy tam, gdzie **budujesz
interaktywność ręcznie** (`GestureDetector`, `InkWell` na custom widgecie) —
bez niego czytnik ekranu nie wie, że element jest w ogóle interaktywny.

Realne przykłady z `lib/`:

```dart
// core/accessibility/accessibility_helper.dart:109-113 — pole formularza
return Semantics(
  label: semanticLabel ?? polishLabel,
  hint: polishHint,
  textField: true,
  child: TextFormField(...),
)

// core/ui/components/elderly_friendly_button.dart:67-70 — custom przycisk
return Semantics(
  button: true,
  enabled: !isDisabled,
  label: label,
  child: Material(...),
)

// features/auth/presentation/widgets/code_digit_field.dart:168-171
// pole cyfry kodu OTP — etykieta budowana z ICU (pozycja/łączna liczba pól)
return Semantics(
  textField: true,
  label: l10n.otpDigitLabel(index + 1, 6),
  excludeSemantics: true,
  ...
)
```

**Kiedy `ExcludeSemantics`**: gdy zewnętrzny `Semantics` już niesie złożoną,
skomponowaną etykietę (np. "Krok 2: Wprowadź numer telefonu"), a wewnętrzne
dzieci (ikona kroku + tekst) same z siebie też generowałyby węzły semantyki —
czytnik ogłosiłby treść **dwa razy**. `ExcludeSemantics` ucina drzewo
semantyki poniżej tego punktu:

```dart
// features/user_profile/presentation/screens/edit_phone_intro_screen.dart:119-124
return Semantics(
  label: l10n.editPhoneStepSemanticLabel(number, text),
  child: ExcludeSemantics(
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [ /* ikona kroku + Text(text) — nie ogłaszane osobno */ ],
    ),
  ),
)

// core/design/components/brutalist_section_header.dart:193-199
Expanded(
  child: ExcludeSemantics(
    // Nagłówek już ogłoszony przez Semantics(header) na zewnętrznym
    // wrapperze — ukryj wewnętrzny Text przed drzewem a11y, żeby
    // uniknąć podwójnego odczytu.
    child: Text(title),
  ),
)
```

Wzorzec jest na tyle powtarzalny, że w projekcie istnieje reużywalny wrapper
(`core/widgets/accessibility_wrappers.dart` — `LocalizedSemantics`) z flagą
`excludeSemantics` zamiast ręcznego zagnieżdżania w każdym miejscu użycia.

**`MergeSemantics`** (dostępny w Flutter, w tym repo jeszcze nie wykorzystany)
— scala kilka węzłów semantyki potomnych w jeden ogłaszany komunikat.
Właściwe miejsce użycia: rząd ikona+tekst, gdzie oba dziecka domyślnie
generowałyby osobne, kolejne ogłoszenia zamiast jednego spójnego zdania:

```dart
// Ilustracja API frameworku — użyj, gdy Row(ikona, tekst) ma być
// odczytany jako jedna fraza, a żadne z dzieci nie ma własnej,
// niezależnej roli semantycznej.
MergeSemantics(
  child: Row(
    children: [Icon(Icons.check_circle, semanticLabel: ''), Text('Zweryfikowano')],
  ),
)
```

### 4. Skalowanie tekstu do 200%

Cel: aplikacja pozostaje użyteczna, gdy użytkownik ustawi w systemie
skalowanie tekstu do 200% (`MediaQuery.textScaler`). Bieżący, niedeprecated
Flutter API:

```dart
// core/accessibility/accessibility_helper.dart:319-332
// textScaler.scale(1.0) odtwarza wartość dawnego textScaleFactor
final isLargeText = mediaQuery.textScaler.scale(1.0) > 1.3;

// Skalowanie rozmiaru czcionki zgodnie z bieżącym ustawieniem systemowym —
// zachowanie identyczne z formułą `baseSize * textScaleFactor`, ale przez
// API zgodne z aktualną wersją Fluttera (textScaleFactor jest deprecated)
final scaledSize = mediaQuery.textScaler.scale(baseSize);
```

Ważna pułapka specyficzna dla tego projektu: **elder mode dokłada własny,
niezależny mnożnik** (`getResponsiveFontSize` ×1.4) *ponad* systemowe
skalowanie tekstu — te dwa mechanizmy się nie wykluczają, mogą się złożyć.
Jeśli komponuje się oba (użytkownik ma elder mode WŁĄCZONY i system
ustawiony na 200%), efektywne skalowanie może przekroczyć 2.5–3×. Layout,
który zakłada sztywne wysokości, pęka najpierw właśnie w tej kombinacji —
testuj oba tryby naraz, nie osobno.

Reguły layoutu, żeby przetrwać 200%:
- Kontenery tekstu: `Wrap`/`Flexible`/`Expanded` zamiast sztywnej `height`
- `Text` bez `maxLines`/`overflow: TextOverflow.ellipsis` tam, gdzie ucięcie
  informacji jest niedopuszczalne (np. komunikat błędu) — pozwól się
  rozwinąć w pionie
- Rzędy z ikoną + tekstem: `CrossAxisAlignment.start`, nie `.center` — przy
  dużej czcionce tekst zawija się do wielu linii i wyrównanie do środka
  psuje układ z ikoną

### 5. Fokus i nawigacja klawiaturą/switch accessem

Jawny łańcuch fokusu dla formularzy wieloetapowych — kolejność `Tab` musi
odpowiadać kolejności wizualnej, nie kolejności deklaracji w drzewie
widgetów (które bywają różne przy złożonym layoucie):

```dart
final List<FocusNode> _focusNodes = List.generate(fieldCount, (_) => FocusNode());

TextFormField(
  focusNode: _focusNodes[0],
  onFieldSubmitted: (_) => _focusNodes[1].requestFocus(),
)
```

Dla list/siatek z wieloma elementami tego samego typu (feed, lista wyników)
użyj `FocusTraversalGroup` + `OrderedTraversalPolicy`, żeby switch access i
klawiatura zewnętrzna poruszały się w logicznej kolejności czytania, a nie w
kolejności dodania do drzewa. Cel wydajnościowy z audytu dostępności:
**maks. 5 przystanków Tab między powiązanymi elementami** — jeśli formularz
wymaga więcej, to sygnał, że grupowanie wizualne nie odpowiada grupowaniu
semantycznemu.

### 6. Reduced motion

`MediaQuery.disableAnimations` odzwierciedla systemowe ustawienie
"ogranicz ruch" (iOS: Reduce Motion, Android: Remove animations). W tym
repo to jeden z trzech trybów ruchu, obok trybu domyślnego i elder mode —
i **reduced motion wygrywa** nad elder mode, gdy oba byłyby aktywne:

```dart
// core/motion/motion_spec.dart:12-24
enum MotionProfile {
  /// Domyślny — wszystkie animacje odgrywają pełną choreografię.
  full,

  /// Aktywny elder mode — czas trwania skalowany ×1.25 przez
  /// [ElderModeTokens.getResponsiveAnimationDuration]. Krzywe bez zmian.
  elder,

  /// `MediaQuery.disableAnimations == true` — wygrywa nad elder mode.
  /// Prymitywy renderują stan końcowy od razu, nie skróconą animację.
  reduced,
}

// core/motion/motion_scope.dart:17,28
final reducedMotion = MediaQuery.of(context).disableAnimations;
```

Konsekwencja implementacyjna: `reduced` to nie "animacja szybsza", tylko
**brak animacji** — element od razu w stanie końcowym. Skracanie czasu
trwania (np. z 400ms do 50ms) nie spełnia tego wymogu; użytkownik z
migreną/zaburzeniami przedsionkowymi wciąż widzi ruch, tylko krótszy.

## Anti-Patterns

```dart
// BAD — GestureDetector na ikonie 24x24 bez powiększenia obszaru dotyku;
// wizualny i dotykowy rozmiar to ta sama wartość, poniżej progu 44dp
GestureDetector(
  onTap: _onDelete,
  child: Icon(Icons.delete, size: 24),
)

// GOOD
GestureDetector(
  onTap: _onDelete,
  child: Padding(
    padding: const EdgeInsets.all(10), // 24 + 2*10 = 44
    child: Icon(Icons.delete, size: 24),
  ),
)
```

```dart
// BAD — Semantics z etykietą duplikującą widoczny tekst dziecka;
// czytnik ekranu odczyta "Zapisz. Zapisz." (widoczny Text + label)
Semantics(
  label: 'Zapisz',
  child: TextButton(onPressed: _onSave, child: Text('Zapisz')),
)

// GOOD — albo bez dodatkowego Semantics (natywny przycisk już ma
// poprawną semantykę z widocznego tekstu), albo etykieta niesie
// informację, której widoczny tekst NIE niesie
Semantics(
  label: _isSaving ? 'Zapisywanie w toku' : 'Zapisz zmiany',
  child: TextButton(onPressed: _onSave, child: Text('Zapisz')),
)
```

```dart
// BAD — tekst w Container o stałej wysokości; przy skalowaniu 200%
// treść jest ucinana/przycinana, bez możliwości przewinięcia czy zawinięcia
Container(
  height: 20,
  child: Text(errorMessage),
)

// GOOD — kontener rośnie z treścią
Text(errorMessage) // brak maxLines/sztywnej wysokości nadrzędnego kontenera
```

```dart
// BAD — kolor jako JEDYNY nośnik informacji o statusie; użytkownik
// z daltonizmem (ok. 8% mężczyzn) nie odróżni "opłacone" od "zaległe"
Container(color: isOverdue ? Colors.red : Colors.green, width: 12, height: 12)

// GOOD — kolor + kształt/ikona/tekst niosą tę samą informację niezależnie
Row(children: [
  Icon(isOverdue ? Icons.error : Icons.check_circle,
       color: isOverdue ? LocalHeroDesignTokens.error : LocalHeroDesignTokens.success),
  Text(isOverdue ? l10n.statusOverdue : l10n.statusPaid),
])
```

```dart
// BAD — dekoracyjna ikona bez ExcludeSemantics; czytnik ogłasza
// "gwiazda, gwiazda, gwiazda" obok już-odczytanej wartości oceny
Row(children: [
  Icon(Icons.star), Icon(Icons.star), Icon(Icons.star),
  Text('3.0'),
])

// GOOD — ikony czysto dekoracyjne (informacja już jest w tekście)
// wyłączone z drzewa semantyki
Row(children: [
  ExcludeSemantics(
    child: Row(children: [Icon(Icons.star), Icon(Icons.star), Icon(Icons.star)]),
  ),
  Text('3.0'), // jedyny nośnik informacji dla czytnika
])
```
