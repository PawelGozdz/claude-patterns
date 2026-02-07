# E2E Hybrid Fixture Pattern

**Pattern Type**: Testing Pattern
**Layer**: E2E (L3)
**Introduced**: TS-TEST-001 Week 2 (2025-01-08)
**Status**: ACTIVE

## Problem

E2E tests need to balance:
1. **Realistic flows** - Test complete user journeys via HTTP
2. **Test performance** - Avoid unnecessary HTTP calls for setup
3. **Test isolation** - Clean state between tests
4. **Side effects** - Wait for async handlers (BullMQ, Redis cache)

Using ONLY fixtures is too fast but misses integration issues. Using ONLY HTTP is too slow and hits rate limits.

## Solution

**Hybrid approach**: HTTP for what you test, fixtures for setup/verification.

```
┌─────────────────────────────────────────────────────┐
│ Test Lifecycle                                      │
├─────────────────────────────────────────────────────┤
│ Setup:    Fixtures (fast)                           │
│ Act:      HTTP (realistic)                          │
│ Verify:   Database/fixtures (fast)                  │
│ Cleanup:  DatabaseCleaner + Redis                   │
└─────────────────────────────────────────────────────┘
```

**5 Key Patterns**:

## Pattern 1: HTTP User Registration

For auth/authorization tests verifying registration flow:

```typescript
import request from 'supertest';

describe('Authorization E2E', () => {
  let context: TestAppContext;
  let testUser: any;
  let authToken: string;

  beforeEach(async () => {
    await context.cleaner.cleanAll();

    // HTTP registration for REAL flow
    const email = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`;
    const registerResponse = await request(context.app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Test123!@#' })
      .expect(201);

    testUser = registerResponse.body.data.user;
    authToken = registerResponse.body.data.accessToken;
  });

  it('should grant custom permission', async () => {
    // Test endpoint with real user
    await request(context.app.getHttpServer())
      .post('/authorization/permissions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ action: 'read', subject: 'JobRequest' })
      .expect(201);
  });
});
```

**When**: Auth, authorization, email verification tests
**Why**: Tests complete registration including rate limiting, security operations

## Pattern 2: Fixture Helper Classes

For modifying state after HTTP creation:

```typescript
import { UserIdentityFixtureClass } from '@test/shared/fixtures/auth';
import { DatabaseService } from '@shared/database/database.service';

describe('Email Verification E2E', () => {
  it('should allow password change after email verified', async () => {
    // 1. HTTP registration (realistic)
    const registerResponse = await request(context.app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'test@test.com', password: 'Test123!@#' })
      .expect(201);

    const userId = registerResponse.body.data.user.id;
    const authToken = registerResponse.body.data.accessToken;

    // 2. Fixture helper for state change (fast)
    const db = context.app.get(DatabaseService).getDatabase();
    await UserIdentityFixtureClass.markEmailVerified(db, userId);

    // 3. Test protected endpoint
    await request(context.app.getHttpServer())
      .post('/auth/password-change')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ currentPassword: 'Test123!@#', newPassword: 'New123!@#' })
      .expect(200);
  });
});
```

**When**: Need specific state (verified, suspended, etc.) without full HTTP flow
**Why**: Avoids slow email verification flow for every test

## Pattern 3: Manual Database Queries

For verification without re-fetching via HTTP:

```typescript
import { DatabaseService } from '@shared/database/database.service';

describe('Security Operations E2E', () => {
  it('should create security operation record', async () => {
    // Act: HTTP call
    const response = await request(context.app.getHttpServer())
      .post('/auth/password-change')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ currentPassword: 'Test123!@#', newPassword: 'New456!@#' })
      .expect(200);

    const operationId = response.body.data.operationId;

    // Verify: Direct database query (fast)
    const result = await context.dbClient.query(
      'SELECT operation_data FROM security_operations WHERE id = $1',
      [operationId]
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].operation_data.action).toBe('PASSWORD_CHANGE');
  });
});
```

**Alternative**: Kysely ORM (recommended)

```typescript
const db = context.app.get(DatabaseService).getDatabase();
const user = await db
  .selectFrom('users')
  .select(['email_verified', 'verification_level'])
  .where('id', '=', userId)
  .executeTakeFirst();

expect(user?.email_verified).toBe(true);
expect(user?.verification_level).toBe(2);
```

**When**: Need to verify database state, extract JSONB data
**Why**: Faster than HTTP GET, direct access to database state

## Pattern 4: Redis Cache Management

For tests depending on cache:

```typescript
import { RedisTestHelper } from '@test/shared/redis-test.helper';

describe('Authorization Cache E2E', () => {
  beforeEach(async () => {
    await context.cleaner.cleanAll();

    // Clear Redis cache for test isolation
    await RedisTestHelper.clearVerificationLevelCache(context.app);
  });

  it('should update cache after verification level change', async () => {
    // Create user
    const user = await creators.createUser();

    // Change verification level
    await request(context.app.getHttpServer())
      .post('/geographic-auth/capabilities/address-validation')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ addressProof: 'utility_bill.pdf' })
      .expect(201);

    // Wait for async handler
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify cache updated
    const cached = await RedisTestHelper.getVerificationLevel(context.app, user.id);
    expect(cached).toBe(2);
  });
});
```

**Helpers**:
- `clearVerificationLevelCache()` - Clear verification level cache
- `clearAuthCache()` - Clear authentication cache
- `clearAll()` - Clear all Redis databases

**When**: Tests fail due to stale cache, verification level changes
**Why**: Ensures test isolation, prevents false failures

## Pattern 5: Async Event Handler Timing

For BullMQ/async event completion:

```typescript
describe('Email Verification E2E', () => {
  it('should generate verification token after registration', async () => {
    // Act: HTTP registration
    const registerResponse = await request(context.app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'test@test.com', password: 'Test123!@#' })
      .expect(201);

    const userId = registerResponse.body.data.user.id;

    // Wait for async handler (BullMQ)
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify: Database query
    const userRecord = await context.dbClient.query(
      'SELECT email_verification_token FROM users WHERE id = $1',
      [userId]
    );

    expect(userRecord.rows[0].email_verification_token).toBeDefined();
  });

  it('should update verification level after multiple operations', async () => {
    // Sequential operations
    await request(context.app.getHttpServer())
      .post('/geographic-auth/capabilities/address-validation')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(201);

    // Wait longer for sequential handlers
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify level updated
    const db = context.app.get(DatabaseService).getDatabase();
    const user = await db
      .selectFrom('users')
      .select(['verification_level'])
      .where('id', '=', userId)
      .executeTakeFirst();

    expect(user?.verification_level).toBe(3);
  });
});
```

**Timing Guidelines**:
- 200ms: Simple operations (email token, single handler)
- 500ms+: Sequential operations (verification → level update → cache)
- Pattern: HTTP request → delay → verify side effects

**Why**: BullMQ handlers are async, need time to complete before verification

## Pattern 6: Concurrent Operation Testing

For race conditions and business locks:

```typescript
describe('Security Operation Lock E2E', () => {
  it('should prevent concurrent password changes', async () => {
    // Prepare: Two concurrent requests
    const payload = {
      currentPassword: 'Test123!@#',
      newPassword: 'New456!@#'
    };

    const request1 = request(context.app.getHttpServer())
      .post('/auth/password-change')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload);

    const request2 = request(context.app.getHttpServer())
      .post('/auth/password-change')
      .set('Authorization', `Bearer ${authToken}`)
      .send(payload);

    // Act: Execute concurrently
    const [r1, r2] = await Promise.all([request1, request2]);

    // Assert: One succeeds, one fails
    const successful = [r1, r2].filter(r => r.status === 200);
    const conflict = [r1, r2].filter(r => r.status === 409);

    expect(successful.length).toBe(1); // One wins
    expect(conflict.length).toBe(1);   // One 409 Conflict
  });
});
```

**When**: Testing SecurityOperationLockService, concurrent modifications
**Pattern**: Promise.all() + filter responses by status code

## Decision Tree

```
What are you testing?
├─ Auth registration flow?
│   → Pattern 1: HTTP User Registration
│
├─ Need specific user state?
│   → Pattern 2: Fixture Helper Classes
│
├─ Verify database state?
│   → Pattern 3: Manual Database Queries
│
├─ Cache-dependent behavior?
│   → Pattern 4: Redis Cache Management
│
├─ Async event side effects?
│   → Pattern 5: Async Event Handler Timing
│
└─ Race conditions/locks?
    → Pattern 6: Concurrent Operation Testing
```

## Related Patterns

- [Test Seeding Performance Guide](./test-seeding-performance-guide.md) - "Fixture what you DON'T test"
- [Context Isolation Pattern](./context-isolation-pattern.md) - DatabaseCleaner usage
- [Testing Pyramid Pattern](./testing-pyramid-pattern.md) - L3 E2E layer

## References

**Examples**:
- `src/app/api/auth/auth-advanced.e2e.spec.ts` - HTTP registration pattern
- `src/app/api/auth/auth-core.e2e.spec.ts` - Fixture helpers
- `src/app/api/authorization/authorization.e2e.spec.ts` - Redis cache
- `src/app/api/authorization/authorization-rate-limits.e2e.spec.ts` - Concurrent testing

**Helpers**:
- `test/shared/fixtures/auth/user-identity-fixture-class.ts` - Fixture helper
- `test/shared/redis-test.helper.ts` - Redis cache management
- `test/shared/nestjs-test-setup.ts` - DatabaseCleaner

**ADRs**:
- ADR-0035: Specification-First Testing Strategy
- TS-TEST-001: Hybrid Fixture System Implementation

## Anti-Patterns

❌ **DON'T** use ONLY fixtures (misses integration issues)
```typescript
// ❌ WRONG - Never touches HTTP layer
const user = UserIdentityFixtureClass.create(db, { email: 'test@test.com' });
await PermissionFixtureClass.grant(db, user.id, 'read', 'JobRequest');
// Test passes but HTTP layer never tested!
```

❌ **DON'T** use ONLY HTTP (too slow, rate limits)
```typescript
// ❌ WRONG - Every test does full registration flow
beforeEach(async () => {
  await request(app).post('/auth/register').send(...).expect(201);
  await request(app).post('/auth/verify-email').send(...).expect(200);
  await request(app).post('/geographic-auth/register-residence').send(...).expect(201);
  // 3+ HTTP calls PER TEST = slow suite
});
```

❌ **DON'T** forget to wait for async handlers
```typescript
// ❌ WRONG - Async handler not complete
await request(app).post('/auth/register').send(...).expect(201);
const user = await db.selectFrom('users').where('email', '=', email).executeTakeFirst();
expect(user.email_verification_token).toBeDefined(); // FAILS - handler not done yet
```

## Best Practices

✅ **DO** use HTTP for what you're testing
```typescript
// ✅ CORRECT - Test HTTP registration
const response = await request(app).post('/auth/register').send(...).expect(201);
```

✅ **DO** use fixtures for setup/verification
```typescript
// ✅ CORRECT - Fast state setup
await UserIdentityFixtureClass.markEmailVerified(db, userId);
```

✅ **DO** wait for async handlers
```typescript
// ✅ CORRECT - Allow time for BullMQ
await new Promise(resolve => setTimeout(resolve, 200));
```

✅ **DO** clear Redis between tests
```typescript
// ✅ CORRECT - Test isolation
beforeEach(async () => {
  await context.cleaner.cleanAll();
  await RedisTestHelper.clearVerificationLevelCache(context.app);
});
```

## Summary

**Hybrid Fixture Pattern = Speed + Realism**

1. **Setup**: Fixtures (fast)
2. **Act**: HTTP (realistic)
3. **Verify**: Database/fixtures (fast)
4. **Wait**: Async handlers (timing)
5. **Clean**: Database + Redis (isolation)

**Result**: Fast E2E suite that tests real integration points.
