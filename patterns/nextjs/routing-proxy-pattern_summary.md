# Routing & Proxy (Next.js) — Rule Card

**Tags**: "web:ui:navigation", "web:platform:nextjs"

<!-- Executable summary of routing-proxy-pattern.md. -->

**Layer**: Cross-Layer · **Applies to**: `proxy.ts`, `app/**/layout.tsx`, `page.tsx`,
`loading.tsx`, `error.tsx`, `not-found.tsx`

## MUST

- **RP1** — Request interception lives in `proxy.ts` at the project root (replaces
  `middleware.ts`), with a `config.matcher` that excludes static files and Next.js internals.
- **RP2** — Auth in `proxy.ts` is optimistic only (cookie read, no database); the authoritative
  check lives in the DAL (`auth-boundaries-pattern.md`).
- **RP3** — Keep `proxy.ts` thin: cookie check, redirects, header injection. Heavy logic goes to
  Server Components or the DAL.
- **RP4** — Nonce-based CSP set from `proxy.ts` follows `security-headers-csp-pattern.md`.
- **RP5** — Await `params` and `searchParams` (`const { slug } = await params`).
- **RP6** — `error.tsx` is a Client Component (`"use client"`); add `loading.tsx` for streaming
  segments.
- **RP7** — Use route groups `(name)` to share layouts without changing URLs; use
  `generateStaticParams` for static params.
- **RP8** — Fetch page data in `page.tsx` or components inside it, not in layouts.

## MUST NOT

- **N1** — ❌ `middleware.ts`.
- **N2** — ❌ `_app.tsx` / `_document.tsx` (Pages Router).
- **N3** — ❌ Treating the `proxy.ts` cookie check as the only auth check.
- **N4** — ❌ Synchronous destructuring of `params`.
- **N5** — ❌ Per-page data fetched in layouts (layouts persist across child navigation).
- **N6** — ❌ Nested `try/catch` in place of `error.tsx` for recoverable segment errors.

## Verifier — most common violations → VETO

| Symptom | Rule |
|---|---|
| `middleware.ts` present in a Next.js 16 app | RP1/N1 |
| Page/layout reads `session` only from `proxy.ts`, no DAL check | RP2/N3 |
| Database or network call inside `proxy.ts` | RP3 |
| `params.slug` used without `await` | RP5/N4 |
| `error.tsx` without `'use client'` | RP6 |
| `pages/_app.tsx` or `_document.tsx` in an App Router project | N2 |
