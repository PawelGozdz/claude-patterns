# Styling (Next.js) — Rule Card

**Tags**: "web:ui", "web:platform:nextjs"

<!-- Executable summary of styling-pattern.md. -->

**Layer**: Presentation · **Applies to**: `app/globals.css`, `*.module.css`, `components/**`,
`lib/utils.ts` (`cn()`)

## MUST

- **ST1** — Tailwind CSS 4 is loaded with a single `@import 'tailwindcss'` in `globals.css`.
- **ST2** — Design tokens live in `@theme` (CSS custom properties), not duplicated per component.
- **ST3** — Use CSS Modules for scoped styles; they work in Server Components without
  `"use client"`.
- **ST4** — Compose conditional Tailwind classes with `cn()` (`clsx` + `tailwind-merge`).
- **ST5** — Keep View Transitions in Client Components (`document.startViewTransition`), with a
  fallback when the browser lacks support.
- **ST6** — Give each `view-transition-name` a page-unique value (e.g. `product-${id}`).
- **ST7** — Define style maps as module-level constants; leave memoization to the React Compiler.
- **ST8** — Clean up timers and subscriptions in components wrapped by `<Activity/>`; they keep
  running while hidden.

## MUST NOT

- **N1** — ❌ styled-components, Emotion or other runtime CSS-in-JS in Server Components.
- **N2** — ❌ `@tailwind base/components/utilities` directives (Tailwind 3 syntax).
- **N3** — ❌ String concatenation for class names.
- **N4** — ❌ Inline `style` objects for complex layouts.
- **N5** — ❌ `useMemo` around style constants.
- **N6** — ❌ Duplicate `view-transition-name` values on one page.

## Verifier — most common violations → VETO

| Symptom | Rule |
|---|---|
| `styled-components` / `@emotion/*` imported in a Server Component | N1 |
| `@tailwind base;` in `globals.css` | ST1/N2 |
| Template-literal class strings mixing conditionals | ST4/N3 |
| Hard-coded hex colours repeated across components instead of tokens | ST2 |
| Static `view-transition-name` on list items | ST6/N6 |
| `useMemo` wrapping a constant style map | ST7/N5 |
