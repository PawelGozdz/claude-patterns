---
name: nextjs-app-router
description: Next.js 16 App Router patterns — Server/Client Components, Cache Components, proxy.ts, Server Actions, data fetching, Tailwind CSS 4, Vitest testing. Activates on TSX/JSX files.
origin: nextjs-16-docs
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/next.config.*"
  - "**/proxy.ts"
---

# Next.js 16 App Router Skill

Production patterns for Next.js 16 with Cache Components, proxy.ts, and React 19.2.

## Core Patterns

| Pattern | When to Use |
|---------|-------------|
| `server-client-components-pattern.md` | Component boundaries, "use cache" |
| `data-fetching-pattern.md` | Caching, revalidation, updateTag |
| `routing-proxy-pattern.md` | Routes, proxy.ts, layouts |
| `forms-actions-pattern.md` | Server Actions, validation, optimistic |
| `auth-pattern.md` | Sessions, proxy.ts guard, CSRF |
| `testing-pattern.md` | Vitest, RTL, Playwright |
| `styling-pattern.md` | Tailwind 4, CSS Modules, View Transitions |

## Quick Rules (Next.js 16 specific)

1. **Server Components are DEFAULT** — no directive needed, "use client" only for interactivity
2. **"use cache"** for caching — replaces old implicit caching, entirely opt-in
3. **proxy.ts** replaces middleware.ts — rename and export `proxy` function
4. **Async APIs** — `await params`, `await searchParams`, `await cookies()`, `await headers()`
5. **revalidateTag(tag, 'max')** — requires cacheLife profile as 2nd argument
6. **updateTag(tag)** in Server Actions — instant cache refresh (read-your-writes)
7. **React Compiler** handles memoization — do NOT use manual useMemo/useCallback
8. **Turbopack** is default — use Vitest (not Jest) for testing compatibility
9. **Tailwind CSS 4** — `@import 'tailwindcss'`, `@theme` block for tokens

## Anti-Patterns

- "use client" on data-fetching components (use Server Components)
- middleware.ts (deprecated → use proxy.ts)
- revalidateTag() without 2nd argument (requires cacheLife profile)
- Manual useMemo/useCallback (React Compiler does this)
- getStaticProps/getServerSideProps (removed, use "use cache" + async components)
- Sync params/cookies/headers access (must await)
