# Pattern: Security Invariants (Plain — No NestJS Decorators)

**Tags**: "api:security", "api:authz"
**Layer**: Cross-layer
**Level**: core
**Status**: experimental

**Counterpart**: [`security-invariants-pattern.md`](./security-invariants-pattern.md) states the same five
invariants with NestJS syntax (`@Auth()`, `@Public()`, `CommandBus`). Use THIS file for a plain Node HTTP
service — Fastify, Express, a webhook worker. Brought in by `blocks/node.yml`; `blocks/nestjs.yml` keeps the
NestJS variant. Derived from the Fastify override that iam wrote for itself (2026-08-24) once the NestJS card
turned out to be unusable there; ai-gateway and ai-os-bot hit the same mismatch.

## What This Is

Five invariants every request-handling change must keep, written without a framework: identity comes from the
trusted boundary, every route declares its guard, security dependencies fail closed, 5xx bodies carry no
internals, logs carry no PII.

## When to Use

**Use this pattern for:**
- ✅ any HTTP route, guard, hook or middleware in a service without NestJS (Fastify, Express, Hono)
- ✅ code that reads the caller's identity, decides access, builds an error response or writes a log line

**Do NOT use for:**
- ❌ a NestJS project with `@Auth()` / `@Public()` decorators — use `security-invariants-pattern.md`
- ❌ error-message hygiene across layers (repository → handler → HTTP) — that is `safe-error-propagation-pattern-plain.md`
- ❌ a service with no inbound HTTP surface (a CLI, a pure consumer) — only invariants 4 and 5 apply

## Implementation

### 1. Identity comes from the trusted boundary, never from the body

The Zod (or any) schema at the HTTP boundary must not accept an actor or subject field. The acting identity is
read from a header set by the gateway / forward-auth, or from the verified token.

```typescript
// ✅ the actor comes ONLY from a header set by the upstream trust boundary
export function extractActorSubject(request: FastifyRequest): string | null {
  const header = request.headers['x-actor-subject'];
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value.trim();
}
```

Wrong: a body schema with `grantedBy: z.string()` used as the actor of an audit column.

### 2. Every route declares its guard

```typescript
// ✅ explicit guard — never rely on a route being "probably" protected
app.get('/v1/check', { preHandler: requireApiKey }, handler);

// ✅ intentionally open, and says so
app.get('/health', async () => ({ status: 'ok' }));
```

A new route with neither a guard nor an "intentionally open" comment is a blocking finding.

### 3. Fail closed

When a security dependency is missing, misconfigured or down (token introspection, rate-limit store), refuse:

```typescript
if (!config.INTROSPECT_CLIENT_ID || !config.INTROSPECT_CLIENT_SECRET) {
  return reply.code(503).send({ error: 'introspection is not configured' }); // not "assume trusted"
}
```

A required secret is checked at boot (refuse to start), not per request with an "allow" fallback.

### 4. No internals in 5xx responses

```typescript
app.setErrorHandler((err: FastifyError, req, reply) => {
  const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
  if (status < 500) {
    req.log.warn({ err: err.message, url: req.url }, 'Request rejected');
    return reply.code(status).send({ error: err.message }); // ✅ client-caused, describes the request
  }
  req.log.error({ err }, 'Unhandled error');
  return reply.code(500).send({ error: 'internal' }); // ✅ static, no error.message
});
```

### 5. No PII in logs

```typescript
// ✅ opaque id and an event name, not the e-mail
logger.info({ event: 'identity.link', employeeId: row.id, matchedBy: 'verified-email' }, 'Linked identity');
```

## Anti-Patterns

- ❌ `userId` / `actor` / `grantedBy` read from `req.body` or `req.query`.
- ❌ A route registered with no `preHandler` and no comment saying it is open.
- ❌ `catch { return true }` in a guard, or a rate limiter that allows traffic when its store is down (fail-open).
- ❌ `reply.code(500).send({ error: err.message })` — leaks driver, table and column names.
- ❌ E-mail, phone number, address or message text in log fields.
