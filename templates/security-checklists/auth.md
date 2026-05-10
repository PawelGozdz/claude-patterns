# Auth checklist — augment when task has auth/login/session/permission labels

> Appended to task when canonical-labels matches `auth` group. Inherits all
> universal items (`security-checklists/universal.md`) — these are
> auth-specific additions on top.

## Authentication flow

- [ ] **Server-side identity verification** — every protected endpoint
  re-validates session/JWT against backing store (Redis, DB), not just
  signature
- [ ] **Session token rotation on auth event** — login, password change,
  permission grant/revoke all rotate tokens; old tokens invalidated
- [ ] **Brute-force protection** — rate limit per IP + per username
  (independent counters); 5xx fail-closed when limit backend down
- [ ] **No password / token / secret in logs** — verify logger
  redaction covers `password`, `token`, `Authorization`, `cookie` headers
- [ ] **Timing-safe comparisons** — password/token validation uses
  `crypto.timingSafeEqual`, not `===`

## Authorization (permissions)

- [ ] **`@RequirePermissions` with `PolicyBuilder.must(spec)`** — never
  inline `if (user.role === 'admin')` checks in handlers
- [ ] **Permission cached safely** — if cached, cache invalidated on
  role/permission change events
- [ ] **Defense in depth** — controller-level + handler-level checks (don't
  rely solely on guard if handler can be invoked from another path)

## Session security

- [ ] **HttpOnly + Secure cookies** — session cookies use `httpOnly: true,
  secure: true, sameSite: 'lax'` minimum
- [ ] **CSRF protection** — state-changing endpoints validate CSRF token
  or use SameSite=strict
- [ ] **Session timeout** — idle timeout configured (typical 30m for B2C,
  15m for B2G/sensitive)
- [ ] **Logout invalidates server-side session** — not just clears client
  cookie

## B2G additions (when label includes `b2g`)

- [ ] **MFA required for elevated roles** — admin / urzędnik accounts MUST
  have 2FA (KSC compliance)
- [ ] **Login audit Tier-1** — every successful login + failed login emits
  audit event with IP, user-agent, outcome
- [ ] **Polish-language error messages** — "Nieprawidłowy login lub hasło"
  not "Invalid credentials" for public-facing flows
