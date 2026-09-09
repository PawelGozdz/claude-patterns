# Repository Pattern (Plain — Kysely Query Functions, No Aggregates)

**Version**: 1.0
**Last Updated**: 2026-09-09
**Tags**: "api:data-access"
**Level**: core
**Layer**: Infrastructure

**Status**: PRODUCTION
**Priority**: HIGH
**Primary Users**: general-purpose (implementation layer), code-quality-verifier

**Counterpart**: [`repository-pattern.md`](./repository-pattern.md) is the DDD variant — aggregates,
`BaseKyselyRepository`, event-sourcing `eventMap`, optimistic locking via a version column, CQRS
command/query repository classes. Use THIS file for a flat service with no domain layer — Kysely as
a query builder, functions instead of repository classes, no aggregates to reconstruct. Brought in
by `blocks/node.yml`; `blocks/kysely.yml`'s own `always`/triggers keep the DDD variant for projects
that compose it alongside `nestjs`/`ddd/core`.

## When to Use

**Use this pattern for:**
- ✅ any data-access function in a flat service (no `domain/aggregates/`) built on Kysely
- ✅ deciding the shape of a new query/write function: a plain exported `async function`, not a class
- ✅ transactions that span more than one statement (`db.transaction().execute(async (trx) => ...)`)
- ✅ audit-log writes and other cross-cutting inserts that must happen in the SAME transaction as the
  decision they record

**Do NOT use for:**
- ❌ a project with actual DDD aggregates and event sourcing — use `repository-pattern.md` instead
- ❌ schema validation at the HTTP boundary — that is `controller-schema-pattern-plain.md`
- ❌ deciding what is safe to log — that is `safe-error-propagation-pattern.md`

---

## 🎯 Problem

**No aggregates means the DDD repository's whole shape doesn't apply**

A flat service has no `domain/aggregates/` to reconstruct, no `eventMap` to register events into, and
no framework DI container to inject a repository interface into. Copying the DDD repository's shape
anyway (`BaseKyselyRepository extends`, optimistic-locking version joins, a class per aggregate) adds
machinery with nothing underneath it to justify the weight. The real failure modes here are simpler,
and more likely to actually happen:

- **A raw `Kysely<Database>` handed around everywhere with no consistent transaction boundary** —
  each function opens its own implicit transaction, so a multi-statement operation (write + audit
  row) can commit the write and lose the audit row on a crash between them.
- **Query functions returning raw DB rows** (snake_case columns, `Buffer`/`Date` DB types) straight
  to callers instead of a typed, camelCase-shaped return value.

## ✅ Solution

**Plain exported functions taking `Kysely<Database>` (or a `Transaction<Database>`) as a parameter,
multi-statement operations wrapped in `db.transaction().execute(...)`**

```typescript
// src/admin/queries.ts
import type { Kysely } from 'kysely';
import type { Database } from '../core/database/types.js';

export interface EmployeeOption {
  id: string;
  displayName: string;
}

export async function listEmployeesForSelect(db: Kysely<Database>): Promise<EmployeeOption[]> {
  const rows = await db
    .selectFrom('identity.employee')
    .select(['id', 'display_name'])
    .orderBy('display_name')
    .orderBy('id')
    .execute();
  return rows.map((r) => ({ id: r.id, displayName: r.display_name }));
}

export async function findEmployeeById(
  db: Kysely<Database>,
  employeeId: string,
): Promise<EmployeeOption | null> {
  const row = await db
    .selectFrom('identity.employee')
    .select(['id', 'display_name'])
    .where('id', '=', employeeId)
    .executeTakeFirst();
  return row ? { id: row.id, displayName: row.display_name } : null;
}
```

Multi-statement writes that need one atomic outcome — most commonly "do the write, then write the
audit row, both or neither" — go through `db.transaction().execute()`, with a `Transaction<Database>`
parameter type (`trx` below) marking every function that MUST run inside one:

```typescript
// src/secret-store/postgres-store.ts (condensed)
import type { Kysely, Transaction } from 'kysely';

type SecretsTrx = Transaction<SecretsDatabase>;

export class PostgresSecretStore {
  constructor(
    private readonly principal: string,
    private readonly db: Kysely<SecretsDatabase>,
  ) {}

  private async writeAuditRow(trx: SecretsTrx, action: string, path: string, allowed: boolean): Promise<void> {
    await trx.insertInto('identity.audit_log').values({ subject: this.principal, action, resource: `secret:${path}`, allowed }).execute();
  }

  async get(path: string): Promise<SecretGetResult | null> {
    return this.db.transaction().execute(async (trx) => {
      const row = await trx.selectFrom('secrets.secret').selectAll().where('path', '=', path).executeTakeFirst();
      await this.writeAuditRow(trx, 'secret:get', path, Boolean(row));
      return row ? { value: row.ciphertext /* decrypted upstream */, version: row.version } : null;
    });
  }
}
```

**Why this works**:
- ✅ `db: Kysely<Database>` as a plain parameter (constructor or function argument) reads identically
  to a DI-injected field, minus the container — no token, no `@Inject`, no module wiring
- ✅ A class is still fine here (`PostgresSecretStore` above) — the distinguishing line isn't
  "function vs. class", it's **no aggregate, no `BaseKyselyRepository`, no `eventMap`**
- ✅ `db.transaction().execute(async (trx) => ...)` makes the atomic boundary explicit at the call
  site — every statement inside the callback either all commit or all roll back together
- ✅ A dedicated `Transaction<Database>` parameter type on a private helper (`writeAuditRow` above)
  makes "this must run inside an existing transaction, never standalone" a type-level fact, not a
  comment

---

## 📋 Rules

### MUST

1. **MUST take `Kysely<Database>` (or a narrower schema type) as an explicit parameter** — constructor
   argument for a class, first/last argument for a function — never a module-level singleton import
   of the live connection (that makes the function untestable without a real database).
2. **MUST wrap a multi-statement write in `db.transaction().execute(async (trx) => ...)`** whenever
   more than one statement must succeed or fail together (a write plus its audit row is the
   recurring case).
3. **MUST type a function that only runs inside an existing transaction as taking `Transaction<Database>`**,
   not `Kysely<Database>` — the type itself documents "caller must already be inside a transaction."
4. **MUST return a typed, camelCase shape from a query function** — map DB rows (`snake_case`) at the
   boundary, never leak the raw row type past the function that queried it.
5. **MUST use `sql` template literals (from `kysely`) for anything the query builder cannot express**
   (`sql\`now()\``, a computed CAS check) rather than a raw string concatenated into `.where()`.

### MUST NOT

1. **MUST NOT open a query on a global/imported live `Kysely` instance from inside a function that
   also accepts `db` as a parameter** — pick one source of truth per function; a function that
   sometimes uses its parameter and sometimes the module-level singleton is a transaction-boundary
   bug waiting to happen.
2. **MUST NOT `throw` from inside a `db.transaction().execute()` callback to signal an ANTICIPATED
   outcome** (e.g. "access denied", "conflict") if that outcome should still commit its own side
   effect (an audit row) — a thrown error rolls back the WHOLE transaction, including anything the
   callback already wrote earlier in the same block. Return a discriminated result from the callback
   instead, and throw (if at all) after the transaction has committed.
3. **MUST NOT return a raw DB row (snake_case columns, DB-native types) from an exported function** —
   map it to the shape the caller actually needs first.

---

## ⚠️ Anti-Patterns

### Anti-Pattern 1: Module-level singleton connection instead of a parameter

```typescript
// ❌ WRONG — untestable without a real database, no way to run it inside a caller's transaction
import { db } from '../core/database/db.js';

export async function findEmployeeById(employeeId: string) {
  return db.selectFrom('identity.employee').selectAll().where('id', '=', employeeId).executeTakeFirst();
}

// ✅ CORRECT — db is a parameter, a test passes a fake/real Kysely instance, a caller can pass a trx
export async function findEmployeeById(db: Kysely<Database>, employeeId: string) {
  return db.selectFrom('identity.employee').selectAll().where('id', '=', employeeId).executeTakeFirst();
}
```

### Anti-Pattern 2: An anticipated denial throws from inside the transaction and loses its own audit row

```typescript
// ❌ WRONG — the throw rolls back the audit row this SAME callback just wrote
async function put(path: string, value: string) {
  return db.transaction().execute(async (trx) => {
    if (!hasAccess(path)) {
      await writeAuditRow(trx, 'put', path, false); // rolled back by the throw below!
      throw new SecretAccessDeniedError();
    }
    // ...
  });
}

// ✅ CORRECT — return a discriminated outcome, throw AFTER the transaction has committed
async function put(path: string, value: string) {
  const outcome = await db.transaction().execute(async (trx) => {
    if (!hasAccess(path)) {
      await writeAuditRow(trx, 'put', path, false); // commits — the transaction itself succeeds
      return { ok: false as const, reason: 'forbidden' as const };
    }
    // ...
    return { ok: true as const, version: nextVersion };
  });
  if (!outcome.ok) throw new SecretAccessDeniedError();
  return { version: outcome.version };
}
```

### Anti-Pattern 3: Leaking a raw DB row past the query function

```typescript
// ❌ WRONG — caller now depends on snake_case column names and DB-native types
export async function getEmployee(db: Kysely<Database>, id: string) {
  return db.selectFrom('identity.employee').selectAll().where('id', '=', id).executeTakeFirst();
}

// ✅ CORRECT — mapped once, at the boundary
export interface EmployeeOption { id: string; displayName: string }

export async function getEmployee(db: Kysely<Database>, id: string): Promise<EmployeeOption | null> {
  const row = await db.selectFrom('identity.employee').select(['id', 'display_name']).where('id', '=', id).executeTakeFirst();
  return row ? { id: row.id, displayName: row.display_name } : null;
}
```

---

## 📚 References

### Implementation Files
- `src/admin/queries.ts` — plain query functions taking `db: Kysely<Database>` (grounded from `iam`)
- `src/secret-store/postgres-store.ts` — class with constructor-injected `db`, multi-statement
  transactions, discriminated-outcome pattern for anticipated denials (grounded from `iam`)

### Related Patterns
- **repository-pattern.md** — the DDD/aggregate counterpart (`BaseKyselyRepository`, `eventMap`, CQRS)
- **controller-schema-pattern-plain.md** — the HTTP boundary that calls into these functions
- **safe-error-propagation-pattern.md** — what a thrown error from here may say at the HTTP boundary

---

**Created**: 2026-09-09 · **Grounded in**: `/opt/projects/iam/src/admin/queries.ts`, `/opt/projects/iam/src/secret-store/postgres-store.ts`
**Maintained By**: claude-patterns
