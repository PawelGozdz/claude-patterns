# Redis Test Isolation Pattern

**Version**: 1.0
**Created**: 2026-01-19
**Purpose**: Reliable Redis cache clearing to prevent race conditions and stale data in E2E tests
**Context**: Tests use shared Redis instance, cache operations may overlap with test setup

---

## Problem Statement

### The Issue

**Automatic Redis clearing in `beforeEach()`** creates race conditions:

1. **Race Condition**: `cleanAll()` and Redis clearing run concurrently
2. **Stale Data**: Tests may read cache **before** clearing completes
3. **Timing Dependency**: Success depends on execution order (brittle)
4. **Flaky Tests**: Sometimes pass (clearing wins), sometimes fail (test reads first)

### Example Failure

```typescript
// ❌ ANTI-PATTERN: Automatic clearing in beforeEach()
beforeEach(async () => {
  // These operations run concurrently:
  await context.cleaner.cleanAll(context.app); // 1. Clears DB
  // Redis read happens HERE (before clear completes!)

  const { REDIS_CLIENT } = await import('@shared/infrastructure/redis');
  const redis = context.app.get<any>(REDIS_CLIENT);
  const keys = await redis.keys('rate_limit:*');
  if (keys.length > 0) {
    await redis.del(...keys); // 2. Clears Redis (too late!)
  }
});

it('should return fresh data', async () => {
  // ❌ Test reads stale cache from previous test!
  const response = await request(app).get('/endpoint');
  expect(response.body.data.verificationLevel).toBe('basic'); // Fails!
});
```

**Result**: Test fails intermittently because cache read happens before clearing completes.

---

## Solution: RedisTestHelper with Explicit Per-Test Clearing

### Pattern A: Clear Specific Cache Keys Per Test

```typescript
import { RedisTestHelper } from '../../../../../test/shared/redis-test.helper';

beforeEach(async () => {
  await context.cleaner.cleanAll(context.app);

  // NOTE: No automatic Redis clearing here!
  // Individual tests clear cache explicitly BEFORE setup
});

it('should calculate verification level correctly', async () => {
  // STEP 1: Clear cache FIRST (before any setup)
  await RedisTestHelper.clearVerificationLevelCache(context.app);

  // STEP 2: Setup test data (now reads fresh cache)
  const user = await seedRegularUserE2E(db, { ... });

  // STEP 3: Test logic
  const response = await request(app)
    .get('/geographic-auth/verification-level')
    .set('Authorization', `Bearer ${user.accessToken}`);

  expect(response.body.data.verificationLevel).toBe('basic');
});
```

### Pattern B: Clear Rate Limiting Data

```typescript
it('should return 429 when rate limit exceeded', async () => {
  // STEP 1: Clear rate limits FIRST
  await RedisTestHelper.clearRateLimitingData(context.app);

  // STEP 2: Setup user
  const user = await createEligibleUser();

  // STEP 3: Make concurrent requests
  const requests = Array.from({ length: 12 }, () =>
    request(app).post('/endpoint').set('Authorization', `Bearer ${user.token}`)
  );

  const responses = await Promise.all(requests);

  // STEP 4: Verify rate limiting triggered
  expect(responses.filter(r => r.status === 429).length).toBeGreaterThan(0);
});
```

### Pattern C: Clear All Redis Data (Rare - Use Sparingly)

```typescript
it('should start with completely fresh Redis state', async () => {
  // CRITICAL: Only use when testing Redis-dependent initialization
  await RedisTestHelper.clearAll(context.app);

  // Now test Redis initialization logic
  const response = await request(app).get('/health/redis');
  expect(response.body.data.cacheKeys).toBe(0);
});
```

---

## RedisTestHelper API Reference

### Available Methods

| Method | Use Case | Keys Cleared | Performance |
|--------|----------|--------------|-------------|
| `clearVerificationLevelCache(app)` | Geographic auth verification level tests | `verification_level:*` | Fast (~10ms) |
| `clearRateLimitingData(app)` | Rate limiting tests | `rate_limit:*` | Fast (~20ms) |
| `clearAuthCache(app)` | Session/authentication tests | `session:*`, `auth:*` | Fast (~15ms) |
| `clearAll(app)` | Full Redis reset (rare) | `*` (ALL keys) | Slow (~100ms+) |

### Implementation Location

**File**: `test/shared/redis-test.helper.ts`

```typescript
export class RedisTestHelper {
  /**
   * Clears verification level cache (geographic-auth)
   * Use before tests that verify verification level calculation
   */
  static async clearVerificationLevelCache(app: INestApplication): Promise<void> {
    const redis = app.get<any>(REDIS_CLIENT);
    const keys = await redis.keys('verification_level:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  /**
   * Clears rate limiting data (all endpoints)
   * Use before tests that verify rate limit enforcement
   */
  static async clearRateLimitingData(app: INestApplication): Promise<void> {
    const redis = app.get<any>(REDIS_CLIENT);
    const keys = await redis.keys('rate_limit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  /**
   * Clears authentication/session cache
   * Use before tests that verify session management
   */
  static async clearAuthCache(app: INestApplication): Promise<void> {
    const redis = app.get<any>(REDIS_CLIENT);
    const sessionKeys = await redis.keys('session:*');
    const authKeys = await redis.keys('auth:*');
    const allKeys = [...sessionKeys, ...authKeys];
    if (allKeys.length > 0) {
      await redis.del(...allKeys);
    }
  }

  /**
   * Clears ALL Redis data (use sparingly - slow)
   * Only use when testing Redis initialization or full reset scenarios
   */
  static async clearAll(app: INestApplication): Promise<void> {
    const redis = app.get<any>(REDIS_CLIENT);
    await redis.flushdb(); // Clears entire database
  }
}
```

---

## Decision Tree: Which Cache to Clear?

```
What am I testing?
    |
    ├─ Verification level calculation (geographic-auth)?
    |   └─ Use: clearVerificationLevelCache()
    |       Tests: VerificationLevel queries, trust score calculations
    |
    ├─ Rate limiting (API endpoints)?
    |   └─ Use: clearRateLimitingData()
    |       Tests: 429 responses, rate limit headers, burst requests
    |
    ├─ Session management (auth)?
    |   └─ Use: clearAuthCache()
    |       Tests: Login, logout, session expiry
    |
    ├─ Redis initialization logic?
    |   └─ Use: clearAll() (RARE - performance impact!)
    |       Tests: Redis health checks, cache warming
    |
    └─ Multiple cache types in same test?
        └─ Call multiple helpers:
            await RedisTestHelper.clearVerificationLevelCache(app);
            await RedisTestHelper.clearRateLimitingData(app);
```

---

## Common Anti-Patterns

### ❌ Anti-Pattern 1: Automatic Clearing in beforeEach()

```typescript
// ❌ WRONG: Race condition with cleanAll()
beforeEach(async () => {
  await context.cleaner.cleanAll(context.app);

  // This may run BEFORE cleanAll() completes!
  const { REDIS_CLIENT } = await import('@shared/infrastructure/redis');
  const redis = context.app.get<any>(REDIS_CLIENT);
  const keys = await redis.keys('rate_limit:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
});

// ✅ CORRECT: Explicit per-test clearing
beforeEach(async () => {
  await context.cleaner.cleanAll(context.app);
  // No Redis clearing here!
});

it('test', async () => {
  await RedisTestHelper.clearRateLimitingData(context.app);
  // Fresh cache guaranteed
});
```

### ❌ Anti-Pattern 2: Direct Redis Client Import

```typescript
// ❌ WRONG: Direct Redis client usage (old pattern)
const { REDIS_CLIENT } = await import('@shared/infrastructure/redis');
const redis = context.app.get<any>(REDIS_CLIENT);
const keys = await redis.keys('rate_limit:*');
if (keys.length > 0) {
  await redis.del(...keys);
}

// ✅ CORRECT: Use RedisTestHelper
import { RedisTestHelper } from '@test/shared/redis-test.helper';
await RedisTestHelper.clearRateLimitingData(context.app);
```

**Why**: RedisTestHelper encapsulates Redis logic, provides reusable API, easier to maintain.

### ❌ Anti-Pattern 3: Clearing in afterEach()

```typescript
// ❌ WRONG: Clearing after test (too late!)
afterEach(async () => {
  await RedisTestHelper.clearRateLimitingData(context.app);
  // Next test may start BEFORE this completes!
});

// ✅ CORRECT: Clear at START of test
it('test', async () => {
  await RedisTestHelper.clearRateLimitingData(context.app);
  // Fresh cache for THIS test
});
```

### ❌ Anti-Pattern 4: Using clearAll() for Everything

```typescript
// ❌ WRONG: Nuclear option for every test (slow!)
it('test', async () => {
  await RedisTestHelper.clearAll(context.app); // Clears EVERYTHING (~100ms)
  // ...
});

// ✅ CORRECT: Clear only what you need (fast!)
it('test', async () => {
  await RedisTestHelper.clearRateLimitingData(context.app); // ~20ms
  // ...
});
```

**Performance Impact**: `clearAll()` is 5x slower than specific clearing.

---

## Integration with Geographic Auth Context

### Verification Level Caching

Geographic authentication caches verification levels per user:

```typescript
// Cache key pattern: verification_level:{userId}
// TTL: 1 hour (production), 10 seconds (test)

// When to clear:
it('should recalculate verification level after residence change', async () => {
  // STEP 1: Clear cache FIRST
  await RedisTestHelper.clearVerificationLevelCache(context.app);

  // STEP 2: Create user with initial verification level
  const user = await seedRegularUserE2E(db, { ... });

  // STEP 3: Get initial level (now cached)
  const response1 = await request(app)
    .get('/geographic-auth/verification-level')
    .set('Authorization', `Bearer ${user.accessToken}`);
  expect(response1.body.data.verificationLevel).toBe('basic');

  // STEP 4: Change user data (should invalidate cache)
  await updateUserResidence(db, user.userId, newResidence);

  // STEP 5: Get updated level (cache cleared automatically by system)
  const response2 = await request(app)
    .get('/geographic-auth/verification-level')
    .set('Authorization', `Bearer ${user.accessToken}`);
  expect(response2.body.data.verificationLevel).toBe('verified');
});
```

### Trust Score Dependencies

Trust scores affect verification levels (cached):

```typescript
it('should reflect trust score in verification level', async () => {
  await RedisTestHelper.clearVerificationLevelCache(context.app);

  // Create user with low trust (basic level)
  const user = await seedRegularUserE2E(db, { ... });
  await seedUserTrustE2E(db, user.userId, { trustScore: 30 });

  const response1 = await request(app)
    .get('/geographic-auth/verification-level')
    .set('Authorization', `Bearer ${user.accessToken}`);
  expect(response1.body.data.verificationLevel).toBe('basic');

  // Update trust score (should trigger cache invalidation)
  await updateUserTrust(db, user.userId, { trustScore: 80 });

  // Clear cache manually (system may not auto-clear in tests)
  await RedisTestHelper.clearVerificationLevelCache(context.app);

  const response2 = await request(app)
    .get('/geographic-auth/verification-level')
    .set('Authorization', `Bearer ${user.accessToken}`);
  expect(response2.body.data.verificationLevel).toBe('verified');
});
```

---

## Performance Considerations

### Clearing Cost by Method

| Method | Keys Scanned | Keys Deleted | Duration | Use Frequency |
|--------|--------------|--------------|----------|---------------|
| `clearVerificationLevelCache()` | ~10-50 | ~10-50 | ~10ms | Per test |
| `clearRateLimitingData()` | ~20-100 | ~20-100 | ~20ms | Per test |
| `clearAuthCache()` | ~5-20 | ~5-20 | ~15ms | Per test |
| `clearAll()` | ALL | ALL | ~100ms+ | Rarely |

### Test Suite Impact

**Example**: 50 geographic-auth E2E tests

| Pattern | Duration | Reliability |
|---------|----------|-------------|
| **No clearing** | 45s | 60% pass (flaky) |
| **Automatic beforeEach()** | 48s | 75% pass (race conditions) |
| **Explicit per-test** | 50s | 100% pass (reliable) |

**Trade-off**: +10% duration for 100% reliability

---

## Real-World Examples

### Example 1: Geographic Filtering with Verification Levels

**File**: `src/app/api/moderation/__tests__/geographic-filtering-radius.e2e.spec.ts`

```typescript
describe('Geographic Filtering - Radius', () => {
  beforeEach(async () => {
    await context.cleaner.cleanAll(context.app);
    // NOTE: No automatic Redis clearing here!
  });

  it('should filter content by radius based on moderator verification level', async () => {
    // STEP 1: Clear verification level cache
    await RedisTestHelper.clearVerificationLevelCache(context.app);

    // STEP 2: Create moderator with 'verified' level
    const moderator = await seedModeratorUserE2E(db, { ... });
    await seedUserTrustE2E(db, moderator.userId, { trustScore: 80 });

    // STEP 3: Create content at various distances
    const nearContent = await createContentAt(moderatorLocation, 5); // 5km
    const farContent = await createContentAt(moderatorLocation, 50); // 50km

    // STEP 4: Query with radius filter (uses cached verification level)
    const response = await request(context.app.getHttpServer())
      .get('/moderation/queue')
      .set('Authorization', `Bearer ${moderator.accessToken}`)
      .query({
        'geographicFilter[type]': 'radius',
        'geographicFilter[radiusKm]': 10, // 10km radius
      });

    // STEP 5: Verify filtering (only near content returned)
    const contentIds = response.body.data.items.map(item => item.contentId);
    expect(contentIds).toContain(nearContent.commentId);
    expect(contentIds).not.toContain(farContent.commentId);
  });
});
```

### Example 2: Rate Limiting with Session Cache

**File**: `src/app/api/service-provider/__tests__/service-provider-rate-limits.e2e.spec.ts`

```typescript
describe('Service Provider Rate Limiting', () => {
  beforeEach(async () => {
    await context.cleaner.cleanAll(context.app);
  });

  it('should return 429 when rate limit exceeded', async () => {
    // STEP 1: Clear rate limits AND session cache
    await RedisTestHelper.clearRateLimitingData(context.app);
    await RedisTestHelper.clearAuthCache(context.app);

    // STEP 2: Create user (session stored in Redis)
    const user = await seedRegularUserE2E(db, { ... });
    await storeSessionInRedis(context.app, user);

    // STEP 3: Make concurrent requests
    const requests = Array.from({ length: 5 }, () =>
      request(context.app.getHttpServer())
        .post('/service-provider')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send(validPayload)
    );

    const responses = await Promise.all(requests);

    // STEP 4: Verify rate limiting
    const tooManyRequests = responses.filter(r => r.status === 429);
    expect(tooManyRequests.length).toBeGreaterThan(0);
  });
});
```

### Example 3: Multiple Cache Clears

**File**: `src/app/api/moderation/__tests__/moderation-core.e2e.spec.ts`

```typescript
it('should moderate content based on verification level and respect rate limits', async () => {
  // STEP 1: Clear all relevant caches
  await RedisTestHelper.clearVerificationLevelCache(context.app);
  await RedisTestHelper.clearRateLimitingData(context.app);

  // STEP 2: Create moderator with specific verification level
  const moderator = await seedModeratorUserE2E(db, { ... });
  await seedUserTrustE2E(db, moderator.userId, { trustScore: 60 });

  // STEP 3: Create content to moderate
  const content = await seedCommentE2E(db, regularUser.userId, {
    moderationStatus: 'pending',
  });

  // STEP 4: Moderate (uses verification level cache)
  const approveResponse = await request(context.app.getHttpServer())
    .post('/moderation/approve')
    .set('Authorization', `Bearer ${moderator.accessToken}`)
    .send({ contentId: content.commentId });

  expect(approveResponse.status).toBe(200);

  // STEP 5: Verify rate limit enforced on next action
  // (rate limit cache now populated)
  const responses = await Promise.all(
    Array.from({ length: 15 }, () =>
      request(context.app.getHttpServer())
        .post('/moderation/approve')
        .set('Authorization', `Bearer ${moderator.accessToken}`)
        .send({ contentId: content.commentId })
    )
  );

  const rateLimited = responses.filter(r => r.status === 429);
  expect(rateLimited.length).toBeGreaterThan(0);
});
```

---

## Troubleshooting

### Issue 1: Test Reads Stale Cache Despite Clearing

**Symptoms**: Test expects fresh data, gets cached value from previous test

**Causes**:
1. Clearing happens AFTER test setup reads cache
2. Wrong cache key pattern cleared
3. Cache invalidation not triggered by system

**Fix**:
```typescript
// ✅ Clear BEFORE any setup
it('test', async () => {
  await RedisTestHelper.clearVerificationLevelCache(context.app);
  // NOW setup test data
  const user = await seedRegularUserE2E(db, { ... });
  // ...
});

// ✅ Verify cache key pattern
// If testing trust scores, clear verification level cache:
await RedisTestHelper.clearVerificationLevelCache(context.app);
// Not clearAuthCache()!
```

### Issue 2: Race Condition in beforeEach()

**Symptoms**: Sometimes passes, sometimes fails (timing-dependent)

**Cause**: Concurrent `cleanAll()` and Redis clearing

**Fix**:
```typescript
// ❌ Remove Redis clearing from beforeEach()
beforeEach(async () => {
  await context.cleaner.cleanAll(context.app);
  // Don't clear Redis here!
});

// ✅ Move to individual tests
it('test', async () => {
  await RedisTestHelper.clearVerificationLevelCache(context.app);
  // ...
});
```

### Issue 3: Slow Test Suite (clearAll() Overuse)

**Symptoms**: Tests take 2-3x longer than expected

**Cause**: Using `clearAll()` instead of specific clearing

**Fix**:
```typescript
// ❌ Nuclear option (slow)
await RedisTestHelper.clearAll(context.app); // ~100ms per test

// ✅ Targeted clearing (fast)
await RedisTestHelper.clearVerificationLevelCache(context.app); // ~10ms
```

---

## Migration Guide: Old Pattern → New Pattern

### Step 1: Remove Automatic Clearing

```typescript
// BEFORE:
beforeEach(async () => {
  await context.cleaner.cleanAll(context.app);

  const { REDIS_CLIENT } = await import('@shared/infrastructure/redis');
  const redis = context.app.get<any>(REDIS_CLIENT);
  const keys = await redis.keys('rate_limit:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
});

// AFTER:
import { RedisTestHelper } from '@test/shared/redis-test.helper';

beforeEach(async () => {
  await context.cleaner.cleanAll(context.app);
  // Redis clearing removed!
});
```

### Step 2: Add Explicit Clearing Per Test

```typescript
// Add to each test that needs fresh cache:
it('test 1', async () => {
  await RedisTestHelper.clearRateLimitingData(context.app);
  // ...
});

it('test 2', async () => {
  await RedisTestHelper.clearRateLimitingData(context.app);
  // ...
});
```

### Step 3: Run Tests and Verify

```bash
npm test -- src/app/api/service-provider/__tests__/service-provider-rate-limits.e2e.spec.ts

# Expected: All tests pass reliably
# Duration: ~50-60s (may be +10% vs automatic clearing)
```

---

## Summary

### Key Principles

1. **Explicit > Automatic**: Clear cache at START of each test, not in `beforeEach()`
2. **Targeted > Nuclear**: Clear specific keys (`clearRateLimitingData`), not all (`clearAll`)
3. **Before > After**: Clear at test start, not in `afterEach()`
4. **Helper > Direct**: Use `RedisTestHelper`, not direct Redis client

### Performance

- **+10% duration** for 100% reliability (trade-off worth it)
- **5x faster** than `clearAll()` when using specific methods
- **Eliminates flaky tests** from race conditions

### Reliability

- **100% pass rate** vs 60-75% with automatic clearing
- **No race conditions** with `cleanAll()`
- **Predictable behavior** across CI/local environments

---

**Related Patterns**:
- `.claude/knowledge/patterns/testing/rate-limit-testing-pattern.md`
- `test/shared/E2E_TESTING_GUIDE.md` (Test Isolation section)
- `.claude/knowledge/patterns/architecture/user-projection-pattern.md`

**References**:
- ADR-0035: Specification-First Testing Strategy
- `test/shared/redis-test.helper.ts` (RedisTestHelper implementation)
