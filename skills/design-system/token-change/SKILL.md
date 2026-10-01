---
name: token-change
description: "Procedura zmiany tokenu w repo `design-system`: edytuj JSON → przelicz → zwaliduj → podgląd → PR ze zrzutami → dobierz stopień semver wg tabeli decyzyjnej patch/minor/major → publikacja przez dist-tag npm. Użyj przy KAŻDEJ zmianie wartości, nazwy albo roli tokenu. Wywołanie ręczne: /token-bump <patch|minor|major>."
origin: juz-ide design system (wdrożenie, faza 5, część B)
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
effort: medium
argument-hint: "<patch|minor|major>"
disable-model-invocation: true
---

# Zmiana tokenu

Repo `design-system`, `tokens/*.json` (`brand.json`, `product.json`, …) — jedyne źródło
prawdy. `npm run build` przelicza WSZYSTKIE wyjścia naraz: CSS/Tailwind (web), motyw antd
(tooling), i pakiet Dart (`juz_ide_tokens`, patrz skill `flutter-theme`). Nigdy nie edytuj
wyjścia bezpośrednio (`dist/`, `packages/tokens_dart/lib/theme.dart`, `reference/tokens.md`
w `design-tokens`) — poprawka wraca po następnym buildzie.

Argument `$ARGUMENTS`: stopień semver zadeklarowany przez wywołującego. Zweryfikuj go wg
tabeli niżej, zanim go przyjmiesz — deklaracja "patch" dla zmiany, która w tabeli jest
"major", to błąd do poprawienia i wyjaśnienia, nie do milczącego wykonania.

## Procedura (9 kroków)

1. Edycja `tokens/*.json` (ręcznie albo wg opisu zmiany od użytkownika).
2. `npm run build` — przeliczenie wszystkich wyjść.
3. `npm run validate` — kontrast, kompletność.
4. `npm run dev` — katalog z nowym motywem, klikalnie.
5. PR → CI: preview deploy + zrzuty + diff pikselowy.
6. `ui-reviewer` komentuje (kontrasty, hierarchia, regresje).
7. Akceptacja → merge → release.
8. Renovate otwiera PR w każdej aplikacji.
9. Każda aplikacja podnosi wersję kiedy chce.

Kroki 1–4 wykonuje ten skill. Krok 5 (PR) też, jeśli masz dostęp do repo zdalnego —
w przeciwnym razie przygotuj commit i powiedz użytkownikowi, że PR czeka na wypchnięcie.
Krok 6 to zadanie `ui-reviewer`, wywołaj go na zrzutach z kroku 4. Kroki 7–9 są poza
zasięgiem tego skilla — informacyjne, nie wykonawcze.

## Tabela decyzyjna: patch / minor / major

| Stopień | Kiedy |
|---|---|
| patch | korekta wartości bez zmiany intencji (odcień poprawiony dla kontrastu) |
| minor | nowy token, nowa rola — nic nie znika, nic nie zmienia znaczenia |
| major | usunięcie/zmiana nazwy tokenu, zmiana znaczenia, podmiana algorytmu, **oraz każda zmiana przełomowa wizualnie** (np. kolor marki) |

Ostatni punkt jest świadomym odstępstwem od czystego semveru: zmiana koloru marki jest
zgodna z API, ale konsumenci mają ją zaakceptować świadomie, a nie dostać przy `npm update`.

## Kanały (dist-tagi npm)

```bash
npm dist-tag add @projekt/tokens@1.4.2 latest         # obowiązujące
npm dist-tag add @projekt/tokens@1.5.0-rc.1 next      # kandydat
npm dist-tag add @projekt/tokens@2.0.0-exp.1 experimental
```

Aplikacja bierze to, co chce:

```bash
npm i @projekt/tokens                 # latest
npm i @projekt/tokens@experimental    # tylko tam, gdzie testujesz
```

## Eksperymenty

Gałąź `exp/<nazwa>` w `design-system` + prerelease. **Nigdy** namespace `_experimental.*`
w stabilnym pliku tokenów — takie wpisy zostają na zawsze i nikt nie wie, czy wolno ich
używać.

## Deprecacja

1. Nowy token wchodzi jako minor.
2. Stary zostaje jako alias z `@deprecated` w typach TS (albo `@Deprecated('Use X — patrz
   Y')` w Dart, z konkretną ścieżką migracji — zobacz "Anti-Patterns" w
   `patterns/flutter/design-token-pattern.md` na to, co się dzieje, gdy adnotacja nie
   wskazuje pliku i symbolu).
3. Znika dopiero w kolejnym major.

Dzięki temu agent `token-drift` widzi „ta aplikacja używa trzech zdeprecjonowanych
tokenów” i może to zgłosić z gotową ścieżką migracji, zamiast tylko „coś tu nie tak”.

## Kontrola po stronie aplikacji

Każde repo pinuje wersję, Renovate otwiera PR z podbiciem, CI robi zrzuty przed/po.
Aktualizacja tokenów to PR ze zdjęciami, nigdy niespodzianka przy starcie aplikacji.
