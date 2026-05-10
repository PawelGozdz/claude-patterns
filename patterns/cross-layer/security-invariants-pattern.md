# Security Invariants Pattern

**Version**: 1.0
**Last Updated**: 2026-05-10
**Status**: PRODUCTION
**Priority**: CRITICAL
**Primary Users**: domain-application-implementer, infrastructure-testing-implementer, code-quality-verifier, security-e2e-verifier

---

## 🎯 Problem

**Security defects discovered late in the development cycle**

Without a project-wide checklist of universally-applicable invariants, every
implementation task re-derives security expectations from scratch. The result:
recurring classes of vulnerabilities slip past code review and surface only
in `security-e2e-verifier` (Phase 4B) — or worse, in production.

This pattern lists the **5 invariants every NestJS-DDD implementation must
respect**, regardless of feature scope. They apply to controllers, handlers,
services, repositories, and any code that touches HTTP, persistence, or
logging.

This pattern is **always-included** for `nestjs-ddd` projects via
`patterns/_stack-defaults/nestjs-ddd.yml` — the orchestrator passes it to
every implementer prompt.

---

## ✅ The 5 Invariants

### Invariant 1 — No `userId` in request body schemas

**Rule**: Zod request body schemas at controller boundaries MUST NOT contain
a `userId` field. The user identity comes from the authenticated request
context, never from client-provided input.

**Why**: accepting `userId` from request body opens IDOR (Insecure Direct
Object Reference) vulnerabilities — a malicious client can act on behalf of
any other user by simply submitting a different ID.

**Wrong**:
```typescript
const CreateProfileSchema = z.object({
  userId: z.string().uuid(),     // ❌ NEVER accept from body
  displayName: z.string(),
  bio: z.string().optional(),
});
```

**Right**:
```typescript
const CreateProfileSchema = z.object({
  // userId NOT here — extracted from authenticated context
  displayName: z.string(),
  bio: z.string().optional(),
});

@Post()
async create(
  @Body() dto: CreateProfileDto,
  @CurrentUser() user: AuthenticatedUser,   // ✅ from auth context
) {
  return this.commandBus.execute(
    new CreateProfileCommand({ userId: user.id, ...dto })
  );
}
```

**Hook enforcement**: `check-patterns-read.js` blocks Write on controller
files (`*.controller.ts`) if this pattern was not read recently.

---

### Invariant 2 — Every controller endpoint has `@Auth()` or `@Public()`

**Rule**: Every controller method MUST be decorated with either `@Auth()`
(authenticated, optionally with `@RequirePermissions(...)`) or `@Public()`
(intentionally unauthenticated, with a comment justifying why).

**Why**: missing decorator falls through to the project default (typically
"deny"), but that default has been silently flipped to "allow" in multiple
production incidents. Explicit decorator removes the ambiguity.

**Wrong**:
```typescript
@Controller('profiles')
export class ProfileController {
  @Get(':id')
  async getProfile(@Param('id') id: string) {   // ❌ no auth decorator
    return this.queryBus.execute(new GetProfileQuery({ id }));
  }
}
```

**Right**:
```typescript
@Controller('profiles')
export class ProfileController {
  @Get(':id')
  @Auth()
  @RequirePermissions('profile:read')
  async getProfile(@Param('id') id: string) {
    return this.queryBus.execute(new GetProfileQuery({ id }));
  }

  @Get('/public/health')
  @Public()  // intentional: liveness probe for load balancer
  async health() {
    return { status: 'ok' };
  }
}
```

**Code-quality verifier check**: `code-quality-verifier` rejects PRs where
any controller method lacks an explicit auth decorator.

---

### Invariant 3 — Rate limit fail-closed

**Rule**: When the rate-limit backend (Redis, in-memory store) is
unavailable, the rate-limit guard MUST throw a 503 (Service Unavailable)
— NEVER fail-open by allowing the request through.

**Why**: fail-open lets attackers bypass rate limiting by inducing backend
downtime (e.g., overwhelming Redis with their own load). Fail-closed
preserves the invariant under all conditions.

**Wrong**:
```typescript
@Injectable()
export class RateLimitGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const exceeded = await this.rateLimiter.check(...);
      return !exceeded;
    } catch (err) {
      this.logger.warn('rate limit check failed', err);
      return true;   // ❌ fail-open: backend down = no rate limit
    }
  }
}
```

**Right**:
```typescript
@Injectable()
export class RateLimitGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const exceeded = await this.rateLimiter.check(...);
      return !exceeded;
    } catch (err) {
      this.logger.error('rate limit backend unavailable', err);
      throw new ServiceUnavailableException(
        'Rate limit backend unavailable'   // ✅ fail-closed
      );
    }
  }
}
```

---

### Invariant 4 — No `error.message` in HTTP responses

**Rule**: HTTP response bodies MUST NEVER contain raw `error.message` or
`error.stack` from infrastructure errors. Map to safe, generic user-facing
messages via the error mapper.

**Why**: infrastructure error messages leak internal schema (table names,
column names, constraint names), driver-specific text (Kysely, Postgres,
Redis identifiers), and sometimes credentials in connection strings. See
`safe-error-propagation-pattern.md` for full taxonomy.

**Wrong**:
```typescript
@Catch()
export class ErrorMapper implements ExceptionFilter {
  catch(error: Error, host: ArgumentsHost) {
    response.status(500).json({
      error: error.message,   // ❌ leaks internals
    });
  }
}
```

**Right**:
```typescript
@Catch()
export class ErrorMapper implements ExceptionFilter {
  catch(error: Error, host: ArgumentsHost) {
    if (error instanceof DomainError) {
      response.status(400).json({
        error: error.code,                  // safe enum
        message: error.userFacingMessage,   // pre-sanitized
      });
      return;
    }
    // Infrastructure / unknown errors → generic message
    this.logger.error('unhandled error', error);   // full detail to logs only
    response.status(500).json({
      error: 'INTERNAL_ERROR',              // ✅ no error.message
      message: 'An unexpected error occurred',
    });
  }
}
```

**Pattern reference**: see `cross-layer/safe-error-propagation-pattern.md`
for the full error mapping discipline.

---

### Invariant 5 — No PII in logger calls

**Rule**: Logger calls (`logger.info`, `logger.warn`, `logger.error`) MUST
NOT include raw PII fields: `email`, `phoneNumber`, full names, geographic
coordinates (lat/lng), street addresses, IP addresses, payment method
details, or government IDs (PESEL, NIP, SSN, TERYT raw input).

**Why**: logs frequently flow to retention systems (Splunk, Loki, CloudWatch)
with longer retention than primary data stores, broader access (DevOps,
SREs), and weaker access controls. PII in logs is a GDPR/CCPA compliance
violation by default.

**Wrong**:
```typescript
this.logger.info('user login', {
  email: user.email,           // ❌ PII
  ipAddress: req.ip,           // ❌ PII (under GDPR)
  coordinates: user.location,  // ❌ PII (geo)
});
```

**Right**:
```typescript
this.logger.info('user login', {
  userId: user.id,                          // ✅ opaque ID
  emailHash: sha256(user.email),            // ✅ hashed for correlation
  ipPrefix: req.ip.split('.').slice(0, 2).join('.') + '.x.x',  // ✅ truncated
  // coordinates: omit entirely or bucket to city-level
});
```

**Pattern reference**: see `cross-layer/logger-pattern.md` for the full
PII filtering discipline and approved transformations.

---

## 🚨 Anti-patterns

| Anti-pattern | Why bad | Correct approach |
|---|---|---|
| `userId` in body validated by Zod | IDOR risk | Extract from auth context |
| Default endpoint with no decorator | Implicit policy drift | Always explicit `@Auth()` or `@Public()` |
| Try/catch returning `true` in guard | Fail-open under stress | Throw 503, fail-closed |
| `JSON.stringify(error)` in response | Leaks internals | Map to safe code + message |
| `logger.info({ user })` spread | Spreads PII silently | Pick fields explicitly |

---

## 🔗 Related patterns

- `cross-layer/safe-error-propagation-pattern.md` — error message hygiene
- `cross-layer/domain-errors-pattern.md` — domain error taxonomy
- `cross-layer/logger-pattern.md` — structured logging + PII filters
- `cross-layer/conventions-pattern.md` — naming and file conventions

## 🔗 Related agents

- `code-quality-verifier` — checks invariants 1, 2, 4, 5 statically
- `security-e2e-verifier` — VETO gate for invariant 3 (rate limit fail-closed) and integration coverage of 1-5

---

## 📋 Implementation Checklist

Before marking any controller, handler, service, or repository implementation
complete, verify:

- [ ] Zod schemas at HTTP boundary do NOT contain `userId` field
- [ ] Every controller method has explicit `@Auth()` or `@Public()` (with reason)
- [ ] Rate-limit guards throw 503 on backend unavailability
- [ ] Error mapper returns generic codes + sanitized messages (no `error.message`)
- [ ] Logger calls do NOT spread objects containing PII; PII is hashed/truncated/omitted
