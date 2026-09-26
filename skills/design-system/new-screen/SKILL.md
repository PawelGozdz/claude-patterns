---
name: new-screen
description: "Buduje nowy ekran według wzorca z ui-patterns i procedury screen-build, sam robi zrzuty i przekazuje je do ui-reviewer. Wywołanie ręczne: /new-screen <nazwa> <typ: lista|formularz|szczegóły|inny>."
origin: juz-ide design system (wdrożenie, faza 2)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill
effort: medium
argument-hint: "<nazwa> <lista|formularz|szczegóły|inny>"
disable-model-invocation: true
---

# /new-screen

Argumenty: `$ARGUMENTS` — `<nazwa>` (np. `konta`) i `<typ>` (`lista`, `formularz`,
`szczegóły`, `inny`). Brak któregoś → zapytaj, nie zgaduj.

## Bramka wejścia

1. `.claude/config/runtime.yml` projektu musi zawierać blok `design-system` w
   `stack_blocks`. Nie ma go → odmów i powiedz, jak go włączyć (`project.yml` →
   `stack_blocks` + `skills: [design-system]`, potem `setup-project.sh`).
2. Przeczytaj skille `ui-patterns`, `design-tokens` i `screen-build` (w
   `.claude/skills/`). Bez nich nie zaczynaj.

## Przebieg

1. **Wzorzec.** Z `ui-patterns` wypisz reguły dla typu `<typ>` i cztery obowiązkowe stany
   brzegowe. Typ `inny` → zaproponuj kompozycję ze wzorców i poczekaj na akceptację.
2. **Plan pliku.** Gdzie powstanie ekran według konwencji aplikacji (np. w `marketing-hub`:
   `apps/web/src/features/<kontekst>/<nazwa>.page.tsx`, trasa w `app/`). Jaki zasób Refine,
   jakie komponenty antd. Pokaż plan w 5–10 liniach.
3. **Budowa** według `screen-build`, kroki 2–3.
4. **Zrzuty i ocena** według `visual-check`: macierz light/dark × desktop/mobile, recenzja
   agenta `ui-reviewer`. Tego kroku nie wolno pominąć. Jeśli podgląd nie działa (np. brak
   trybu bez logowania), zgłoś to jako blokadę, zamiast oddać ekran bez zrzutów.
5. **Wynik:** zrzuty, zastosowany wzorzec, checklista gotowości z `screen-build`
   (odhaczona uczciwie), zastrzeżenia recenzenta.

Kod zostaje niezacommitowany, commit robi użytkownik albo robisz go na jego prośbę.
