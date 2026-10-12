# Security Headers & CSP (Next.js) — Rule Card

**Tags**: "web:security", "web:platform:nextjs"

**Layer**: Cross-Layer · **Applies to**: `next.config.ts` (`headers()`), `proxy.ts`, root
layout, third-party script integrations

## MUST

- **CS1** — Pick the CSP mode on purpose: static (`next.config`, keeps static rendering, needs
  `'unsafe-inline'`) or nonce (`proxy.ts`, strict, forces dynamic rendering).
- **CS2** — A nonce is unique per request and unpredictable; generated in `proxy.ts`, never
  at build time or hard-coded.
- **CS3** — Nonce CSP means every page is dynamic; pages without request-time APIs opt in with
  `await connection()`.
- **CS4** — Nonce CSP is not combined with Partial Prerendering.
- **CS5** — `'unsafe-eval'` appears in development only.
- **CS6** — `object-src 'none'`, `base-uri 'self'`, `frame-ancestors` and `form-action` are explicit.
- **CS7** — Third-party scripts under a nonce receive the nonce, and their exact hosts are added
  to `script-src` / `connect-src` / `img-src`.
- **CS8** — The `proxy.ts` matcher excludes prefetch requests and static assets.
- **CS9** — CSP is set by exactly one mechanism; any header set by a reverse proxy or CDN is set
  in one place only.
- **CS10** — Key pages are loaded in a browser and asserted to produce no CSP violations.

## MUST NOT

- **N1** — ❌ Nonce CSP on statically generated pages without `connection()`.
- **N2** — ❌ `'unsafe-inline'` while expecting nonce strictness.
- **N3** — ❌ `script-src *` or CDN wildcards.
- **N4** — ❌ CSP in both `next.config` and `proxy.ts`.
- **N5** — ❌ Using CSP as a replacement for sanitisation or access control.

## Verifier — most common violations -> VETO

| Symptom | Rule |
|---|---|
| Nonce computed outside a per-request function | CS2 |
| `'unsafe-eval'` without a development guard | CS5 |
| Nonce CSP and static CSP both configured | CS9/N4 |
| `script-src` contains `*` or a wildcard host | N3 |
| Nonce CSP with `experimental.ppr` / cacheComponents shell | CS4 |
| Scripts blocked on a static page in production | CS3/N1 |
| Missing `frame-ancestors` / `object-src` / `base-uri` | CS6 |
