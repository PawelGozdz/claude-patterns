# Data Fetching (Next.js App Router) — Rule Card

**Tags**: "web:data-access", "web:platform:nextjs"

<!-- Egzekwowalne streszczenie data-fetching-pattern.md. ORM-neutralne: dostęp do danych
     przez nazwane funkcje server-only DAL. Dane per-user: auth-boundaries-pattern.md. -->

**Layer**: Cross-Layer · **Applies to**: `app/**` (pages, layouts, Server Components, Server
Actions), `data/**` (server-only DAL)

## MUST

- **DF1** — Server Components fetch initial data directly (`async`/`await`); no `useEffect` +
  `useState` fetch, no loading state for initial data.
- **DF2** — Data access goes through named functions of a server-only DAL (`@/data/…`) with plain
  arguments and DTO return values. For per-user data the DAL function calls `verifySession`
  itself (`auth-boundaries-pattern.md`).
- **DF3** — Caching is opt-in: `"use cache"` plus `cacheLife()` for TTL, `cacheTag()` for every
  slice a mutation will invalidate.
- **DF4** — Every `revalidateTag('x')` / `updateTag('x')` has a matching `cacheTag('x')` in the
  data function.
- **DF5** — `updateTag()` for instant invalidation after a mutation; `revalidateTag(tag, 'max')`
  for stale-while-revalidate; `refresh()` for uncached data not covered by tags.
- **DF6** — Independent fetches run through `Promise.all`.
- **DF7** — Client-side fetching (SWR/React Query) only for real-time polling or post-load,
  user-driven data.

## MUST NOT

- **N1** — ❌ `getStaticProps`, `getServerSideProps`, `getInitialProps` (Pages Router APIs).
- **N2** — ❌ Sequential `await` of independent requests.
- **N3** — ❌ Caching user-specific data without a user/org-scoped `cacheTag` (or skipping the
  cache for personalized data).
- **N4** — ❌ Inline queries or a data-layer client imported straight into page components.
- **N5** — ❌ `useEffect` + `fetch` for data a Server Component could load.
- **N6** — ❌ `updateTag` for non-critical updates (use `revalidateTag(tag, 'max')`).

## Verifier — najczęstsze naruszenia → VETO

| Symptom | Reguła |
|---|---|
| `getServerSideProps` / `getStaticProps` in `app/` | N1 |
| Two independent `await`s in a row in one page | DF6/N2 |
| `revalidateTag`/`updateTag` with a tag no `cacheTag` declares | DF4 |
| `"use cache"` data function for per-user data without user/org in the tag | DF3/N3 |
| Data-layer client or query imported in `app/**` component | DF2/N4 |
| `useEffect` + `fetch` for initial page data | DF1/N5 |
