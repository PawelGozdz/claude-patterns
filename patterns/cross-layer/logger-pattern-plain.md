# Logger Pattern (Plain — Module-Level Singleton, No DI)

**Version**: 1.0
**Last Updated**: 2026-09-09
**Tags**: "api:observability:logging"
**Level**: core
**Layer**: Cross-Layer

**Status**: PRODUCTION
**Priority**: HIGH
**Primary Users**: general-purpose (implementation layer), code-quality-verifier

**Counterpart**: [`logger-pattern.md`](./logger-pattern.md) is the NestJS/DI variant (`LOGGER_SERVICE`
token, `@Inject`, child-logger-via-constructor). Use THIS file for a plain Node/ESM service with no
dependency-injection container — Fastify, Express, a worker, a CLI. Brought in by `blocks/node.yml`;
`blocks/nestjs.yml` keeps the DI variant.

## When to Use

**Use this pattern for:**
- ✅ any plain Node/ESM service or script with no dependency-injection container (Fastify, Express, a background worker, a CLI)
- ✅ the one root logger instance for the whole process, and every per-module named child built from it

**Do NOT use for:**
- ❌ a project with an actual DI container resolving constructor arguments (NestJS) — use `logger-pattern.md` instead
- ❌ deciding what is safe to log vs. must never cross an HTTP boundary — that is `safe-error-propagation-pattern.md`

---

## 🎯 Problem

**No DI container means no injection token to hang a logger off**

A plain Node/ESM service has no framework-managed constructor injection, so the NestJS pattern's
whole premise (`@Inject(LOGGER_SERVICE)`, a `LoggerModule` provider, a Symbol token surviving
TypeScript's interface erasure) doesn't apply — there is nothing to inject INTO. Two failure modes
show up when a project without DI still copies that pattern's shape, or goes the other way and
free-instantiates loggers everywhere:

- **`new SomeLogger()` scattered per-file**: every module wires its own instance, configuration
  (level, transport, redaction) drifts file-to-file, and nothing is shared for correlation.
- **Copying the DI pattern anyway**: a Symbol token and a "provider" with no container to resolve
  it against is dead ceremony — it doesn't get you test-injection or a container-managed singleton,
  because there is no container.

## ✅ Solution

**One root logger instance, per-module named children, imported directly**

```typescript
// src/core/logger.ts
import pino from 'pino';

const isDev = process.env['NODE_ENV'] !== 'production';

export const rootLogger = pino({
  level: isDev ? 'debug' : 'info',
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,
});

export function createLogger(name: string): pino.Logger {
  return rootLogger.child({ name });
}
```

Every other module imports `createLogger` and names its own child once, at module scope:

```typescript
// src/identity/authz.ts
import { createLogger } from '../core/logger.js';

const logger = createLogger('authz');

export async function checkAs(input: CheckInput, credential: CredentialContext) {
  logger.debug({ subject: input.subject, action: input.action }, 'evaluating check');
  // ...
}
```

**Why this works**:
- ✅ One `pino` instance (`rootLogger`) — shared config, shared transport, no per-file drift
- ✅ `createLogger(name)` gives every module a named child (`{name}` field on every line) without a
  container — it's a plain function call, not an injection
- ✅ Structured logging (pino's native shape: `logger.debug({ ...fields }, 'message')`) — same
  discipline as the DI variant, without the DI machinery
- ✅ Module-scope singleton per file (`const logger = createLogger('authz')` once, at the top) reads
  identically to a DI-injected field, minus the constructor boilerplate

---

## 📋 Rules

### MUST

1. **MUST have exactly one root logger instance** for the whole process (`src/core/logger.ts` or
   equivalent) — every other module builds a named child from it, never a second root.
2. **MUST create a named child per module**, once, at module scope: `const logger = createLogger('<module>')`.
3. **MUST log structured fields as the first argument**, message as the second: `logger.error({ err, userId }, 'failed to X')` — never string concatenation.
4. **MUST NOT log PII/secrets** in the fields object — redact or omit before the call (no
   framework-level auto-redaction exists here; it is the caller's job every time).

### MUST NOT

1. **MUST NOT instantiate a second root logger** (`pino()` called more than once) — defeats shared
   config and breaks correlation.
2. **MUST NOT use `console.log`/`console.error`** in request-path or service code — unstructured, no
   level filtering, bypasses whatever transport the root logger is configured with.
3. **MUST NOT pass an interface/token expecting DI resolution** — there is no container; a plain
   function call (`createLogger(name)`) is correct, not a workaround.

---

## ⚠️ Anti-Patterns

### Anti-Pattern 1: Ad-hoc `console.log`

```typescript
// ❌ WRONG
console.log('Rejected request without a valid API key', request.url);

// ✅ CORRECT
logger.warn({ url: request.url, ip: request.ip }, 'Rejected request without a valid API key');
```

### Anti-Pattern 2: Per-file root logger

```typescript
// ❌ WRONG — every file gets its own pino instance, config drifts
import pino from 'pino';
const logger = pino({ level: 'info' });

// ✅ CORRECT — one shared root, named child per module
import { createLogger } from '../core/logger.js';
const logger = createLogger('my-module');
```

### Anti-Pattern 3: Copying the DI token pattern with nothing to resolve it

```typescript
// ❌ WRONG — a Symbol token with no container is ceremony, not a pattern
export const LOGGER_TOKEN = Symbol('logger');
constructor(@SomeDecorator(LOGGER_TOKEN) private logger: Logger) {} // no DI framework present

// ✅ CORRECT — plain import, plain call
import { createLogger } from '../core/logger.js';
const logger = createLogger(MyClass.name);
```

---

## 📚 References

### Implementation Files
- `src/core/logger.ts` — root pino instance + `createLogger(name)` factory (grounded from `iam`)

### Related Patterns
- **logger-pattern.md** — the DI/NestJS counterpart (`LOGGER_SERVICE` token, `@Inject`)
- **safe-error-propagation-pattern.md** — what is safe to log vs. what must never cross an HTTP boundary
- **security-invariants-pattern.md** (or its project-local Fastify override) — PII-in-logs invariant

---

**Created**: 2026-09-09 · **Grounded in**: `/opt/projects/iam/src/core/logger.ts`
**Maintained By**: claude-patterns
