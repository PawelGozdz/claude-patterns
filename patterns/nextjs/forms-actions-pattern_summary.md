# Forms & Server Actions (Next.js) — Rule Card

**Tags**: "web:ui:forms", "web:platform:nextjs"

**Layer**: Cross-Layer · **Applies to**: `app/**/actions/*.ts`, files with `'use server'`, form
components using `useActionState` / `useOptimistic`

## MUST

- **FA1** — A Server Action is a public POST endpoint: authenticate AND authorize inside it
  (via the DAL), see `auth-boundaries-pattern.md`.
- **FA2** — Take identity from the session inside the server-only DAL, never from `FormData`
  or action arguments.
- **FA3** — Persist through named DAL functions (e.g. `createContactMessage` from
  `@/data/contact`), not a DB client called in the action.
- **FA4** — Validate every input on the server (Zod or similar); client validation is UX only.
- **FA5** — Return state (`{ errors }` / `{ success }`) instead of throwing; return only what the
  UI needs, not DB rows.
- **FA6** — Invalidate after every write: `updateTag` in Server Actions (read-your-own-writes);
  `revalidatePath` / `refresh` when the response must re-render.
- **FA7** — Call revalidation BEFORE `redirect()`; `redirect()` throws and later code never runs.
- **FA8** — Use `useActionState`; keep `"use server"` in action files or inline async functions.
- **FA9** — Behind a proxy with a different host, set `serverActions.allowedOrigins`; raise
  `serverActions.bodySizeLimit` (default 1MB) only deliberately.

## MUST NOT

- **N1** — ❌ `route.ts` for forms/mutations from your own UI (webhooks and external clients
  stay Route Handlers, `route-handlers-pattern.md`).
- **N2** — ❌ `"use server"` on a component.
- **N3** — ❌ `Promise.all` over Server Actions from the client (dispatched one at a time).
- **N4** — ❌ Calling a Server Action in `useEffect`, or a stale-while-revalidate
  `revalidateTag(tag, profile)` when the user must see the write at once.

## Verifier — most common violations → VETO

| Symptom | Rule |
|---|---|
| Action with no session/ownership check (directly or via DAL) | FA1/FA2 |
| `userId` read from `FormData` or arguments | FA2 |
| `db.*` / ORM client called inside the action file | FA3 |
| Action without schema validation | FA4 |
| Action returns a DB row or throws for validation errors | FA5 |
| Mutation without `updateTag`/revalidation, or revalidation after `redirect()` | FA6/FA7 |
| `route.ts` receiving a form from the app's own UI | N1 |
