# Auth Boundaries (Next.js App Router) — Rule Card

**Tags**: "web:auth", "web:authz", "web:platform:nextjs"

**Layer**: Cross-Layer · **Applies to**: `data/**` (DAL), Server Actions, Route Handlers
(`route.ts`), `proxy.ts`, layouts, Client Component props

## MUST

- **AB1** — The boundary is the server-only DAL. `proxy.ts` and UI gating are optimistic
  and may be bypassed.
- **AB2** — Every Server Action and Route Handler authenticates AND authorizes the specific
  resource (ownership / role), by delegating to the DAL.
- **AB3** — Identity comes from the session, never from client input (`userId`, `role`,
  `isAdmin` params or form fields).
- **AB4** — Data functions return DTOs with only the fields the caller needs, never raw
  database rows.
- **AB5** — Route Handlers return explicit status codes: 401 not authenticated, 403
  authenticated but not allowed.
- **AB6** — `proxy.ts` reads the session cookie only (no database call) and is treated as
  a pre-filter.
- **AB7** — Prefer an auth library over hand-rolled sessions; keep it behind one adapter file.
- **AB8** — `proxy.ts` and `route.ts` are reviewed like public API code (high-risk files).

## MUST NOT

- **N1** — ❌ Auth only in `proxy.ts`.
- **N2** — ❌ `if (!user) return null` in a layout as the access check (layouts do not re-run on
  navigation; nested segments still render).
- **N3** — ❌ An action that trusts `formData.get('userId')`, or checks login but not ownership (IDOR).
- **N4** — ❌ Returning the whole row from an action (leaks into the RSC payload).
- **N5** — ❌ Checking auth only in the page that hosts the action; reading the session by
  hand in every component instead of one DAL function.

## Verifier — most common violations -> VETO

| Symptom | Rule |
|---|---|
| Permission check exists only in `proxy.ts` | AB1/N1 |
| Server Action without DAL call or session check | AB2 |
| Action takes `userId`/`role` from `formData` or arguments | AB3/N3 |
| Action loads a resource by `id` with no ownership comparison | AB2/N3 |
| Action or data function returns an unfiltered row | AB4/N4 |
| Database call inside `proxy.ts` | AB6 |
| `redirect()` for an API consumer instead of 401/403 | AB5 |
