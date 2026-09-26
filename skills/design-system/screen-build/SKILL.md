---
name: screen-build
description: "Procedura budowy nowego ekranu UI w aplikacjach juz-ide: wzorzec z ui-patterns → złożenie z istniejących komponentów i tokenów → podgląd → zrzuty → ocena ui-reviewer → poprawki → dopiero wtedy pokazanie użytkownikowi. Zawiera checklistę gotowości ekranu. Użyj, gdy użytkownik prosi o nowy widok/stronę/ekran, i w /new-screen."
origin: juz-ide design system (wdrożenie, faza 2)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill
effort: medium
paths: "**/*.{tsx,ts,jsx,astro,svelte,eta,dart}"
---

# Budowa ekranu

Kolejność kroków jest częścią procedury. Najczęstszy błąd to pokazanie użytkownikowi
ekranu, którego nikt jeszcze nie obejrzał w przeglądarce.

## 0. Kontekst

- Przeczytaj `CLAUDE.md` / `CLAUDE-LOCAL.md` aplikacji: system (tooling / product), link do
  canvasu Claude Design i zakres (np. „tylko strona D”), konwencje katalogów.
- Jeśli aplikacja ma canvas, a ekran jest na nim narysowany, **buduj według artboardu**.
  Czytaj canvas bezpośrednio, nie z pamięci. Nie ma artboardu → wzorzec z `ui-patterns`.

## 1. Dobierz wzorzec

Skill `ui-patterns`: lista, formularz, szczegóły albo kompozycja. Zapisz w odpowiedzi,
który wzorzec stosujesz i które jego reguły dotyczą tego ekranu. Ekran niepasujący do
żadnego wzorca → zatrzymaj się i zapytaj użytkownika. Nie wymyślaj nowego wzorca po cichu.

## 2. Złóż z tego, co już istnieje

- Najpierw komponenty biblioteki (antd) i ich warianty, potem `shared/ui` aplikacji.
  Nowy komponent tylko wtedy, gdy żaden wariant nie wystarcza — z uzasadnieniem.
- Każda wartość wizualna z tokenów (skill `design-tokens`). Hook `check-ui-tokens`
  zgłosi literał przy zapisie — popraw od razu, nie odkładaj.
- Wszystkie cztery stany brzegowe od początku: pusty, ładowanie (szkielet), błąd
  (z ponowieniem), brak uprawnień.
- Teksty po polsku, w tonie marki.

## 3. Sprawdź technicznie

Typecheck, lint i testy pakietu (np. `pnpm --filter <pakiet> typecheck`, `lint:check`, `test`).
Czerwone = nie idziesz dalej.

## 4. Obejrzyj — skill `visual-check`

Uruchom podgląd, zrób zrzuty w macierzy light/dark × desktop/mobile i przekaż je
agentowi `ui-reviewer`. Pokaż też stany brzegowe (w podglądzie z mockiem albo przez
parametr/stan testowy) — przynajmniej pusty i błąd na desktopie.

## 5. Popraw i powtórz

Zastrzeżenia recenzenta o wadze „blokujące” poprawiasz sam i powtarzasz krok 4. Pozostałe
przedstawiasz użytkownikowi jako listę do decyzji. Maksymalnie 3 pętle, potem pokaż
stan i zapytaj.

## 6. Pokaż użytkownikowi

Dopiero teraz: zrzuty (ścieżki), zastosowany wzorzec, lista odstępstw od wzorca z powodem,
wynik recenzji.

## Checklista gotowości ekranu

- [ ] Wzorzec nazwany; układ zgodny z `ui-patterns` (albo odstępstwo zaakceptowane przez użytkownika)
- [ ] Zero literałów kolorów, magicznych odstępów i `style` spoza whitelisty (hook milczy)
- [ ] Jedna akcja główna, we właściwym miejscu wzorca
- [ ] Stany: pusty (ikona + zdanie + akcja), ładowanie (szkielet), błąd (przyczyna + ponów), brak uprawnień (403)
- [ ] Formularz: etykiety nad polami, błędy inline (także 422 z serwera), ostrzeżenie o niezapisanych zmianach
- [ ] Lista: filtry nad tabelą, sortowanie w nagłówkach, „Pokazano X–Y z N”
- [ ] Teksty po polsku, bez przepełnienia na mobile
- [ ] Typecheck, lint, testy zielone
- [ ] Zrzuty light/dark × desktop/mobile zrobione i ocenione przez `ui-reviewer`, blokujące uwagi poprawione
