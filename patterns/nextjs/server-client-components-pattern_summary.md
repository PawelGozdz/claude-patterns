# Server & Client Components (Next.js App Router) — Rule Card

**Tags**: "web:ui", "web:platform:nextjs"

<!-- Egzekwowalne streszczenie server-client-components-pattern.md. Dane per-user i DTO:
     auth-boundaries-pattern.md. -->

**Layer**: Cross-Layer · **Applies to**: `app/**` components, pages and layouts; every file
containing `"use client"`, `"use server"` or `"use cache"`

## MUST

- **SC1** — Server Components are the default; `"use client"` only where a component needs
  `useState`, `useEffect`, event handlers, browser APIs or a client-only library.
- **SC2** — Keep the `"use client"` boundary as low in the tree as possible; everything a Client
  Component imports becomes client code.
- **SC3** — Props crossing into a Client Component are serializable (plain objects/strings); no
  functions, Dates, Maps or class instances.
- **SC4** — Pass DTOs, not whole rows, to Client Components; per-user data comes from DAL
  functions that verify the session (`auth-boundaries-pattern.md`).
- **SC5** — Caching is explicit: `"use cache"` with `cacheLife()` for output reused across
  requests.
- **SC6** — `await params` / `await searchParams`; they are Promises in Next.js 16.
- **SC7** — Fetch in Server Components with `async`/`await` and pass data down as props.

## MUST NOT

- **N1** — ❌ `"use client"` on components that only render data.
- **N2** — ❌ `"use server"` on a component or page (it marks Server Actions only).
- **N3** — ❌ Fetching initial data in Client Components via `useEffect`.
- **N4** — ❌ Synchronous destructuring of `params`.
- **N5** — ❌ Manual `useMemo`/`useCallback` without profiling evidence (React Compiler memoizes).
- **N6** — ❌ `getStaticProps` / `getServerSideProps` (Pages Router APIs).

## Verifier — najczęstsze naruszenia → VETO

| Symptom | Reguła |
|---|---|
| `"use client"` file with no state, effect, handler or browser API | SC1/N1 |
| `"use server"` at the top of a component/page file | N2 |
| Function, Date or class instance passed as a prop to a Client Component | SC3 |
| Whole database row passed to a Client Component | SC4 |
| `const { id } = params` without `await` | SC6/N4 |
| `useEffect` + `fetch` loading initial page data | SC7/N3 |
