---
name: add-pattern
description: "Dodaj nowy wzorzec do claude-patterns — szkielet, walidacja tagów, karta reguł, lint i reseed w jednym przebiegu"
origin: claude-patterns
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
effort: medium
---

# add-pattern — nowy wzorzec bez wypadania z procedury

## Kiedy

Gdy refaktor w projekcie zakończył się czymś, co warto uwspólnić, albo gdy `/analyze`
wykrył lukę w pokryciu. NIE do drobnych poprawek istniejącego wzorca — tam po prostu
edytuj plik i zrób reseed.

## Dlaczego to jest skill, a nie „napisz plik ręcznie"

Procedura z `CLAUDE.md` ma siedem kroków i łatwo z niej wypaść po cichu. Realny koszt
wypadnięcia (2026-08-14): karta reguł geo-spatial z 13 regułami nie miała ani jednego
nagłówka `## `, więc `markdown-chunker` nie wyprodukował z niej żadnego chunka — plik
leżał na dysku i **nie istniał** dla `retrieve_patterns`. Reseed raportował sukces.
W tym samym czasie implementerzy w juz-ide-api-2 wykonali 126 grepów, szukając wiedzy,
którą ta karta zawierała.

Podział pracy: `scripts/new-pattern.mjs` robi to, co deterministyczne (struktura,
walidacja słownika, sparowana karta). Ty piszesz treść. Nie odwrotnie — generator
wypełniający prozę placeholderami produkuje wzorce wyglądające na gotowe i puste w środku.

## Kroki

### 1. Sprawdź, czy już tego nie mamy (najczęstszy błąd)

```
retrieve_patterns  → zapytanie o mechanizm, nie o nazwę
Grep w patterns/README.md → indeks
```

„Czy nie opisaliśmy już tego pod inną nazwą" to najczęstszy fałszywy start. Jeśli
istnieje wzorzec o tym samym mechanizmie — rozszerz go, nie twórz drugiego.

### 2. Ustal metadane

| pole | pytanie |
|---|---|
| `--layer` | gdzie ten wzorzec żyje (`domain`, `infrastructure`, `testing`, …) |
| `--tags` | 1-3 tagi `<stack>:<area>[:<variant>]` ze słownika `blocks/_taxonomy.yml`; poziomy 1-2 są ZAMKNIĘTE |
| `--level` | `quickstart` (minimum do użycia) · `core` (codzienna ścieżka, **default**) · `advanced` (warianty, edge case'y) · `exhaustive` (pełna referencja z historią decyzji) |
| `--scope` | podaj nazwę projektu, jeśli wzorzec pochodzi z JEDNEGO codebase'u i nie został jeszcze potwierdzony w drugim |

**Domyślnie `--scope`**, gdy wzorzec wychodzi z jednego projektu. Uniwersalny jest
dopiero wtedy, gdy drugi, niezależny projekt przyjął ten sam kształt — sama proza
brzmiąca ogólnie to za mało.

### 3. Wygeneruj szkielet

```bash
node scripts/new-pattern.mjs --name <kebab> --layer <warstwa> \
  --tags "<tag>,<tag>" [--level advanced] [--scope <projekt>]
```

Skrypt odmówi na tagu spoza słownika, nieznanej warstwie, nieznanym poziomie i na
istniejącym pliku. Tworzy wzorzec + sparowaną kartę reguł z tym samym `**Tags**`.

### 4. Wypełnij treść

Szkielet ma komentarze `<!-- -->` mówiące, co gdzie wpisać. Trzy rzeczy niepodlegające
negocjacji:

- **Bullety ✅/❌ w „When to Use"** — konkretne warunki wyzwalające, nie cechy. To po nich
  ktoś dopasowuje swoją sytuację w pięć sekund zamiast rekonstruować intencję z prozy.
  W „Do NOT use" **nazwij wzorzec, który jest właściwy** w tym przypadku.
- **Realny kod produkcyjny** w „Implementation", nie pseudokod.
- **Karta reguł** w formie tabeli `ID | Rule | Failure if broken` — reguła w trybie
  rozkazującym, skutek złamania konkretny. Karta to jest to, co realnie wkleja się
  do promptu implementera (`commands/orchestrate.md` §2b′), więc pisz ją jak instrukcję
  operacyjną, nie jak streszczenie.

Usuń komentarze `<!-- -->` po wypełnieniu.

### 5. Zamknij pętlę

```bash
node scripts/lint-patterns.mjs      # sekcje ##, tagi, poziom, parowanie karty, rozmiar karty
./scripts/reseed-patterns.sh        # BEZ TEGO wzorzec nie istnieje dla retrieve_patterns
```

Reseed to pełny `recreate()` obu kolekcji — batchuj kilka wzorców w jeden przebieg
zamiast odpalać go po każdym pliku.

### 6. Ręczne domknięcia (skrypt je wypisuje)

- wiersz w `patterns/README.md` (indeks)
- wpis w `METADATA.yml`, jeśli to nowa kategoria
- `pattern_routing` w `blocks/*.yml` **tylko** gdy wzorzec rządzi rozpoznawalnym rodzajem
  pliku i hooki mają o nim wiedzieć → potem `node scripts/generate-pattern-routing.mjs`

### 7. Sprawdź, że wzorzec jest osiągalny

```
retrieve_patterns → zapytanie mechanizmem, nie nazwą
```

Wzorzec, którego nie zwraca wyszukiwanie, nie istnieje dla żadnego agenta — niezależnie
od tego, jak dobrze jest napisany.

## Output

```
✓ patterns/<layer>/<name>-pattern.md            (<n> chunków, level: <level>)
✓ patterns/<layer>/<name>-pattern_summary.md    (<n> chunków, level: quickstart)
✓ lint: czysto     ✓ reseed: patterns_global <N> chunks
⚠ do zrobienia ręcznie: README index, METADATA.yml
```
