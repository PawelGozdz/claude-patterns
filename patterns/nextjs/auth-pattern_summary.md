# Authentication, hand-rolled session (Next.js) — Rule Card

**Tags**: "web:auth", "web:platform:nextjs"

**Layer**: Cross-Layer · **Applies to**: `lib/auth/session.ts`, `data/auth.ts`, `data/users.ts`,
login Server Actions, `proxy.ts` — apps with a hand-rolled cookie/JWT session

## MUST

- **AU1** — The secure check lives in the DAL (`verifySession`, data functions), not in
  `proxy.ts` or a layout. See `auth-boundaries-pattern.md`.
- **AU2** — `cookies()` is awaited (`await cookies()`); the session cookie is set on the server.
- **AU3** — Session cookie: `httpOnly`, `secure`, `sameSite: 'lax'`, `path: '/'`, with
  `expires` or `maxAge`.
- **AU4** — Session payload holds the minimum (user id, role). No email or other PII.
- **AU5** — Session code imports `server-only`, signs with `jose` (`SignJWT`/`jwtVerify`,
  HS256) using `SESSION_SECRET` (from `openssl rand -base64 32`).
- **AU6** — Passwords are hashed and compared server-side inside the DAL; only a safe user
  reference or DTO leaves it.
- **AU7** — Every Server Action and Route Handler re-verifies the session itself.
- **AU8** — Login failures return one generic message ("Invalid email or password").
- **AU9** — `callbackUrl` is validated as a same-site relative path before `redirect()`.
- **AU10** — `proxy.ts` reads the cookie only (no database call).

## MUST NOT

- **N1** — ❌ Auth only in `proxy.ts`, or access gating in a layout (layouts do not re-render on navigation).
- **N2** — ❌ `middleware.ts` for auth — it is `proxy.ts` in Next.js 16.
- **N3** — ❌ Sensitive data or PII in the JWT; tokens in `localStorage`.
- **N4** — ❌ Relying on React `cache()` to dedupe in Server Actions or Route Handlers.
- **N5** — ❌ Sync `cookies()`; revealing whether an email exists; returning the user row with its hash.

## Verifier — most common violations -> VETO

| Symptom | Rule |
|---|---|
| Session check only in `proxy.ts` / `if (!user)` in a layout | AU1/N1 |
| Cookie without `httpOnly`, `secure` or `sameSite` | AU3 |
| `email`/`name` inside `SignJWT` payload | AU4/N3 |
| `bcrypt` import in a Client Component or outside the DAL | AU6 |
| Server Action without a session check or DAL call | AU7 |
| `redirect(formData.get('callbackUrl'))` unvalidated | AU9 |
| DB query inside `proxy.ts` | AU10 |
