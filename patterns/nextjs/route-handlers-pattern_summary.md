# Route Handlers (Next.js) — Rule Card

**Tags**: "web:api-surface", "web:platform:nextjs"

**Layer**: Cross-Layer · **Applies to**: `app/**/route.ts` — webhooks, external-caller
endpoints, auth-library routes, feeds, downloads

## MUST

- **RH1** — Own-UI mutation is a Server Action. A Route Handler is for an outside caller,
  a webhook, or a custom HTTP contract.
- **RH2** — Every handler authenticates (session or signature), authorizes the resource, and
  validates input at the boundary.
- **RH3** — Return explicit status codes: 401 unauthenticated, 403 forbidden, 404, 400
  invalid, 429 limited.
- **RH4** — Webhooks read the raw body (`request.text()`), verify the signature with a
  constant-time compare (`timingSafeEqual`, equal-length buffers), then parse.
- **RH5** — Webhooks are idempotent (store the event id, skip duplicates) and acknowledge fast;
  heavy work runs asynchronously.
- **RH6** — `GET` handlers are dynamic by default; caching is an explicit decision, and
  per-user data is never cached.
- **RH7** — Route Handlers call DAL functions instead of querying directly.
- **RH8** — CORS uses an explicit origin allow-list for credentialed APIs.
- **RH9** — Errors to the client are stable codes; detail is logged server-side.

## MUST NOT

- **N1** — ❌ `route.ts` just to submit your own form.
- **N2** — ❌ A Server Component calling its own `/api/...` over HTTP.
- **N3** — ❌ Parsing JSON before verifying a signature, or comparing signatures with `===`.
- **N4** — ❌ `Access-Control-Allow-Origin: *` together with cookies.
- **N5** — ❌ Returning `error.message` or a stack trace; assuming a `GET` handler is cached.

## Verifier — most common violations -> VETO

| Symptom | Rule |
|---|---|
| `route.ts` with no session or signature check | RH2 |
| Webhook calls `request.json()` before verifying | RH4/N3 |
| Signature compared with `===` / `==` | RH4/N3 |
| Handler with no input validation | RH2 |
| `Access-Control-Allow-Origin: *` with credentials | RH8/N4 |
| `error.message` in the response body | RH9/N5 |
| `fetch('/api/...')` inside a Server Component | N2/RH7 |
| Webhook with no duplicate-event handling | RH5 |
