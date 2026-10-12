# Testing (Next.js) — Rule Card

**Tags**: "web:tests", "web:platform:nextjs"

<!-- Executable summary of testing-pattern.md. -->

**Layer**: Testing · **Applies to**: `*.test.ts(x)`, `vitest.config.ts`, `vitest.setup.ts`, `e2e/**`

## MUST

- **TS1** — Use Vitest configured per the official Next.js guide (`@vitejs/plugin-react`,
  `vite-tsconfig-paths`, `jsdom`) as the unit/integration runner (team preference over Jest).
- **TS2** — Unit-test only synchronous Server/Client Components (Vitest does not support async
  Server Components); move async-page logic into DAL/helpers and cover rendering with E2E.
- **TS3** — Mock framework modules (`next/navigation`, `next/cache`) and the DAL module
  (`vi.mock('@/data/contact')`), not the database client.
- **TS4** — Test Server Actions as plain async functions: pass `FormData`, mock the DAL, assert
  the returned state and the DAL call.
- **TS5** — Give authorization paths their own tests: unauthenticated and wrong-owner.
- **TS6** — Assert behaviour (what the user sees, what is returned), not implementation details.
- **TS7** — Use Playwright for critical end-to-end paths (proxy redirects, streaming,
  progressive enhancement); cover edge cases in Vitest.
- **TS8** — Set coverage thresholds in `vitest.config.ts` and enforce them in CI; run Vitest on
  every push and Playwright on PR merge or nightly.

## MUST NOT

- **N1** — ❌ Two unit-test runners (Jest and Vitest) in one repo.
- **N2** — ❌ Unit-testing an async Server Component via `await Page(...)` + `render()`.
- **N3** — ❌ Mocking `fetch` globally; mock the DAL/API client or use MSW.
- **N4** — ❌ Skipping tests for Server Actions (they hold validation and auth logic).
- **N5** — ❌ E2E tests for every edge case.
- **N6** — ❌ Happy-path-only action tests with no authorization case.

## Verifier — most common violations → VETO

| Symptom | Rule |
|---|---|
| `jest.config.*` alongside `vitest.config.*` in one repo | TS1/N1 |
| `render(await Page(...))` of an async Server Component in a unit test | TS2/N2 |
| `vi.mock('@/lib/db')` / ORM client mocked in action tests | TS3 |
| Server Action file with no sibling test | TS4/N4 |
| Action or route with no unauthenticated / wrong-owner test | TS5/N6 |
| No `coverage.thresholds` in `vitest.config.ts` | TS8 |
| `global.fetch = vi.fn()` in component tests | N3 |
