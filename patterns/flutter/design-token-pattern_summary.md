# Design Tokens — Rule Card
<!-- Egzekwowalne streszczenie design-token-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (kontekst, uzasadnienie, kod): design-token-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Cross-Layer · **Applies to**: `**/*.dart` w `lib/**` poza `**/design/tokens/**`
(pliki definiujące tokeny są zwolnione z DT1-DT3 dla samych siebie, ale muszą stosować DT5)

## MUST

- **DT1** — Kolor w widgecie/prezentacji przez nazwany token (`AppColors.*`, `*DesignTokens.*`
  lub odpowiednik), nigdy `Color(0xFF...)` bezpośrednio.
- **DT2** — Tekst przez kanoniczny system typografii projektu (np. `AppTypography.*`), nigdy
  `TextStyle(fontSize: ...)` z jawną wartością liczbową.
- **DT3** — Odstępy/paddingi/promienie przez token spacingu (`space*`, `radius*` lub odpowiednik),
  nie magiczne literały (`EdgeInsets.all(16.0)`, `BorderRadius.circular(8.0)`).
- **DT4** — Ikony przez katalogowy token (`AppIcons.*`/`Symbols.*` lub odpowiednik projektu),
  nigdy bezpośrednio `Icons.*` z `package:flutter/material.dart`.
- **DT5** — `@Deprecated` na tokenie wskazuje **plik i symbol** zastępnika (nie tylko regułę
  opisową) i jest umieszczony na WSZYSTKICH konkurencyjnych/legacy implementacjach tego samego
  efektu — nie tylko na tej, którą akurat ktoś wycofuje.
- **DT6** — W projekcie istnieje dokładnie JEDEN kanoniczny system typografii wpięty w
  `ThemeData`/`textTheme`. Drugi, równoległy system (nawet jeśli nadal używany w części plików)
  ma zapisany dług z datą i planem migracji — nie żyje bez adnotacji obok kanonicznego.
- **DT7** — Efekty złożone (cień, border, pressed-state) przez semantyczny helper tokenów
  (`getSoftShadow()`, `getSoftBorder()` lub odpowiednik), nie ręcznie złożony `BoxShadow`/`Border`
  z surowych wartości w widgecie.

## MUST NOT

- **N1** — ❌ `Color(0xFF...)` / `Colors.*` z konkretnym odcieniem w kodzie widgetu/ekranu poza
  plikiem definiującym tokeny.
- **N2** — ❌ `TextStyle(fontSize: X)` z liczbą zamiast tokena typografii — także gdy sąsiaduje w
  tym samym widgecie z poprawnym użyciem tokena (częsty przypadek: jedna linijka stokenizowana,
  druga obok — z hardkodowanym fontSize — przechodzi review niezauważona).
- **N3** — ❌ `Icon(Icons.X)` zamiast tokena katalogowego.
- **N4** — ❌ Ręcznie złożony `BoxShadow` z `blurRadius: 0` i pełną nieprzezroczystością koloru
  (twardy, „brutalistyczny” cień) w projekcie, którego reguła marki nakazuje miękki/rozmyty cień.
- **N5** — ❌ Dwa niezależne pliki eksportujące ten sam typ tokena (np. dwie klasy z metodami
  `bodyMedium`/`titleLarge` dla stylu tekstu) bez jednoznacznego oznaczenia, który jest aktualny.
- **N6** — ❌ `@Deprecated('Use X instead')` bez ścieżki do pliku/lokalizacji X — sama nazwa
  zastępnika nie wystarcza, gdy zastępnik żyje w innym katalogu niż plik z adnotacją.
- **N7** — ❌ Komponent kategorii/wariantu przyjmujący `IconData`/`Color` jako parametr z
  zewnątrz, gdy wartość powinna być derywowana wewnętrznie z enuma/tokena (ryzyko podstawienia
  złej wartości przy wywołaniu).

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| `Color(0xFF...)` w pliku spoza `design/tokens/` | DT1 / N1 |
| `TextStyle(fontSize: 14)` obok `style: AppTypography.*` w tym samym widgecie | DT2 / N2 |
| `EdgeInsets.all(16.0)` zamiast `EdgeInsets.all(Tokens.space16)` | DT3 |
| `Icon(Icons.event)` / `Icon(Icons.event_outlined)` | DT4 / N3 |
| `BoxShadow(offset: Offset(4,4), blurRadius: 0)` ręcznie w widgecie | DT7 / N4 |
| Dwie klasy (`AppTypography`, `AppTextStyles` lub analogiczne) z pokrywającym się API stylu tekstu | DT6 / N5 |
| `@Deprecated('Use X instead')` bez importu/ścieżki do X | DT5 / N6 |
| Konkurencyjny legacy-system typografii bez adnotacji `@Deprecated` mimo istnienia kanonicznego zamiennika | DT5 |
| `V1SomeTile(icon: Icons.foo, accent: ...)` — ikona jako osobny parametr zamiast derywowana z `accent` | N7 |

**Pełny wzorzec**: [`design-token-pattern.md`](./design-token-pattern.md)
