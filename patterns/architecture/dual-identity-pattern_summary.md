# Dual Identity — Rule Card

**Tags**: "api:security:identity", "api:authz"
<!-- Egzekwowalne streszczenie dual-identity-pattern.md.
     Pełny wzorzec: dual-identity-pattern.md -->

**Layer**: Architecture
**Status**: Production-enforced (Commands); Query enforcement is KNOWN-INCOMPLETE (ARCH-D001, 22 classes, TECH-DEBT.md)
**Source**: dual-identity-pattern.md

## MUST
- **DI1** — Extract `userId` in the controller with `@CurrentUserId()` (from JWT), never from
  request body/query/path/cookie.
- **DI2** — Pass `userId` as a **Command/Query constructor parameter** set by the controller —
  never re-derived deeper in the stack from an untrusted source.
- **DI3** — Exclude `userId` from Zod request schemas entirely — it is never client input.
- **DI4** — Protect every endpoint using current-user identity with `@Auth()` (validates JWT).
- **DI5** — Use `RequestContextService` for `userId` in non-controller contexts (handlers,
  consumer-helpers).
- **DI6** — Document in the Command/Query JSDoc that `userId` comes from JWT, not client input.
- **DI7** — Apply ALL of the above to **Query classes exactly like Commands** — a `GetMyXQuery`
  is just as much a Dual Identity boundary as `CreateXCommand`; there is no "read-only, so it's
  fine" exception.

## MUST NOT
- **N1** — ❌ Accept `userId` from request body.
- **N2** — ❌ Include `userId` in a Zod schema for POST/PUT/PATCH.
- **N3** — ❌ Trust `userId` from query parameters.
- **N4** — ❌ Trust `userId` from URL path parameters for "current user" operations.
- **N5** — ❌ Trust `userId` from cookies, except the JWT cookie itself (HttpOnly).
- **N6** — ❌ Add `userId` to a **Query class's constructor** "for consistency with the
  Command" when the query is meant to read it from `RequestContextService` inside the handler —
  putting it in the constructor re-opens the hijacking surface one layer later (Anti-Pattern 5,
  the exact shape of the ARCH-D001 debt: 22 Query classes across 5 contexts).

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ Any endpoint/handler that must know "which user is making this request" (current-user
  reads or writes).
- ✅ Both Commands and Queries — no read-only exception.
- ❌ Endpoints acting on an **explicitly targeted other user** by admin/moderator role (that's
  an authorization-spec concern, not identity extraction — don't force it through
  `@CurrentUserId()`).

## Verifier — najczęstsze naruszenia
| Symptom w kodzie | Złamana reguła |
|---|---|
| `userId` pole w Zod schema dla POST/PUT/PATCH | DI3/N2 |
| `@Query('userId')` / `@Param('userId')` w kontrolerze | N3/N4 |
| Query class ma `userId` w konstruktorze zamiast `RequestContextService` w handlerze | N6 |
| Endpoint bez `@Auth()` operujący na "moich" zasobach | DI4 |
| Handler czyta `userId` z cookie innego niż JWT HttpOnly | N5 |

**Pełny wzorzec**: [`dual-identity-pattern.md`](./dual-identity-pattern.md)
