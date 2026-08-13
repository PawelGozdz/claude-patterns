# Design Token Pattern

**Tags**: "mobile:ui:design-token"

**Layer**: Cross-Layer
**Status**: production

## What This Is

Wzorzec na centralizację wszystkich wartości wizualnych aplikacji — kolorów,
typografii, odstępów, cieni, ikon — w nazwanych stałych zamiast literałów
rozsianych po widgetach. Token nie jest „ładniejszą nazwą dla liczby” — jest
jedynym miejscem, w którym decyzja projektowa („ten odcień cienia”, „ta
wielkość fontu nagłówka”) jest zapisana raz i konsumowana wszędzie. Zmiana
marki, audyt WCAG, migracja na dark mode — wszystko to dotyka jednego pliku
tokenów, nie setek widgetów.

Wzorzec obejmuje trzy warstwy:

1. **Prymitywy** — surowe wartości (`Color(0xFFFAF7F2)`, `28.0`) nazwane
   semantycznie w jednym pliku źródłowym.
2. **Semantyczne / komponentowe tokeny** — funkcje i gettery derywujące
   gotowe do użycia style (`TextTheme`, `BoxShadow`, `Border`) z prymitywów,
   często z uwzględnieniem kontekstu (theme brightness, elder mode).
3. **Integracja z `ThemeData`** — punkt, w którym tokeny stają się tym, co
   Material faktycznie renderuje, więc widget nie musi w ogóle znać tokenów
   z osobna.

Źródło przykładów: `juz_ide_mobile_app` (`lib/core/design/tokens/`,
`lib/core/design/themes/`, `lib/core/theme/`) i `BRAND.md` — realny, wdrożony
kod i realny dokument marki, nie pseudokod.

## When to Use

**Use this pattern for:**
- ✅ Każdy projekt Flutter z więcej niż kilkoma ekranami, gdzie kolor/spacing/
  typografia mają się powtarzać w wielu miejscach — token płaci się zwrotem
  już przy drugim ekranie, który go używa.
- ✅ Aplikacje z wymaganiami WCAG/accessibility — kontrast koloru na tle
  weryfikuje się raz, przy definicji tokena, nie przy każdym użyciu.
- ✅ Projekty z realnym dark mode albo trybem alternatywnym (np. „elder mode”
  ze skalowaniem +40%) — token jest jedynym miejscem, gdzie taka logika może
  żyć bez duplikacji po widgetach.
- ✅ Zespoły, w których design i kod ewoluują niezależnie (BRAND.md, redesign
  cieni, zmiana palety) — token jest kontraktem między dokumentem marki a
  kodem; zmiana w jednym miejscu propaguje się wszędzie.

**Do NOT use for:**
- ❌ Jednorazowa ilustracja albo wygenerowany asset, gdzie kolor jest częścią
  grafiki (PNG, SVG z zaszytą paletą), nie częścią interfejsu — tokenizowanie
  koloru wewnątrz obrazka nic nie daje, bo i tak nie da się go zmienić bez
  wymiany pliku.
- ❌ Prototyp jednorazowy / spike techniczny, który zostanie wyrzucony przed
  wejściem do produkcji — narzut na zdefiniowanie warstwy tokenów nie zwróci
  się, jeśli kod nie przeżyje tygodnia.

## Implementation

### 1. Tokeny jako jedyne źródło prawdy (prymitywy)

Wszystkie kolory, odstępy i promienie zaokrągleń — nazwane stałe w jednym
pliku, z komentarzem uzasadniającym wybór (kontrast WCAG, rola w hierarchii),
nie gołe wartości hex porozrzucane po ekranach.

```dart
// lib/core/design/tokens/local_hero_design_tokens.dart
class LocalHeroDesignTokens {
  // ── Core neutrals (paper foundation) ──────────────────────────────────
  /// Default screen background. Warm, paper-feel cream. WCAG: 12.93 with coffee text (AAA).
  static const Color v1Cream = Color(0xFFFAF7F2);

  /// Elevated surface (cards on cream, hover state). WCAG: 11.28 with coffee text (AAA).
  static const Color v1Latte = Color(0xFFF5E6D3);

  /// Primary text + borders. Warm-black, NOT pure black — softens brutalist DNA.
  static const Color v1Coffee = Color(0xFF3E2723);

  /// Heading emphasis, deeper than coffee.
  static const Color v1Espresso = Color(0xFF1C1410);

  // ── Category accents (DECORATIVE ONLY — strip / chip bg / icon / avatar tint) ──
  /// Local Shares accent. Strip 4-6px, filter chip selected bg, gift icon stroke.
  static const Color v1AccentLocalShares = Color(0xFFC77B5C);

  // ── Spacing tokens ──────────────────────────────────────────────────
  static const double space4 = 4.0;
  static const double space8 = 8.0;
  static const double space16 = 16.0;
  static const double space24 = 24.0;
}
```

Wartości zgadzają się co do hexu z `BRAND.md` (`Cream #FAF7F2`, `Coffee
#3E2723`, akcent `Terracotta #C77B5C`) — dokument marki i kod są tym samym
kontraktem, tylko w dwóch formatach. Zero `Color(0xFF...)` w widgecie — jeśli
trzeba wpisać hex, to znaczy, że tokena brakuje i najpierw dodaje się go tutaj.

### 2. Warstwy: prymitywy → semantyczne → komponentowe

Prymityw (`v1Coffee`) sam w sobie nic nie mówi o tym, gdzie ma być użyty.
Warstwa semantyczna/komponentowa buduje na nim gotowe do użycia efekty —
cień, border, skalowanie pod elder mode — tak, żeby widget wołał jedną
funkcję zamiast składać `BoxShadow` ręcznie za każdym razem.

```dart
// lib/core/design/tokens/local_hero_design_tokens.dart
class LocalHeroDesignTokens {
  /// Generate BoxShadow for the softened card style (post 2026-07-06 BRAND.md
  /// "Miękki kierunek wizualny"): a subtle, blurred shadow replacing the flat
  /// brutalist offset(x,y)/blurRadius:0 shadow.
  static List<BoxShadow> getSoftShadow({
    double blurRadius = 8,
    Offset offset = const Offset(0, 2),
    Color? color,
  }) {
    return [
      BoxShadow(
        color: (color ?? v1Coffee).withValues(alpha: 0.08),
        blurRadius: blurRadius,
        offset: offset,
      ),
    ];
  }

  /// Generate Border for the softened card style — thin, low-alpha border
  /// replacing the thick flat-brutalist border.
  static Border getSoftBorder({double width = 1.0, Color? color}) {
    return Border.all(
      color: (color ?? v1Coffee).withValues(alpha: 0.16),
      width: width,
    );
  }
}

// lib/core/design/tokens/app_typography.dart — semantyczna warstwa typografii
class AppTypography {
  AppTypography._();

  /// 20 sp / 700 / h 1.35 / ls 0
  static TextStyle get titleL => GoogleFonts.inter(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        height: 1.35,
        letterSpacing: 0,
      );

  /// Elder-mode aware scaling — semantyczna warstwa decyduje SAMA,
  /// widget nie robi ternary na fontSize.
  static TextStyle scale(TextStyle base, {required bool elderMode}) {
    if (!elderMode) return base;
    return base.copyWith(
      fontSize: (base.fontSize ?? 14) * 1.4,
      height: (base.height ?? 1.4) + 0.05,
    );
  }
}
```

Widget korzysta wyłącznie z warstwy semantycznej/komponentowej, nigdy nie
schodzi do prymitywu bezpośrednio dla efektu złożonego:

```dart
// ✅ CORRECT
decoration: BoxDecoration(
  color: LocalHeroDesignTokens.v1Cream,
  borderRadius: BorderRadius.circular(8),
  border: LocalHeroDesignTokens.getSoftBorder(),
  boxShadow: LocalHeroDesignTokens.getSoftShadow(),
),
style: AppTypography.scale(AppTypography.bodyM, elderMode: elderMode),
```

### 3. Integracja z `ThemeData` i dark mode

Docelowo widget w ogóle nie powinien wiedzieć o tokenach — powinien renderować
`Theme.of(context)` i dostawać gotowy `TextTheme`/`ColorScheme`, który
`ThemeData` zbudował z tokenów raz, przy starcie aplikacji.

```dart
// lib/core/design/themes/local_hero_light_theme.dart
class LocalHeroLightTheme {
  static ThemeData get theme => ThemeData(
        brightness: Brightness.light,
        useMaterial3: true,

        colorScheme: const ColorScheme.light(
          primary: LocalHeroDesignTokens.primary,
          primaryContainer: LocalHeroDesignTokens.primaryLight,
          surface: LocalHeroDesignTokens.surfaceLight,
          onSurface: LocalHeroDesignTokens.onSurfaceLight,
          error: LocalHeroDesignTokens.error,
          outline: LocalHeroDesignTokens.onSurfaceSecondaryLight,
        ),

        // fontFamily intentionally omitted — google_fonts injects per-style
        // via AppTypography getters (Poppins for display, Inter for all else).
        textTheme: TextTheme(
          displayLarge:  AppTypography.displayXL,
          displayMedium: AppTypography.displayL,
          headlineLarge: AppTypography.displayM,
          titleLarge:    AppTypography.titleL,
          titleMedium:   AppTypography.titleM,
          // ...
        ),
      );
}
```

Dark mode idzie tym samym mechanizmem: osobny `LocalHeroDarkTheme.theme`
budowany z tych samych semantycznych helperów (`getSoftShadow`,
`getSoftBorder`) i osobnego zestawu prymitywów dla ciemnego tła — widget,
który renderuje `Theme.of(context).colorScheme.surface`, dostaje właściwy
kolor automatycznie, bez `if (brightness == dark)` w kodzie ekranu. Tam,
gdzie theme nie pokrywa efektu (np. cień karty poza `CardTheme`), token
sam wystawia helper przyjmujący `Brightness`:

```dart
static Color getSurfaceColor(Brightness brightness) =>
    brightness == Brightness.dark ? surface : surfaceLight;
```

### 4. Wycofywanie tokena

Token nie znika po prostu, gdy zostaje zastąpiony — dostaje `@Deprecated` z
**konkretną instrukcją migracji**, nie samym „nie używaj tego”:

```dart
/// @Deprecated: hard-brutalist offsets, unused anywhere in the app. Use
/// [getSoftShadow] instead (BRAND.md "Miękki kierunek wizualny", 2026-07-06).
@Deprecated('Use getSoftShadow() instead — hard-brutalist offset, no callers left')
static const Offset shadowMedium = Offset(4, 4);

@Deprecated('Use AppTypography.* instead — see .claude/rules/dart/design-system.md')
static const double fontSizeMedium = 14.0;
```

Dobra adnotacja `@Deprecated` odpowiada na dwa pytania: **czym zastąpić** (nazwa
konkretnej funkcji/klasy, nie „nowym systemem”) i **gdzie doczytać kontekst**
(link do reguły albo sekcji BRAND.md). Sama nazwa zastępnika bez ścieżki
migracji zostawia czytelnikowi zgadywankę „a gdzie to jest zdefiniowane” —
i to jest dokładnie luka opisana w sekcji Anti-Patterns niżej.

### 5. Ikony jako token

`Icons.*` z Material to setki opcji bez kontroli nad tym, która wersja
(`_outlined`, `_rounded`, `_border`) trafia do kodu — dwóch deweloperów
wybierze dwa różne warianty tej samej ikony. `AppIcons.*` zawęża wybór do
jednego, zatwierdzonego zestawu i utrzymuje kategorie ikon jako stałe
zgodne z dokumentem marki:

```dart
// lib/core/design/tokens/app_icons.dart
class AppIcons {
  AppIcons._();

  // CATEGORY ICONS — fixed per BRAND.md 2026-05-20, do not change without
  // a BRAND.md decision.
  static const localShares   = Symbols.redeem;
  static const quickJobs     = Symbols.handyman;
  static const offerings     = Symbols.home_repair_service;
  static const events        = Symbols.event;

  // ACTIONS
  static const back   = Symbols.arrow_back;
  static const search = Symbols.search;
}
```

```dart
// ❌ WRONG — dwóch deweloperów, dwa różne warianty tej samej ikony
Icon(Icons.event)
Icon(Icons.event_outlined)

// ✅ CORRECT — jeden token, jedna decyzja
Icon(AppIcons.events)
```

Komponenty kategorii (np. karta usługi) derywują ikonę **wewnętrznie** z
enuma kategorii zamiast przyjmować `IconData` jako parametr z zewnątrz — to
uniemożliwia przypadkowe podstawienie złej ikony przy wywołaniu:

```dart
// ✅ CORRECT — ikona wynika z accent, nie jest osobnym parametrem
V1EntityHubTile(accent: V1CategoryAccent.events)
```

## Anti-Patterns

### Trzy równoległe systemy typografii

Realny audyt `juz_ide_mobile_app` znalazł nie dwa, a **trzy** niezależne
źródła stylów tekstu w tym samym repozytorium:

1. **`AppTypography`** (`core/design/tokens/app_typography.dart`) — kanoniczny
   system DS-007: Poppins dla display, Inter dla reszty, faktycznie wpięty w
   `ThemeData` (`textTheme: TextTheme(displayLarge: AppTypography.displayXL, ...)`).
   349 plików w repo już go używa.
2. **`AppTextStyles`** (`core/theme/app_text_styles.dart`) — starszy,
   równoległy system oparty o skalę Material 3, font `'Inter'` wszędzie
   (łącznie z display), z własnym `lightTextTheme`/`darkTextTheme`, które
   **nie są nigdzie podpięte** do faktycznego `ThemeData` aplikacji — mimo to
   wciąż aktywnie używany w 10 plikach (`edit_profile_screen.dart`,
   `about_screen.dart`, `settings_section.dart`, `error_widget.dart` i inne),
   bo nikt go formalnie nie wycofał.
3. **`brutalist_components.dart`** (ten sam katalog `core/theme/` co
   `AppTextStyles`) — nie sięga po żaden z powyższych systemów, tylko
   hardkoduje `TextStyle(..., fontFamily: 'Poppins')` bezpośrednio w
   widgecie:

```dart
// lib/core/theme/brutalist_components.dart — BrutalistButton
child: Text(
  label,
  style: TextStyle(
    color: textColor,
    fontSize: 17,
    fontWeight: FontWeight.w700,
    fontFamily: 'Poppins', // ❌ hardkodowany, niezależny od obu systemów tokenów
  ),
),
```

Efekt: przycisk z `BrutalistButton` renderuje się w Poppins, tekst obok niego
zbudowany przez `AppTextStyles.bodyMedium` renderuje się w Inter, a nagłówek
karty zbudowany przez `AppTypography.titleL` też w Inter, ale z innym line
height i letter spacing niż `AppTextStyles`. Żaden z tych trzech plików nie
łamie reguł we własnym zakresie — `flutter analyze` jest czysty, review
pojedynczego PR-a wygląda poprawnie. Dryf jest widoczny dopiero przy
zestawieniu wszystkich trzech obok siebie na jednym ekranie, czego żaden
lokalny code review nie robi.

**Reguła**: jeden kanoniczny system typografii na aplikację. Gdy pojawia się
drugi (bo ktoś dodał go „tymczasowo” albo „tylko dla tego ekranu”), zapisz
to jako dług od razu — z datą i planem migracji — zamiast zostawiać dwa
źródła prawdy bez żadnego znacznika, który jest aktualny.

### `@Deprecated` bez ścieżki do miejsca docelowego

`LocalHeroDesignTokens.fontSizeMedium` niesie adnotację `@Deprecated('Use
AppTypography.* instead — see .claude/rules/dart/design-system.md')`. To
wskazanie jest częściowo pomocne — AppTypography faktycznie istnieje i jest
kanonicznym systemem — ale wskazuje na plik reguł, nie na plik źródłowy z
implementacją, i **nic w `core/theme/`** (gdzie leżą oba pozostałe, wciąż
aktywnie używane systemy z anti-patternu powyżej) nie niesie analogicznej
adnotacji kierującej w stronę `AppTypography`. Deweloper pracujący w
`AppTextStyles` albo `brutalist_components.dart` nie ma żadnego sygnału w
samym kodzie, że w innym katalogu (`core/design/tokens/`) istnieje już
kanoniczny zamiennik — musi o tym wiedzieć z osobnego źródła (dokumentacji,
code review, ustnej wiedzy zespołu).

**Reguła**: `@Deprecated` musi wskazywać **plik i symbol**, nie tylko regułę
opisową, i musi być umieszczony na **wszystkich** konkurencyjnych
implementacjach, nie tylko na tej, którą ktoś akurat wycofywał. Martwa
albo niepełna ścieżka migracji jest gorsza niż jej brak — sugeruje, że
problem jest rozwiązany, podczas gdy tak naprawdę tylko jeden z trzech
systemów o nim wie.

### Literał koloru w widgecie „tylko na chwilę”

```dart
// ❌ WRONG — "tymczasowo", zostaje na miesiące
Container(
  color: const Color(0xFFFAF7F2), // to jest v1Cream, ale nikt tego nie wie z samego kodu
  child: Text('Witaj', style: TextStyle(color: Color(0xFF3E2723))),
)
```

Literał przechodzi review, bo wygląda identycznie jak token na ekranie. Różnica
wychodzi na jaw dopiero przy zmianie palety — token zaktualizuje się wszędzie,
literał zostanie stary i utworzy niewidoczną niespójność w losowym miejscu
aplikacji, miesiące po tym, jak ktokolwiek pamięta, że tam jest.

### Twardy cień łamiący regułę marki

```dart
// ❌ WRONG — dokładnie ten wzorzec BRAND.md nazywa "przestarzały od 2026-07-06"
boxShadow: [
  BoxShadow(
    color: LocalHeroDesignTokens.v1Coffee,
    offset: const Offset(4, 4),
    blurRadius: 0,
  ),
],
```

`BRAND.md` jest jednoznaczny: miękki, rozmyty cień (`blurRadius` 6-10, alpha
~0.08-0.12) zastąpił ostry `offset(x,y) blurRadius: 0`. Ręcznie złożony
`BoxShadow` z zerowym blur i pełną nieprzezroczystością koloru to dokładnie
regresja do stylu, który został świadomie odrzucony — i to niezależnie od
tego, czy autor widgetu w ogóle wiedział o tej decyzji, bo nic w typach nie
wymusza użycia `getSoftShadow()` zamiast ręcznego `BoxShadow`.

### Hardkodowany `fontSize` obok tokena w tym samym widgecie

```dart
// ❌ WRONG — token I hardkodowana wartość w jednym drzewie widgetów
Column(
  children: [
    Text('Tytuł', style: AppTypography.titleL),
    Text('Podtytuł', style: TextStyle(fontSize: 14, color: Colors.grey)), // ❌
  ],
)
```

Najbardziej podstępny wariant dryfu — połowa widgetu jest poprawnie
stokenizowana, więc code review „widzi” użycie `AppTypography` i przepuszcza
całość, nie zauważając drugiej linijki, która obok tokena wpisuje surową
wartość. Reguła DS-007 (`rules/dart/design-system.md`) zakazuje `TextStyle`
z jawnym `fontSize` bez wyjątku — nie „w większości przypadków”, tylko
zawsze, właśnie po to, żeby wyeliminować tę klasę błędu.
