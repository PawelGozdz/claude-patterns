# Controller & Schema Pattern (Plain — Fastify Route Handler, No Controller Class)

**Version**: 1.0
**Last Updated**: 2026-09-09
**Tags**: "api:api-surface", "api:security:validation"
**Level**: core
**Layer**: Infrastructure

**Status**: PRODUCTION
**Priority**: HIGH
**Primary Users**: general-purpose (implementation layer), code-quality-verifier

**Counterpart**: [`controller-schema-pattern.md`](./controller-schema-pattern.md) is the NestJS/DDD
variant — `@Controller` classes, `@CurrentUser`/`@RateLimit` decorators, `ICommandBus`/`IQueryBus`
from `@vytches/ddd`, `Result<z.infer<...>>` return types. Use THIS file for a plain Fastify service
with no controller classes and no command/query bus — a route handler function registered directly
on the Fastify instance, Zod parsed inline. Brought in by `blocks/node.yml`; `blocks/zod.yml`'s own
triggers/`layer_contributions` keep the NestJS variant for projects that compose it alongside
`nestjs`/`ddd/core`.

## When to Use

**Use this pattern for:**
- ✅ any Fastify route (`app.get/post/put/delete(...)`) in a plain Node/ESM service — no controller
  classes, no framework DI
- ✅ validating query params, path params or the request body with a Zod schema, inline in the handler
- ✅ centralizing how a failed validation and an unhandled error each become an HTTP response

**Do NOT use for:**
- ❌ a project with NestJS controllers and a command/query bus — use `controller-schema-pattern.md`
- ❌ writing the schemas themselves in a shared module — `zod-schema-validation-pattern.md`
- ❌ rate limiting — `rate-limit-guard-pattern.md`
- ❌ what the handler does once input is valid (the actual query/write) — `repository-pattern-plain.md`

---

## 🎯 Problem

**No controller class means the NestJS pattern's decorators have nothing to attach to**

A plain Fastify service has no `@Controller`, no `@CurrentUser`, no `AuthEndpointSchema` decorator
generating OpenAPI docs and wiring error handling automatically — there is no framework machinery to
decorate. Two failure modes show up when a project without that machinery still needs the same
guarantees (validate before touching data, never leak an internal error message, one authentication
check per route family):

- **Validation scattered ad-hoc per route**, each with its own error shape (`{error}`, `{message}`,
  a bare string, a 500 from an uncaught `ZodError`) — a caller cannot rely on one response shape.
- **A caught/thrown error's `.message` copied straight into the HTTP response** — the Fastify default
  error handler does exactly this, which leaks internals (a Postgres constraint name, a stack
  fragment) the moment any handler lets an unexpected error escape.

## ✅ Solution

**A Zod schema per route, `.safeParse()` at the top of the handler, one centralized `setErrorHandler`
for anything a handler didn't catch itself**

```typescript
// src/http/server.ts
import { z } from 'zod';
import Fastify from 'fastify';

const employeesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'value'}: ${issue.message}`).join('; ');
}

export async function buildServer(authz: AuthzService) {
  const app = Fastify();

  // ONE place that decides what an uncaught error may say — never `err.message` for a 5xx.
  app.setErrorHandler((err, req, reply) => {
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (status < 500) return reply.code(status).send({ error: err.message });
    req.log.error({ err }, 'Unhandled error');
    return reply.code(500).send({ error: 'internal' });
  });

  app.get(
    '/v1/employees',
    { preHandler: requireApiKey },
    async (req, reply) => {
      const parsed = employeesQuery.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: formatZodError(parsed.error) });
      }
      const { limit, offset } = parsed.data;
      return authz.listEmployees({ limit, offset });
    },
  );
}
```

A body-validated route follows the identical shape — `.strict()` on the schema so an unknown field is
a 400, never silently dropped or, worse, silently accepted and forwarded:

```typescript
// src/http/secrets-routes.ts
const putBodySchema = z
  .object({
    value: z.string().min(1),
    cas: z.number().int().min(0).optional(),
    expiresAt: z.string().datetime().nullable().optional(),
  })
  .strict();

app.put('/v1/secrets/*', { preHandler: requirePatPrincipal }, async (req, reply) => {
  const body = putBodySchema.safeParse(req.body);
  if (!body.success) {
    return reply.code(400).send({ error: formatZodError(body.error) });
  }
  const result = await store.put(req.params['*'], body.data.value, body.data);
  return reply.code(200).send(result);
});
```

**Why this works**:
- ✅ `schema.safeParse(input)` at the top of the handler, checked before anything else runs — no
  Zod exception ever escapes to the generic error handler, and the 400 body is uniform across routes
- ✅ `.strict()` on every body/query schema — an extra field is a validation error, not silently
  ignored (the same mass-assignment concern the DDD variant's ADR-0020 addresses)
- ✅ One `setErrorHandler`, registered once, is the ONLY place `err.message` may reach an HTTP
  response — every route's own thrown/unexpected errors funnel through it
- ✅ `preHandler` (a plain async function, not a decorator) is where authentication runs — the route
  handler itself starts already knowing the caller is authenticated

---

## 📋 Rules

### MUST

1. **MUST validate every query param, path param and body with a Zod schema**, `.safeParse()` (not
   `.parse()`) at the top of the handler, before any other logic runs.
2. **MUST use `.strict()` on every object schema validating a request body** — an unknown field is a
   400, never silently dropped or forwarded.
3. **MUST return a uniform error shape on a failed `.safeParse()`** — `{ error: string }`, same field
   name across every route in the service.
4. **MUST register exactly one `setErrorHandler`** that decides, in one place, what an uncaught error
   may say back to the caller — client errors (`statusCode < 500`) may echo `err.message` (it is
   framework-generated: malformed JSON, rate limit), a 5xx MUST NOT.
5. **MUST authenticate via `preHandler`**, not inside the route body — the handler function should be
   reachable only after the preHandler has already confirmed the caller's identity.

### MUST NOT

1. **MUST NOT call `schema.parse(input)` (the throwing variant) directly inside a route handler**
   without a surrounding `try/catch` — an uncaught `ZodError` falls through to the generic error
   handler and produces whatever generic shape that handler emits for a 500, not a clean 400.
2. **MUST NOT let a 5xx response body contain `err.message`** — a Postgres constraint name, a stack
   fragment, or any other internal detail must never cross the HTTP boundary on an unexpected error.
3. **MUST NOT accept an untyped/`any` request body and pick fields off it by hand** — the whole point
   of `.safeParse()` returning `parsed.data` is that every field after that line is verified, typed
   input.

---

## ⚠️ Anti-Patterns

### Anti-Pattern 1: Throwing `.parse()` with no surrounding catch

```typescript
// ❌ WRONG — an invalid request throws a ZodError straight into the generic error handler
app.get('/v1/check', async (req) => {
  const { subject, action, resource } = checkQuery.parse(req.query); // throws on invalid input
  return authz.checkAs({ subject, action, resource });
});

// ✅ CORRECT — safeParse, explicit 400, no exception ever escapes
app.get('/v1/check', async (req, reply) => {
  const parsed = checkQuery.safeParse(req.query);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'subject, action and resource are required' });
  }
  return authz.checkAs(parsed.data);
});
```

### Anti-Pattern 2: Forwarding `err.message` on an unexpected error

```typescript
// ❌ WRONG — the Fastify default behavior, leaks internals on any uncaught error
app.setErrorHandler((err, req, reply) => {
  reply.code(err.statusCode ?? 500).send({ error: err.message }); // leaks DB/stack detail on 5xx
});

// ✅ CORRECT — client errors may echo message, server errors never do
app.setErrorHandler((err, req, reply) => {
  const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
  if (status < 500) return reply.code(status).send({ error: err.message });
  req.log.error({ err }, 'Unhandled error');
  return reply.code(500).send({ error: 'internal' });
});
```

### Anti-Pattern 3: Non-strict body schema silently accepting extra fields

```typescript
// ❌ WRONG — an extra field (e.g. { value, projectId: "other" }) parses successfully and can leak
// into a downstream `db.update(parsed.data)`-style call (mass assignment)
const putBodySchema = z.object({ value: z.string().min(1) });

// ✅ CORRECT — .strict() rejects any field the schema doesn't name, with a 400
const putBodySchema = z.object({ value: z.string().min(1) }).strict();
```

---

## 📚 References

### Implementation Files
- `src/http/server.ts` — `setErrorHandler`, `safeParse` + `formatZodError` for query params
  (grounded from `iam`)
- `src/http/secrets-routes.ts` — `.strict()` body schema, `safeParse` for a body-validated route
  (grounded from `iam`)

### Related Patterns
- **controller-schema-pattern.md** — the NestJS/DDD counterpart (`@Controller`, command/query bus)
- **zod-schema-validation-pattern.md** — shared schema-authoring conventions
- **rate-limit-guard-pattern.md** — the `preHandler`/rate-limit config alongside authentication
- **repository-pattern-plain.md** — what the handler calls into once input is valid

---

**Created**: 2026-09-09 · **Grounded in**: `/opt/projects/iam/src/http/server.ts`, `/opt/projects/iam/src/http/secrets-routes.ts`
**Maintained By**: claude-patterns
