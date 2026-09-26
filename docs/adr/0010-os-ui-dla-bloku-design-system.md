# ADR 0010 — Oś `ui` dla bloku `design-system`

**Status**: accepted (2026-09-26)
**Context source**: wdrożenie systemu designu juz-ide, faza 2 (`/opt/projects/wdrozenie/plan-systemu-designu.md`,
sekcja 5.1 „Do ustalenia w fazie 2”). Decyzja użytkownika z 2026-09-26.

---

## Kontekst

Blok `design-system` wnosi do projektu reguły UI: skille (`design-tokens`, `ui-patterns`,
`screen-build`, `visual-check`), agenta `ui-reviewer` i hook `check-ui-tokens`. Każdy blok
deklaruje jedną oś (`axis:`). Plan wskazał dwóch kandydatów: `process` albo nową oś `ui`.
`framework` odpadał, bo tę oś zajmuje blok stacku aplikacji (`nestjs`, `nextjs`, lokalny
`./web` itd.).

Przy sprawdzaniu kodu wyszło, że założenie planu „dwa bloki na tej samej osi się
wykluczają” nie jest egzekwowane. `materialize-runtime.mjs` sprawdza tylko jedno: warstwy
(`orchestrate.layers`) wnosi blok z osią `architecture`. `marketing-hub` ma dziś pięć bloków
osi `architecture` naraz i materializacja przechodzi. Wykluczanie było wyłącznie w opisie
pola w `schemas/block.schema.json` (opis poprawiony razem z tym ADR).

## Decyzja

Blok `design-system` dostaje nową oś **`ui`**. Enum w `schemas/block.schema.json` i lista
osi w `blocks/README.md` zostają rozszerzone o `ui`.

## Uzasadnienie

- `process` w tym repo oznacza przebieg pracy i bramki: `approval-gate`,
  `decision-registry`, `governance`. Blok o wyglądzie ekranów byłby tam obcy.
- Taksonomia (`blocks/_taxonomy.yml`) ma już obszar `ui: [accessibility, design-token, …]`.
  Oś o tej samej nazwie czyta się bez tłumaczenia.
- Gdyby ktoś kiedyś zaczął egzekwować wykluczanie osi, `design-system` na `process`
  zderzyłby się z bramką approval albo z rejestrem decyzji, których projekt UI też
  potrzebuje. Na `ui` kolizja dotyczyłaby tylko innego bloku UI (np. przyszłego a11y),
  a tam rozstrzygnięcie jest naturalne.

## Konsekwencje

- Koszt: jedna wartość w enumie schematu i jeden punkt w `blocks/README.md`.
  Materializator nie wymaga zmian, bo nie ma listy osi.
- Oś `ui` nie wnosi `orchestrate.layers`. Warstwę `web` nadal definiuje blok architektury
  projektu (w `marketing-hub`: lokalny `./layers-monorepo`).
- Wiedza o konkretnych tokenach juz-ide mieszka w skillu `design-tokens`; jego lista tokenów
  jest generowana z repo `design-system`
  (`skills/design-system/design-tokens/scripts/generate-reference.mjs`), nie przepisywana.

## Odrzucone

- **`process`**: zero kosztu, ale błędna semantyka i gorsza przyszła kolizja (wyżej).
- **`framework`**: zajęta przez blok stacku aplikacji.
