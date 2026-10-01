# Pattern: Web Structure (features per bounded context, Refine SPA)

**Tags**: "web:ui", "web:platform:react"
**Layer**: Cross-Layer
**Status**: stable
**Scope**: project-specific (marketing-hub) — single-project derivation (TS-MH-002), not yet
validated in a second codebase. Excluded from `retrieve_patterns` by default; pass
`project: "marketing-hub"` to include it. Promote to universal once grant-flow (albo inny
projekt) faktycznie wdroży ten sam kształt panelu Refine.

## What This Is

Bez narzuconego układu panel Refine rośnie w jeden katalog `components/` z importami w
każdą stronę. Odbicie bounded contextów API w `features/` daje granice, które umie pilnować
`eslint-plugin-boundaries` — ten sam mechanizm co w `apps/api`, tylko po stronie klienta.

## When to Use

**Use this pattern for:**
- ✅ Nowy panel Vite + React + Refine + Ant Design w monorepo `apps/web/`, gdzie API ma już
  bounded contexty i chcemy je odzwierciedlić w strukturze frontendu
- ✅ Refactor istniejącego panelu, w którym `components/` stał się jednym wielkim katalogem
  bez granic między funkcjami
- ✅ Decyzja, gdzie umieścić nowy plik `.ts`/`.tsx` w `apps/web/src` (routing przez tabelę
  „Symptom → Reguła" w karcie reguł)

**Do NOT use for:**
- ❌ Aplikacje Next.js App Router — tam obowiązuje `nextjs/server-client-components-pattern.md`
  i sąsiednie wzorce `nextjs/`, z innym modelem routingu (RSC, nie SPA)
- ❌ Panel bez podziału na bounded contexty API (np. jeden mały formularz) — narzucenie
  `features/<kontekst>/` na trywialny panel jest przerostem formy nad treścią
- ❌ Biblioteka komponentów współdzielona między wieloma aplikacjami — to
  `typescript-library/package-boundary-pattern.md`, inny problem (publikacja, semver)

## Implementation

```
apps/web/src/
  app/         shell Refine (routing, layout AntD, motyw) — jedyne miejsce z <Refine>
  providers/   auth, accessControl, data (JSend), config — styk z API i iam
  features/<kontekst>/   strony, hooki, komponenty jednego bounded contextu
  shared/ui/   komponenty bez wiedzy domenowej (SafeMarkdown, EmptyState, …)
  shared/lib/  utils bez React
```

- **WST1** — Nowy kod trafia do jednego z pięciu katalogów wyżej, nigdy luzem w `src/`.
- **WST2** — `features/a` nie importuje z `features/b`; wymiana idzie przez routing albo
  `shared`. Egzekwuje `eslint-plugin-boundaries`.
- **WST3** — Komponenty w `shared/ui` nie znają kontraktów API ani providerów.
- **WST4** — Jedna strona = jeden plik `*.page.tsx`; komponent = nazwany eksport = nazwa
  pliku.
- **WST5** — Stan serwera w TanStack Query (przez Refine), stan UI lokalnie; brak
  globalnego store, dopóki dwie features nie potrzebują tego samego stanu UI.
- **WST6** — Styl przez Ant Design + tokeny motywu z `app/theme.ts`; brak CSS inline poza
  wyjątkami z komentarzem uzasadniającym.
- **WST7** — Ścisły TypeScript jak w `apps/api` (`strict`, `noUnusedLocals`,
  `noImplicitReturns`); `any` tylko z komentarzem uzasadniającym.

## Anti-Patterns

- ❌ `import ... from '../../features/xxx'` z innego feature — wymiana idzie przez routing
  lub `shared`, nie przez bezpośredni import.
- ❌ `components/` luzem w `src/` bez przypisania do feature lub `shared`.
- ❌ Logika domenowa (reguły, obliczenia biznesowe) w kliencie — API jest źródłem prawdy.
- ❌ Kolejny `<Refine>`/router poza `app/`.

Karta reguł: `web-structure-pattern_summary.md`.
