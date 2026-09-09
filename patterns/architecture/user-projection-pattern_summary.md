# User Projection — Rule Card

**Tags**: "api:data-access:projection", "api:app:cross-context"
<!-- Egzekwowalne streszczenie user-projection-pattern.md. Pełny wzorzec: user-projection-pattern.md -->

**Layer**: Architecture
**Status**: Production (3 contexts implemented)
**Source**: user-projection-pattern.md

## MUST
- **UP1** — Create a dedicated `{context}_users` table **per context** that needs user data —
  never a shared cross-context `users` join.
- **UP2** — Include **only** the fields this context actually needs (GDPR minimization) — not a
  full copy of the auth user record.
- **UP3** — Add `synced_at TIMESTAMPTZ` to track eventual-consistency lag.
- **UP4** — Enforce `UNIQUE(user_id)` — exactly one projection row per auth user.
- **UP5** — Subscribe to at least `UserRegistered` and `UserDeleted` integration events to keep
  the projection in sync.
- **UP6** — Make event handlers **idempotent** — check existence before `INSERT` (replays and
  retries must not duplicate or error).
- **UP7** — Use THIN event handlers that delegate to THICK command handlers under
  `@Transactional` — the handler itself does no direct persistence logic.
- **UP8** — Point internal FKs at the local projection table, not at the source `users` table.

## MUST NOT
- **N1** — ❌ Store PII the context doesn't need — a GDPR minimization violation.
- **N2** — ❌ JOIN across `users` and `{context}_users` in queries — read from the local
  projection only (Anti-Pattern 1).
- **N3** — ❌ Use `@EventHandler` (synchronous) for projection sync — use the async
  integration-event path; synchronous execution risks blocking/coupling.
- **N4** — ❌ Throw exceptions from the projection's event handler — breaks event processing for
  the whole batch/queue.
- **N5** — ❌ Store password hashes or other auth-context-only secrets outside the auth context.
- **N6** — ❌ Duplicate email/phone into the projection unless a concrete context need requires it.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ A bounded context needs SOME user data (name, avatar) without cross-context JOINs.
- ✅ Discovery/list/display reads that tolerate eventual consistency (see
  cross-context-communication.md Pattern 4).
- ❌ CREATE-time anchoring of user identity or an authz/guardrail decision — use ACL Registry
  (sync) instead; a stale projection is the wrong trade-off there.
- ❌ Full PII replication "just in case" — minimize to the context's actual need.

## Verifier — najczęstsze naruszenia
| Symptom w kodzie | Złamana reguła |
|---|---|
| SQL JOIN `users` ↔ `{context}_users` w repozytorium | N2 |
| `@EventHandler` (sync) zamiast integration event dla sync projekcji | N3 |
| Handler bez sprawdzenia istnienia przed `INSERT` | UP6 |
| `{context}_users` bez `UNIQUE(user_id)` | UP4 |
| Kolumna `password_hash` w projekcji poza auth context | N5 |

**Pełny wzorzec**: [`user-projection-pattern.md`](./user-projection-pattern.md)
