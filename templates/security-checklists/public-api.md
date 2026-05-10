# Public API checklist — augment when task adds public-facing endpoints

> Appended to task when canonical-labels matches `public_api` group
> (api, endpoint, public, b2c, public-facing). Inherits universal items.

## Anti-abuse

- [ ] **Rate limit per IP + per user** — both counters; IP for
  unauthenticated, user for authenticated. Tier-aware (free vs paid)
- [ ] **Request size limits** — body, query string, header lengths
  capped; reject 413 before parsing
- [ ] **Slow-loris / connection limits** — proxy/server timeout
  configured (typical 10-30s); long-poll endpoints explicitly
  whitelisted with own limit
- [ ] **CAPTCHA on signup / public forms** — when no auth + no
  rate-limit-by-user, add CAPTCHA or proof-of-work
- [ ] **Bot detection signals logged** — User-Agent anomalies,
  JA3 fingerprint (if available), IP reputation feed integration

## Input validation

- [ ] **Zod schema on every endpoint** — body, query, params; no
  raw `req.body` access in handler
- [ ] **Output schema validation** — sensitive endpoints (search,
  list) have explicit response schema; prevent accidental leak of
  PII fields
- [ ] **No SQL injection** — Kysely query builder or parameterized
  queries; raw SQL forbidden in repositories

## Response hygiene

- [ ] **No internal IDs leaking** — UUIDs OK, sequential IDs (1, 2, 3)
  reveal scale + are IDOR-prone. Use opaque IDs externally
- [ ] **Pagination caps** — `limit` parameter capped (e.g., max 100);
  reject larger or silently clamp + warn
- [ ] **CORS headers explicit** — only declared origins allowed;
  no `Access-Control-Allow-Origin: *` for authenticated endpoints

## Anti-fingerprinting

- [ ] **Generic error responses for enumeration vectors** — login
  ("Nieprawidłowy login lub hasło", same for both wrong user and
  wrong password); password reset (always 200, regardless if user
  exists)
- [ ] **Timing-safe responses** — DB lookups have constant-time-ish
  paths to avoid timing oracle
