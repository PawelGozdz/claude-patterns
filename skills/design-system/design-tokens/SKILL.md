---
name: design-tokens
description: "Tokeny systemu designu juz-ide: czym jest token, pełna lista (tooling + product, jasny i ciemny), twarde zakazy literałów i sposób sięgania po token w React/antd, CSS/Tailwind (Astro, SvelteKit, Eta) i Flutterze. Użyj przy każdej pracy nad plikiem UI."
origin: juz-ide design system (wdrożenie, faza 2)
allowed-tools: Read, Glob, Grep
effort: low
paths: "**/*.{tsx,ts,jsx,css,astro,svelte,eta,dart}"
---

# Tokeny designu

Każda wartość wizualna w aplikacji (kolor, krój, rozmiar tekstu, odstęp, promień, cień,
czas animacji) pochodzi z paczki tokenów, generowanej z repo `design-system`
(`tokens/*.json` → `pnpm build`). Aplikacja niczego nie definiuje u siebie. Wybiera token,
a gotowy motyw dostaje z paczki.

**Pełna lista tokenów z wartościami obu motywów: [`reference/tokens.md`](reference/tokens.md).**
Plik jest generowany, więc nie zgaduj nazw z pamięci, tylko go przeczytaj.

## Czym jest token, a czym nie jest

| Token | Nie token |
|---|---|
| `--ds-color-text-muted`, `token.colorTextSecondary`, `bg-bg-tint` | `#6B5544`, `rgb(107 85 68)`, `gray-500` |
| `--ds-space-16`, `token.padding`, `<Space size="middle">` | `padding: 15`, `gap: 7px` |
| rola: „tekst drugorzędny”, „akcent pozytywny” | wygląd: „szarobrązowy”, „zielony” |

Token nazywa **rolę**, nie wygląd. Wybierasz `status-ok`, bo coś się udało, a nie dlatego,
że potrzebujesz zieleni. Dzięki temu tryb ciemny i przyszła zmiana palety działają bez
dotykania ekranów.

Dwa systemy: **tooling** (panele wewnętrzne: `marketing-hub`, `grant-flow`, `iam`, `wiki`;
gęsty, kontrolka 34 px, treść 13 px) i **product** (juz-ide: mobile, blog, strona; cel
dotykowy 44 px). Paleta jest wspólna, różnią się typografia i gęstość. Aplikacja bierze
swój system, nigdy oba.

## Twarde zakazy

1. **Żadnych literałów kolorów** w kodzie UI: `#rrggbb`, `rgb()`, `rgba()`, `hsl()`,
   `Color(0xFF…)`, `Colors.*`. Wyjątek: `transparent`, `currentColor`, `inherit`.
2. **Żadnych magicznych odstępów i rozmiarów.** Skala odstępów: 4, 8, 10, 12, 14, 16, 20, 24
   (`--ds-space-*`). Liczba spoza skali oznacza zły token albo potrzebę nowego tokenu,
   a nowy token dodaje się w `design-system`, nie w aplikacji.
3. **`style={{}}` tylko dla pozycjonowania dynamicznego**: `position`, `top`/`right`/`bottom`/
   `left`/`inset`, `transform`, `width`/`height` (i `min`/`max`), `zIndex`, `display`,
   `flex*`, `grid*`, `order`, `visibility`, `opacity`. Kolor, tło, obramowanie, marginesy,
   paddingi, typografia i cień w `style` są zakazane.
4. **Mapowanie tokenów na bibliotekę nie mieszka w aplikacji.** Motyw antd, preset Tailwinda
   i `ThemeData` przychodzą z paczki gotowe. Plik motywu w aplikacji to jedna linia wyboru.
5. **Nie nadpisuj stylów komponentów biblioteki** (import `antd/es/*/style`, selektory
   `.ant-*` w CSS). Potrzebny inny wygląd to wariant komponentu albo token komponentu
   w paczce.
6. **Nie edytuj plików generowanych** (`dist/`, `reference/tokens.md`). Zmiana tokenu idzie
   przez `design-system/tokens/*.json`.

Hook `check-ui-tokens` łapie zakazy 1, 3 i 5 w plikach `.ts`/`.tsx` w chwili zapisu.
Ostrzeżenie z hooka to sygnał do poprawki, a nie do dopisania wyjątku.

## React + Ant Design (tooling: `marketing-hub`, `grant-flow`)

```tsx
// app/theme.ts — jedyny plik motywu; zero mapowania
import { toolingLight, toolingDark } from '@juz-ide/tokens/antd';
export const themeFor = (dark: boolean) => (dark ? toolingDark : toolingLight);

// App.tsx
<ConfigProvider theme={themeFor(dark)} locale={plPL}>…</ConfigProvider>

// komponent — wartość z motywu, nie literał
const { token } = theme.useToken();
<div style={{ width: token.controlHeight * 6 }} />   // pozycjonowanie/rozmiar: OK

// kolory i odstępy przez komponenty i ich propsy, nie przez style
<Typography.Text type="secondary">…</Typography.Text>
<Space size="middle">…</Space>
```

Gdy antd nie ma tokenu dla potrzebnej roli (np. `bg.tint`), użyj zmiennej CSS
`var(--ds-color-bg-tint)` w pliku `.css` / CSS module po zaimportowaniu CSS systemu (niżej).

## CSS i Tailwind (Astro, SvelteKit, szablony Eta, Wiki.js)

```css
/* zwykły CSS / Eta / Wiki.js inject.css */
@import '@juz-ide/tokens/css/tooling';          /* albo css/product, albo css/apps/<aplikacja> */
.karta { background: var(--ds-color-bg-tint); border-radius: var(--ds-radius-lg);
         padding: var(--ds-space-16); font: var(--ds-type-body); }
```

```js
// Tailwind 3 (juz-ide-pl, pcu) — tailwind.config.js
presets: [require('@juz-ide/tokens/tailwind').productPreset]
```

```css
/* Tailwind 4 (juz-ide-blog) — główny CSS */
@import "tailwindcss";
@import "@juz-ide/tokens/tailwind4/product";
```

Klasy: `bg-bg-tint`, `text-text-muted`, `border-border-subtle`, `rounded-lg`, `shadow-low`,
`font-serif`. Pełna lista nazw w [`reference/tokens.md`](reference/tokens.md). Nie używaj
palety domyślnej Tailwinda (`gray-*`, `blue-*`) ani wartości w nawiasach (`bg-[#…]`, `p-[13px]`).

Tryb ciemny: atrybut `data-theme="dark"` na `<html>`, zmienne przełączają się same.

## Flutter (`juz-ide-mobile-app`)

```dart
// Motyw z paczki tokenów Dart; w widgetach tylko Theme.of(context)
final colors = Theme.of(context).colorScheme;
final text = Theme.of(context).textTheme;
Container(color: colors.surface, child: Text('…', style: text.bodyMedium));
```

Szczegóły (ThemeExtension, golden testy) — wzorzec `patterns/flutter/design-token-pattern.md`
i hooki `check-design-tokens` / `check-typography-tokens`. Ten skill ich nie powiela.

## Gdy tokenu brakuje

Nie wymyślaj wartości. Zgłoś użytkownikowi: jaka rola, na którym ekranie, dlaczego żaden
istniejący token nie pasuje. Nowy token powstaje w repo `design-system` (JSON → build →
validate → publikacja) i dopiero potem trafia do aplikacji.

## Odświeżenie listy tokenów

Po zmianie tokenów w `design-system` (`pnpm build`):

```bash
node skills/design-system/design-tokens/scripts/generate-reference.mjs            # zapis
node skills/design-system/design-tokens/scripts/generate-reference.mjs --check    # CI / kontrola
```

Ścieżka do `design-system`: `--design-system <ścieżka>`, zmienna `DESIGN_SYSTEM_PATH` albo
domyślnie katalog obok `claude-patterns`.
