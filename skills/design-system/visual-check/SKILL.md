---
name: visual-check
description: "Kontrola wizualna ekranu: zrzuty Playwrightem w macierzy light/dark × desktop/mobile, ocena przez agenta ui-reviewer (kontrast, hierarchia, odstępy, stany, przepełnienie, tryb ciemny). Użyj po zmianie ekranu i w ramach screen-build; ręcznie: /visual-check [adres|ścieżka]."
origin: juz-ide design system (wdrożenie, faza 2)
allowed-tools: Read, Glob, Grep, Bash, Agent
effort: medium
argument-hint: "[adres URL albo ścieżka trasy, np. /accounts]"
paths: "**/*.{tsx,ts,jsx,css,astro,svelte,eta}"
---

# Kontrola wizualna

Argument: `$ARGUMENTS` — pełny adres (`http://localhost:5173/accounts`) albo sama trasa
(`/accounts`, wtedy dopnij ją do adresu serwera deweloperskiego). Bez argumentu: ekran,
nad którym pracujesz w tej sesji; jeśli nie wiadomo jaki — zapytaj.

Kod zobaczony tylko w edytorze nie jest sprawdzony. Ekran jest sprawdzony, gdy są zrzuty
w całej macierzy i ocena recenzenta.

## 1. Uruchom aplikację

- Szukaj skryptu w `package.json` aplikacji: `dev` (Vite: port z `vite.config.*`, domyślnie
  5173) albo `preview` po `build`. W monorepo pnpm: `pnpm --filter <pakiet> dev`.
- Uruchom w tle i poczekaj, aż port odpowiada (`curl -sf <adres>`), zamiast zgadywać czas.
- **Aplikacja za bramką logowania** (np. `marketing-hub` za iam): bez sesji zrzut pokaże
  przekierowanie na logowanie. Użyj trybu podglądu/mocków aplikacji, jeśli istnieje. Jeśli
  nie istnieje, zgłoś to jako blokadę i nie oceniaj ekranu logowania zamiast właściwego.
- Po zakończeniu zatrzymaj serwer, który uruchomiłeś.

## 2. Zrób zrzuty — macierz obowiązkowa

| | desktop 1440×900 | mobile 390×844 |
|---|---|---|
| **light** | ✓ | ✓ |
| **dark** | ✓ | ✓ |

Jeśli repo ma własne testy wizualne (`tests/visual.spec.ts`, `test:visual`), użyj ich.
Jeśli nie ma — skrypt z tego skilla (Playwright projektu, niczego nie instaluje):

```bash
node <claude-patterns>/skills/design-system/visual-check/scripts/capture.mjs \
  --url http://localhost:5173/accounts --name accounts --app-dir apps/web
# → .claude/run-state/visual-check/accounts-{light,dark}-{desktop,mobile}.png + JSON z wynikiem
```

Ścieżkę `<claude-patterns>` weź z celu symlinku `.claude/skills/visual-check`
(`readlink -f .claude/skills/visual-check`).

**Kontrakt trybu ciemnego:** aplikacja przełącza motyw po `?theme=dark`, po
`prefers-color-scheme: dark` albo po `data-theme="dark"` na `<html>`. Skrypt ustawia
wszystkie trzy. Jeśli zrzut „dark” wygląda jak „light”, aplikacja nie spełnia kontraktu,
a to jest znalezisko, nie problem skryptu.

Sprawdź JSON: `status` 200, `finalUrl` bez przekierowania na logowanie, pusta lista
`consoleErrors`. Błąd konsoli to znalezisko.

## 3. Oceń — agent `ui-reviewer`

Przekaż zrzuty agentowi @ui-reviewer: ścieżki PNG, nazwę ekranu, typ wzorca (lista /
formularz / szczegóły / inny) i stany, które zrzuty pokazują. Recenzent nie edytuje
kodu, tylko zwraca listę zastrzeżeń z odniesieniem do reguł.

Oś oceny (recenzent stosuje ją w całości, możesz nią też zweryfikować wynik):

1. **Kontrast** — tekst i ikony czytelne w obu motywach; nic „znikającego” w dark.
2. **Hierarchia** — jedna akcja główna, tytuł dominuje, drugorzędne cofnięte.
3. **Odstępy** — rytm ze skali tokenów, równe marginesy, wyrównane krawędzie.
4. **Stany** — pusty / ładowanie / błąd / brak uprawnień według `ui-patterns`.
5. **Przepełnienie** — długie nazwy, duże liczby, wąski ekran: nic nie wychodzi poza kontener.
6. **Tryb ciemny** — tła Espresso, akcenty jaśniejsze, ciemny napis na pełnych akcentach.
7. **Zgodność ze wzorcem** — układ z `ui-patterns` (filtry nad tabelą, paginacja z liczbą itd.).

## 4. Wynik

Pokaż użytkownikowi: listę zrzutów (ścieżki), werdykt recenzenta (OK / do poprawy) i
zastrzeżenia pogrupowane według wagi. Poprawki robisz dopiero po akceptacji użytkownika,
po czym zrzuty i ocenę trzeba powtórzyć.
