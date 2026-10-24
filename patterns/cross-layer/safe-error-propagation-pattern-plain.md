# Pattern: Safe Error Propagation (Plain — No Result Type, No Mapper Classes)

**Tags**: "api:security", "api:api-surface:errors"
**Layer**: Cross-layer
**Level**: core
**Status**: experimental

**Counterpart**: [`safe-error-propagation-pattern.md`](./safe-error-propagation-pattern.md) is the NestJS/DDD
variant (`BaseKyselyRepository`, `Result.fail`, `*-error.mapper.ts`, guardian tests). Use THIS file for a plain
Node service where errors are thrown or returned by ordinary functions and one HTTP error handler turns them
into responses. Brought in by `blocks/node.yml`.

## What This Is

Raw error text (driver messages, table and column names, SQL, stack traces, third-party responses) never travels
outward. It is logged once on the server, and callers receive a new error with static text.

## When to Use

**Use this pattern for:**
- ✅ code that catches an error from a database, an HTTP client, a queue or a SDK and decides what to do with it
- ✅ the error handler of a Fastify / Express service and any function that builds an error response body

**Do NOT use for:**
- ❌ a NestJS project with `Result<T, E>` and error mappers — use `safe-error-propagation-pattern.md`
- ❌ the caller-facing rules about identity, guards and PII — that is `security-invariants-pattern-plain.md`
- ❌ validation errors that describe the request itself (Zod issues, malformed JSON): echoing those is correct

## Implementation

### 1. The data-access layer throws a generic error; the raw error goes to `cause`

```typescript
export class DataAccessError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`Data access failed: ${operation}`); // ✅ static text, no table, column or SQL
    this.name = 'DataAccessError';
    this.cause = cause; // raw driver error stays here, readable by the server log only
  }
}

export async function findUser(db: Db, id: string): Promise<UserRow | undefined> {
  try {
    return await db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
  } catch (err) {
    throw new DataAccessError('findUser', err);
  }
}
```

### 2. The layer that handles the failure logs the raw error first, then returns a generic one

```typescript
try {
  await sms.send(phone, code);
} catch (err) {
  logger.error({ err, event: 'sms.send_failed' }, 'SMS provider failed'); // ✅ raw error stays server-side
  throw new DeliveryUnavailableError(); // ✅ new error with static text
}
```

### 3. Only controlled-content errors pass through unchanged

Your own error classes with static text and validation errors may be re-thrown or returned as they are. Anything
that wraps a driver, SDK or HTTP-client error must be converted first (steps 1–2).

### 4. The HTTP error handler is the last line of defence

```typescript
app.setErrorHandler((err, req, reply) => {
  const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
  if (status < 500) return reply.code(status).send({ error: err.message }); // request-caused
  req.log.error({ err }, 'Unhandled error');
  return reply.code(500).send({ error: 'internal' }); // ✅ static
});
```

When a code → message table exists, its `default:` branch has its OWN generic message. A `default:` that falls
through to a neighbouring `case` silently hands a future error code the wrong text.

## Anti-Patterns

- ❌ `throw new AppError(`Failed: ${err.message}`)` — interpolates raw text into a new error.
- ❌ `throw new AppError(err.message)` — passes the raw text through.
- ❌ A static factory `AppError.from(details: string)` that puts `details` into the message.
- ❌ `reply.code(500).send({ error: err.message })`.
- ❌ `catch (e) { return fail(makeError(e.message)) }` — a catch block logs internally and returns a NEW generic error.
