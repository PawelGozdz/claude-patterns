# Golden Rule Endpoints — Rule Card

**Tags**: "api:api-surface", "api:authz"
<!-- Egzekwowalne streszczenie golden-rule-endpoints.md (ADR-0071).
     Pełny wzorzec: golden-rule-endpoints.md -->

**Layer**: Architecture
**Status**: Production (4 contexts compliant: Quick Jobs, Local Shares, Service Offerings, Events)
**Source**: golden-rule-endpoints.md

## MUST
- **GR1** — `GET /{resource}` (no `/my`) is **public**: optional auth, filtered to
  `moderation_status='approved'` + `status IN (posted/active)`.
- **GR2** — `GET /{resource}/my` and `/{resource}/my/{sub}` **require auth** and return the
  owner's resources across **all** statuses (DRAFT, PENDING, REJECTED) — filtered only by
  `owner_id = userId`, no moderation/status filter.
- **GR3** — Register `/my` **before** `@Get(':id')` in the controller — otherwise NestJS
  matches `my` as the `:id` param and the `/my` route never fires.
- **GR4** — `/my` handlers read `userId` from `requestContext.getUserIdOrFail()` (JWT/context),
  never from query params or request body (see dual-identity-pattern.md).
- **GR5** — Public list handlers apply defense-in-depth: DB filter (Layer 1) **and** a
  visibility specification (Layer 2, e.g. `EventVisibilitySpecification`).

## MUST NOT
- **N1** — ❌ Apply the public visibility specification inside a `/my` handler — visibility
  specs are for public endpoints only; an owner sees everything regardless of status.
- **N2** — ❌ Read `userId` from request context inside a **public** handler — public handlers
  take no user identity.
- **N3** — ❌ Use a query param (`?organizerId=<id>`) instead of a `/my` route for "my resources".
- **N4** — ❌ Add a `moderation_status`/`status` filter to the owner (`findByUserId`) repository
  query — that would hide the owner's own drafts/pending/rejected items.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ Any REST resource with both a public listing and an owner-sees-everything listing.
- ✅ Deciding route order/auth for `/{resource}`, `/{resource}/my`, `/{resource}/:id`.
- ❌ Endpoints with no owner-scoped variant (pure public/reference data).
- ❌ Admin/moderator role-based visibility beyond owner-vs-public.
- ❌ Query-param-based "mine" filters.

## Verifier — najczęstsze naruszenia
| Symptom w kodzie | Złamana reguła |
|---|---|
| `@Get(':resourceId')` zadeklarowany PRZED `@Get('my')` | GR3 |
| `visibilitySpec.isSatisfiedBy(...)` w handlerze `/my` | N1 |
| `requestContext.getUserId()` w handlerze publicznym | N2 |
| `?organizerId=` zamiast `/my` | N3 |
| `findByUserId` z dodatkowym `where('status', ...)` | N4 |

**Pełny wzorzec**: [`golden-rule-endpoints.md`](./golden-rule-endpoints.md)
