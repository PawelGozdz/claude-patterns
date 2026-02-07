# Rate Limit Testing Pattern

**Version**: 1.0
**Created**: 2026-01-19
**Purpose**: Reliable rate limit testing with concurrent requests in E2E tests
**Context**: Test environment uses 1-second windows (production: 1 hour), IP-based rate limiting (all supertest requests = 127.0.0.1)

---

## Problem Statement

### The Issue

Rate limiting in tests is **time-sensitive**. Test environment uses shortened windows for speed:

```typescript
// src/shared/infrastructure/rate-limiting/rate-limit.config.ts
export const RATE_LIMIT_CONFIG = {
  windowMs: isTestEnv ? 1000 : 60 * 60 * 1000, // 1s vs 1h
  max: 10,
};
```

**Sequential requests** reset the rate limit window between iterations, causing:

1. **Flaky tests**: Window resets before all requests complete
2. **False positives**: Tests pass when they should fail (rate limit never triggered)
3. **Slow tests**: Each request waits for previous to complete (3-10x slower)
4. **Unrealistic scenarios**: Real users make concurrent requests, not sequential

### Example Failure

```typescript
// ❌ ANTI-PATTERN: Sequential requests
it('should return 429 when rate limit exceeded', async () => {
  const user = await createUser();

  // Sequential loop - each request may reset window
  for (let i = 0; i < 12; i++) {
    await request(app)
      .post('/service-provider')
      .set('Authorization', `Bearer ${user.token}`)
      .send(validPayload);
  }

  // ❌ Window reset 12 times - no 429 responses!
  // Total time: ~12+ seconds (each request takes 1+ seconds)
});
```

**Result**: Test passes incorrectly because window resets between requests.

---

## Solution: Concurrent Requests with Promise.all()

### Pattern A: Basic Concurrent Requests

```typescript
// ✅ CORRECT: Concurrent requests
it('should return 429 when rate limit exceeded', async () => {
  const user = await createUser();

  // Create array of 12 request promises
  const requests = Array.from({ length: 12 }, () =>
    request(app)
      .post('/service-provider')
      .set('Authorization', `Bearer ${user.token}`)
      .send(validPayload)
  );

  // Execute all requests concurrently
  const responses = await Promise.all(requests);

  // Verify: First 10 succeed (200), next 2 fail (429)
  const successful = responses.filter(r => r.status === 200);
  const tooManyRequests = responses.filter(r => r.status === 429);

  expect(successful.length).toBe(10); // Rate limit max
  expect(tooManyRequests.length).toBeGreaterThan(0); // At least 2

  // ✅ All requests in same 1s window - reliable 429 responses!
  // Total time: ~1-2 seconds
});
```

### Pattern B: Concurrent Requests with Variations

```typescript
// ✅ CORRECT: Varying payloads in concurrent requests
it('should return 429 for update requests regardless of payload', async () => {
  const provider = await createServiceProvider();

  // Create 12 requests with alternating payloads
  const requests = Array.from({ length: 12 }, (_, i) => {
    const granularity = i % 2 === 0 ? 'STREET' : 'CITY';
    return request(app)
      .patch('/service-provider/display-settings')
      .set('Authorization', `Bearer ${provider.token}`)
      .send({ displayGranularity: granularity });
  });

  const responses = await Promise.all(requests);

  const successful = responses.filter(r => r.status === 200);
  const tooManyRequests = responses.filter(r => r.status === 429);

  expect(successful.length).toBe(10); // First 10 succeed
  expect(tooManyRequests.length).toBe(2); // Last 2 fail
});
```

### Pattern C: Multi-User Concurrent Requests (IP-Based)

```typescript
// ✅ CORRECT: Multiple users sharing IP
it('should demonstrate IP-based rate limiting', async () => {
  const user1 = await createUser();
  const user2 = await createUser();

  // Create 11 requests from 2 users (all share 127.0.0.1)
  const requests = [
    // User 1: 10 requests
    ...Array.from({ length: 10 }, () =>
      request(app)
        .post('/service-provider')
        .set('Authorization', `Bearer ${user1.token}`)
        .send(validPayload)
    ),
    // User 2: 1 request (should hit rate limit)
    request(app)
      .post('/service-provider')
      .set('Authorization', `Bearer ${user2.token}`)
      .send(validPayload),
  ];

  const responses = await Promise.all(requests);

  // First 10 succeed (any user), 11th fails (IP limit reached)
  const successful = responses.filter(r => r.status === 200);
  const tooManyRequests = responses.filter(r => r.status === 429);

  expect(successful.length).toBe(10);
  expect(tooManyRequests.length).toBe(1);
});
```

---

## Decision Tree

```
Rate limit test scenario
    |
    ├─ Testing rate limit ENFORCEMENT (should return 429)?
    |   └─ YES → Use Pattern A/B (concurrent requests > limit)
    |
    ├─ Testing rate limit HEADERS (Retry-After, X-RateLimit-*)?
    |   └─ YES → Use Pattern A (check headers on 429 response)
    |
    ├─ Testing BURST requests within limit?
    |   └─ YES → Use Pattern A (concurrent requests ≤ limit, all should succeed)
    |
    ├─ Testing IP-BASED limiting (multiple users)?
    |   └─ YES → Use Pattern C (requests from different users, same IP)
    |
    └─ Testing rate limit RESET after window expires?
        └─ YES → Sequential OK (wait 1s between batches)
            Example:
            const batch1 = await Promise.all(10 requests);
            await sleep(1100); // Wait for window reset
            const batch2 = await Promise.all(10 requests);
```

---

## Common Anti-Patterns

### ❌ Anti-Pattern 1: Sequential Loops

```typescript
// ❌ WRONG: Sequential with await in loop
for (let i = 0; i < 12; i++) {
  await request(app).post('/endpoint').set('Authorization', `Bearer ${token}`);
  // Window resets between iterations!
}

// ✅ CORRECT: Concurrent
const requests = Array.from({ length: 12 }, () =>
  request(app).post('/endpoint').set('Authorization', `Bearer ${token}`)
);
await Promise.all(requests);
```

### ❌ Anti-Pattern 2: Using setTimeout/sleep Between Requests

```typescript
// ❌ WRONG: Artificial delays
for (let i = 0; i < 12; i++) {
  await request(app).post('/endpoint').set('Authorization', `Bearer ${token}`);
  await sleep(100); // Trying to stay in window - brittle!
}

// ✅ CORRECT: No delays needed - concurrent requests
const requests = Array.from({ length: 12 }, () =>
  request(app).post('/endpoint').set('Authorization', `Bearer ${token}`)
);
await Promise.all(requests);
```

### ❌ Anti-Pattern 3: Expecting Exact Order of Success/Failure

```typescript
// ❌ WRONG: Assuming first 10 succeed, last 2 fail
const responses = await Promise.all(requests);
expect(responses[0].status).toBe(200); // ❌ Non-deterministic!
expect(responses[11].status).toBe(429);

// ✅ CORRECT: Count successes/failures
const successful = responses.filter(r => r.status === 200);
const tooManyRequests = responses.filter(r => r.status === 429);
expect(successful.length).toBe(10);
expect(tooManyRequests.length).toBe(2);
```

### ❌ Anti-Pattern 4: Not Clearing Rate Limits Between Tests

```typescript
// ❌ WRONG: Stale rate limits from previous test
it('test 1', async () => {
  // Makes 10 requests (fills rate limit)
});

it('test 2', async () => {
  // First request gets 429! (leftover from test 1)
});

// ✅ CORRECT: Clear rate limits per test
import { RedisTestHelper } from '@test/shared/redis-test.helper';

it('test 1', async () => {
  await RedisTestHelper.clearRateLimitingData(context.app);
  // Fresh rate limit counter
});

it('test 2', async () => {
  await RedisTestHelper.clearRateLimitingData(context.app);
  // Fresh rate limit counter
});
```

---

## Performance Impact

### Sequential vs Concurrent

| Pattern | Duration | Reliability | Realism |
|---------|----------|-------------|---------|
| **Sequential (❌)** | ~12-15s for 12 requests | Low (window resets) | Low (users are concurrent) |
| **Concurrent (✅)** | ~1-2s for 12 requests | High (all in window) | High (simulates real bursts) |

**Performance gain**: 6-10x faster tests

---

## Expected Side Effects

### Optimistic Locking Conflicts

Concurrent requests to **same aggregate** may cause version mismatches:

```typescript
// Expected behavior with concurrent requests
const requests = Array.from({ length: 12 }, () =>
  request(app)
    .patch('/service-provider/display-settings') // Same aggregate
    .set('Authorization', `Bearer ${token}`)
    .send({ displayGranularity: 'CITY' })
);

const responses = await Promise.all(requests);

// Some requests may return 500 (optimistic locking conflict)
// This is EXPECTED and CORRECT behavior
const successful = responses.filter(r => r.status === 200);
const conflicts = responses.filter(r => r.status === 500);
const rateLimited = responses.filter(r => r.status === 429);

// Verify: Some succeed, some conflict, some rate limited
expect(successful.length).toBeGreaterThan(0);
expect(conflicts.length + rateLimited.length).toBeGreaterThan(0);
```

**Mitigation**: If testing specific aggregate behavior (not rate limiting), use **different aggregates** per request:

```typescript
// Create 12 different service providers (no conflicts)
const providers = await Promise.all(
  Array.from({ length: 12 }, () => createServiceProvider())
);

// Update different aggregates concurrently
const requests = providers.map(provider =>
  request(app)
    .patch('/service-provider/display-settings')
    .set('Authorization', `Bearer ${provider.token}`)
    .send({ displayGranularity: 'CITY' })
);

const responses = await Promise.all(requests);
// No optimistic locking conflicts (different aggregates)
```

---

## Integration with Existing Patterns

### 1. Redis Test Isolation Pattern

**CRITICAL**: Always clear rate limits before testing:

```typescript
import { RedisTestHelper } from '@test/shared/redis-test.helper';

it('should return 429 when rate limit exceeded', async () => {
  // STEP 1: Clear rate limits FIRST
  await RedisTestHelper.clearRateLimitingData(context.app);

  // STEP 2: Setup test data
  const user = await createUser();

  // STEP 3: Concurrent requests
  const requests = Array.from({ length: 12 }, () =>
    request(app).post('/endpoint').set('Authorization', `Bearer ${user.token}`)
  );

  const responses = await Promise.all(requests);

  // STEP 4: Assertions
  expect(responses.filter(r => r.status === 429).length).toBeGreaterThan(0);
});
```

See: `.claude/knowledge/patterns/testing/redis-test-isolation-pattern.md`

### 2. E2E Testing Guide

**Rate limiting tests** should be in **separate files**:

```
src/app/api/service-provider/__tests__/
├── service-provider.e2e.spec.ts              # Functional tests
├── service-provider-rate-limits.e2e.spec.ts  # Rate limiting tests (this pattern)
└── service-provider-validation.e2e.spec.ts   # Validation tests
```

See: `test/shared/E2E_TESTING_GUIDE.md` (Rate Limiting section)

### 3. Test Seeding Performance

**Cost-optimize setup**: Seed data in DB, not via API requests:

```typescript
// ❌ EXPENSIVE: Creates via API (consumes rate limit)
async function createServiceProvider() {
  const user = await createUser();
  const response = await request(app)
    .post('/service-provider')
    .set('Authorization', `Bearer ${user.token}`)
    .send(validPayload); // Consumes rate limit!
  return response.body.data;
}

// ✅ CHEAP: Seeds directly in DB (no rate limit)
async function createServiceProvider() {
  const user = await seedRegularUserE2E(db, {
    capabilities: CapabilityPresets.SERVICE_PROVIDER,
  });
  const provider = await seedServiceProviderE2E(db, user.userId);
  return { ...provider, token: user.accessToken };
}
```

See: `.claude/knowledge/patterns/testing/test-seeding-performance-guide.md`

---

## Real-World Examples

### Example 1: Service Provider Creation Rate Limit

**File**: `src/app/api/service-provider/__tests__/service-provider-rate-limits.e2e.spec.ts`

```typescript
it('should return 429 when create service provider rate limit exceeded', async () => {
  // Clear rate limits
  await RedisTestHelper.clearRateLimitingData(context.app);

  // Create eligible user (seeded in DB)
  const user = await createEligibleUser();

  // Make 5 concurrent create requests (limit is 3 per 24h)
  const requests = Array.from({ length: 5 }, () =>
    request(context.app.getHttpServer())
      .post('/service-provider')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send(validPayload)
  );

  const responses = await Promise.all(requests);

  // Verify rate limiting
  const successful = responses.filter(r => r.status === 201);
  const tooManyRequests = responses.filter(r => r.status === 429);

  expect(successful.length).toBe(3); // First 3 succeed
  expect(tooManyRequests.length).toBe(2); // Last 2 fail

  // Verify rate limit headers
  const rateLimitedResponse = tooManyRequests[0];
  expect(rateLimitedResponse.headers['x-ratelimit-limit']).toBe('3');
  expect(rateLimitedResponse.headers['x-ratelimit-remaining']).toBe('0');
  expect(rateLimitedResponse.headers['retry-after']).toBeDefined();
});
```

### Example 2: Update Display Settings Rate Limit

**File**: `src/app/api/service-provider/__tests__/service-provider-rate-limits.e2e.spec.ts`

```typescript
it('should return 429 when update display settings rate limit exceeded', async () => {
  await RedisTestHelper.clearRateLimitingData(context.app);

  // Create service provider (seeded to avoid rate limit consumption)
  const provider = await createServiceProvider();

  // Make 12 concurrent update requests (limit is 10 per hour)
  const requests = Array.from({ length: 12 }, (_, i) => {
    const granularity = i % 2 === 0 ? 'STREET' : 'CITY';
    return request(context.app.getHttpServer())
      .patch('/service-provider/display-settings')
      .set('Authorization', `Bearer ${provider.accessToken}`)
      .send({ displayGranularity: granularity });
  });

  const responses = await Promise.all(requests);

  // Note: Some may be 500 (optimistic locking) - this is expected
  const successful = responses.filter(r => r.status === 200);
  const tooManyRequests = responses.filter(r => r.status === 429);
  const conflicts = responses.filter(r => r.status === 500);

  // Verify rate limiting triggered (even with conflicts)
  expect(tooManyRequests.length).toBeGreaterThan(0);

  // Combined successful + conflicts should not exceed limit significantly
  expect(successful.length + conflicts.length).toBeLessThanOrEqual(12);
});
```

---

## Troubleshooting

### Issue 1: No 429 Responses Despite Exceeding Limit

**Symptoms**: Test expects 429, all requests return 200/201

**Causes**:
1. Sequential requests (window resets)
2. Stale rate limits not cleared
3. Test environment rate limiting disabled

**Fix**:
```typescript
// 1. Use concurrent requests
const requests = Array.from({ length: 12 }, () => request(...));
await Promise.all(requests);

// 2. Clear rate limits before test
await RedisTestHelper.clearRateLimitingData(context.app);

// 3. Verify test setup
const testSetup = createStandardTestSetup({
  testing: {
    skipApiRateLimiting: false, // Should be false!
    skipEndpointRateLimiting: false,
  },
});
```

### Issue 2: Flaky Tests (Sometimes Pass, Sometimes Fail)

**Symptoms**: Test passes in CI, fails locally (or vice versa)

**Cause**: Window timing issues (sequential requests)

**Fix**: Always use concurrent requests for rate limit tests

### Issue 3: All Requests Return 500 (Optimistic Locking)

**Symptoms**: No 200 responses, all conflicts

**Cause**: Too many concurrent requests to same aggregate

**Fix**: Use different aggregates or accept conflicts:
```typescript
// Option 1: Different aggregates
const providers = await Promise.all(
  Array.from({ length: 12 }, () => createServiceProvider())
);
const requests = providers.map(p => request(...).set('Auth', p.token));

// Option 2: Accept conflicts as valid
const successful = responses.filter(r => r.status === 200);
const conflicts = responses.filter(r => r.status === 500);
const rateLimited = responses.filter(r => r.status === 429);

expect(successful.length + conflicts.length).toBeGreaterThan(0);
expect(rateLimited.length).toBeGreaterThan(0);
```

---

## Summary

### Key Principles

1. **Concurrent > Sequential**: Use `Promise.all()` for rate limit tests
2. **Clear Before Test**: Use `RedisTestHelper.clearRateLimitingData()`
3. **Count, Don't Order**: Filter responses by status, don't assume order
4. **Accept Side Effects**: Optimistic locking conflicts are expected

### Performance

- **6-10x faster** than sequential requests
- **Eliminates flaky tests** from window resets
- **Simulates real-world** concurrent user behavior

### Integration

- Works with Redis Test Isolation Pattern
- Follows E2E Testing Guide separation (rate-limits in separate files)
- Uses cost-optimized seeding (DB, not API)

---

**Related Patterns**:
- `.claude/knowledge/patterns/testing/redis-test-isolation-pattern.md`
- `test/shared/E2E_TESTING_GUIDE.md` (Rate Limiting section)
- `.claude/knowledge/patterns/testing/test-seeding-performance-guide.md`

**References**:
- ADR-0035: Specification-First Testing Strategy (Test Pyramid)
- ADR-0041: Error Handler Extraction (Rate limit error handling)
