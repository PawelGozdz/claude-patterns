# Test Seeding Performance Guide

**Version**: 2.0
**Created**: 2026-01-06
**Updated**: 2026-07-12
**Purpose**: Unified guide for optimal test data seeding in Project Hybrid Fixture System
**Principle**: **"Fixture what you DON'T test, real flow for what you DO test"**

---

## Status migracji [2026-07-12]

`TS-TEST-FIXTURE-001` through `006` replaced `UserIdentityFixture.createAsync()` /
`.createSync()` / `.createViaHandlers()` as the concrete API for seeding a
`UserIdentity` user with a **domain-colocated Mother + real `repository.save()` +
typed projection row-builders**. See
[`domain-colocated-fixture-mother-pattern.md`](./domain-colocated-fixture-mother-pattern.md)
for the full pattern, code, and migration status.

**What this means for this guide**: the *conceptual* mode-selection guidance
below (L1 = pure construction, L2 = fast setup + real orchestration test, L2
event tests = full event flow, L3 = HTTP for what you test) is still correct
and generalizes to any aggregate's fixture — but the concrete `UserIdentity`
code examples throughout this guide that show `UserIdentityFixture.createAsync(db, {...})`
are **historical**. For new code, use:
- L1 pure construction → call the Mother directly (`createUnverifiedUser()`, `createVerifiedUser()`, etc.)
- L2/L3 setup needing projections in other contexts → `saveTest*WithProjections()` composite
- L2/L3 setup needing only the `users` row + real events, no cross-context projections → the repository fixture (`saveTest*User()`)

**What is NOT superseded**: the *Core Principle* below, the *Context-Specific
Seeders* for `geographic-auth`/`authorization` (still real, unchanged code),
and the *Password Hashing Optimization* section are all independent of this
migration and remain accurate as written.

**What still physically exists, by design**: `UserIdentityFixtureClass.createProjections()`
has **not been deleted** — `TS-TEST-FIXTURE-006` (done 2026-07-12) confirmed
exactly one remaining transitive consumer, `authorization-seeders.ts`, a
documented Category 3 exception (272-file blast radius). This is now a closed,
intentional exception, not a pending removal. `-006` did remove the 3
genuinely dead `UserIdentityFixtureClass` helpers (`setPhoneNumber`/
`getUserIdByEmail`/static `markEmailVerified`) and the dead barrel
`auth/domain/aggregates/__fixtures__/index.ts`. See "Status migracji" in
[`domain-colocated-fixture-mother-pattern.md`](./domain-colocated-fixture-mother-pattern.md)
for the full per-task rollout, including `TS-TEST-FIXTURE-007` (2026-07-12,
not started) which audits the `geographic-auth`/`neighborhood-economy`/
`engagement`/`core` seeders below that were never in scope of `-001`..`-006`.

---

## Executive Summary

This guide defines optimal test data seeding strategies for Project's Hybrid Fixture System (ADR-0061). It combines technical performance optimization with DDD-aligned domain integrity.

**Key Insight**: Project files are small (~20-40 tests per file). Strategy is NOT based on test count, but on **what you're testing** vs **what's setup**.

**Performance Targets**:
- L1 tests: <30s total (createSync, <1ms each)
- L2 tests: <2min total (createAsync, 50ms each)
- L3 tests: <3min total (mix of createAsync and createViaHandlers)

**Current Problem**: Tests with full seeding (auth + geo + authorization) run 20-30s+ due to:
1. Real password hashing: ~200ms per user
2. Full event flow: ~800ms per entity
3. BullMQ wait times: ~2s for event processing

**Solution**: Strategic use of 3-mode Hybrid Fixture System based on what you're testing.

---

## Core Principle

> **"Fixture what you DON'T test, real flow for what you DO test"**

### Translation to Practice

| What You're Testing | Setup Dependencies | Test Execution |
|---------------------|-------------------|----------------|
| **Handler orchestration** | Fixture (createAsync) | Direct handler call |
| **Event handlers** | Fixture dependencies | Real event flow (createViaHandlers) |
| **Aggregate invariants** | Nothing (createSync) | Pure domain logic |
| **E2E endpoints** | Fixture everything | HTTP calls via supertest |
| **E2E event flow** | Fixture user/residence | Real flow for events |

### Example

```typescript
// Testing CommunityEvent creation
describe('CreateEventHandler', () => {
  it('should create event and enqueue moderation', async () => {
    // ✅ Fixture what you DON'T test (user setup)
    const userId = await UserIdentityFixture.createAsync(db, {
      isEmailVerified: true
    });

    // ✅ Real flow for what you DO test (event creation)
    const result = await handler.execute(new CreateEventCommand({
      organizerId: userId,
      title: 'Community Cleanup',
      description: 'Join us!',
    }));

    expect(result.isSuccess).toBe(true);

    // ✅ Verify moderation job enqueued (handler responsibility)
    expect(mockQueue.addCalls).toHaveLength(1);
  });
});
```

---

## Password Hashing Optimization

### Current Implementation (OPTIMAL)

Project uses **Argon2** (not bcrypt). Fixtures use **dummy hash** by default:

```typescript
// test/shared/fixtures/auth/user-identity-fixture.class.ts (lines 115-117)
passwordHash:
  '$argon2id$v=19$m=65536,t=3,p=4$TEST_FIXTURE_SALT$TEST_FIXTURE_HASH_VALUE_PLACEHOLDER',
```

### Decision Tree

```
Are you testing password verification/authentication flow?
├── YES: Use real hash via PasswordHashingService (~200ms)
│   └── Examples: Login tests, password reset tests, auth E2E
└── NO: Use dummy hash (default in fixtures) (<1ms)
    └── Examples: Testing events, authorization, business rules, most E2E
```

### Performance Impact

| Scenario | Dummy Hash | Real Hash | Improvement |
|----------|-----------|-----------|-------------|
| 10 users via createAsync | ~500ms | ~2500ms | **5x faster** |
| 50 users via createAsync | ~2.5s | ~12.5s | **5x faster** |

### When Real Hash IS Required

```typescript
// Auth E2E tests - testing login flow
describe('POST /auth/login', () => {
  it('should login with valid credentials', async () => {
    const password = 'SecurePass123!';

    // ✅ Real registration via HTTP (includes real hash)
    await request(app)
      .post('/auth/register')
      .send({ email: 'test@project.test', password })
      .expect(201);

    // Test login
    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'test@project.test', password })
      .expect(200);

    expect(response.body.data.accessToken).toBeDefined();
  });
});

// ❌ WRONG: Using createAsync for auth login test
describe('POST /auth/login', () => {
  it('should login (BROKEN)', async () => {
    // Dummy hash won't work with real PasswordHashingService!
    const userId = await UserIdentityFixture.createAsync(db, {
      password: 'SecurePass123!'
    });

    // This will FAIL - password verification fails
    await request(app)
      .post('/auth/login')
      .send({ email: 'test@project.test', password: 'SecurePass123!' })
      .expect(200); // ❌ Gets 401 instead
  });
});
```

### Recommendation

**Keep current dummy hash approach**. Real hashing ONLY in:
1. E2E tests that test authentication flow
2. Load testing scripts (already use `argon2.hash()`)
3. Integration tests for PasswordHashingService itself

**Do NOT implement bcrypt caching** - unnecessary complexity.

---

## beforeAll vs beforeEach Patterns

### Performance vs Isolation Trade-off

| Pattern | Performance | Isolation | Test Pollution Risk |
|---------|-------------|-----------|---------------------|
| **beforeAll + shared fixtures** | Fastest | Low | High |
| **beforeEach + full cleanup** | Slowest | Highest | None |
| **beforeAll + beforeEach selective** | **OPTIMAL** | High | Low |

### Recommended Pattern: Hybrid Approach

```typescript
describe('Feature Tests', () => {
  let context: TestAppContext;

  // ONCE: Expensive, read-only setup
  beforeAll(async () => {
    context = await testSetup.setup();  // NestJS app, DB connection (~2-5s)
  }, 120000);

  // EACH: Fast, test-specific data
  beforeEach(async () => {
    await context.cleaner.cleanAll(context.app);   // TRUNCATE + Redis (~60ms)

    // Fixture setup for this specific test
    testUser = await UserIdentityFixture.createAsync(db, {
      isEmailVerified: true
    });
  });

  afterAll(async () => {
    await testSetup.cleanup(context);
  });
});
```

### When to Use Each Pattern

| Resource | Pattern | Rationale | Performance |
|----------|---------|-----------|-------------|
| **NestJS app instance** | beforeAll | Expensive (~2-5s), stateless | 1x per file |
| **Database connection** | beforeAll | Connection pooling, reusable | 1x per file |
| **User data** | beforeEach | Ensures test isolation | Per test |
| **Rate limit clearing** | beforeEach | Prevents 429 accumulation | Per test |
| **Reference data (cities)** | beforeAll | Read-only, never modified | 1x per file |

### Shared Fixtures (Advanced Pattern)

For read-only reference data that ALL tests need (e.g., cities, categories):

```typescript
describe('Geographic Tests', () => {
  let context: TestAppContext;
  let starachowiceId: string; // Shared across all tests

  beforeAll(async () => {
    context = await testSetup.setup();

    // Create shared reference data ONCE
    starachowiceId = await CityFixture.createAsync(db, {
      name: 'Starachowice',
      coordinates: point(21.0714, 51.0375),
    });
  });

  beforeEach(async () => {
    // Clean user data, but NOT cities (reference data)
    await context.cleaner.cleanPostgreSQL([
      'user_identities',
      'user_residences',
      // cities table NOT cleaned
    ]);

    // Create test-specific user
    testUser = await UserIdentityFixture.createAsync(db, { ... });
  });
});
```

**Warning**: Only use shared fixtures for **truly read-only** data that tests NEVER modify.

---

## Fixture Mode Selection

> **UserIdentity-specific note (2026-07-12)**: the mode-selection *logic* below
> (pure construction vs. fast setup vs. full event flow vs. HTTP) is still the
> right way to think about any aggregate's fixture. The concrete
> `UserIdentityFixture.createSync/createAsync/createViaHandlers` calls in the
> code blocks are the **historical** API for `UserIdentity` specifically —
> `createSync()` → call the Mother directly; `createAsync()` (setup, no
> cross-context projections needed) → `saveTest*User()` repository fixture;
> `createAsync()` (setup, projections needed in other contexts) →
> `saveTest*WithProjections()` composite. `createViaHandlers()` was not part
> of this migration and, as of 2026-07-12, still lives on the legacy class.
> See [`domain-colocated-fixture-mother-pattern.md`](./domain-colocated-fixture-mother-pattern.md).

### L1 Tests (Unit - Specifications, Aggregates, Value Objects)

**Mode**: `createSync()` ALWAYS
**Performance**: <1ms
**Database**: NONE
**Events**: NONE

**Why (DDD Perspective)**:
- Aggregate autonomy - testing pure domain logic
- No infrastructure dependencies
- Fast feedback (<30s for 1,200+ tests)

```typescript
// src/contexts/auth/domain/aggregates/__tests__/user-identity-events.spec.ts
import { createUnverifiedUser } from '@contexts/auth/domain/aggregates/__fixtures__/user-identity.mother';

describe('UserIdentityAggregate', () => {
  it('should verify email and emit EmailVerifiedEvent', () => {
    // ✅ Mother, called directly - No DB, <1ms, no test/ layer at all
    const user = createUnverifiedUser({ email: createTestEmail({ value: 'test@example.com' }) });

    // Test state transition (aggregate concern)
    const token = user.generateEmailVerificationToken();
    user.verifyEmail(token);

    expect(user.isEmailVerified).toBe(true);

    // Test event emission (aggregate concern, NOT handler concern)
    const events = user.getUncommittedEvents();
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'EmailVerifiedEvent' })
    );
  });
});
```

**Historical shape** (pre-`TS-TEST-FIXTURE-002`): `UserIdentityFixture.createSync({ isEmailVerified: false })` returned a `Result`-wrapped user, requiring `.value` and an `expect(result.isSuccess)` check. The Mother returns the aggregate directly — `create()` isn't a `Result` factory, so those checks are gone, not just moved.

**Exception**: Testing event emission mechanics (L1 Aggregate test) - still use `createSync()`, verify `uncommittedEvents`.

---

### L2 Tests (Integration - Handlers, Repositories)

**Default Mode**: `createAsync()` for setup
**Performance**: ~50ms per entity
**Database**: YES (direct INSERT)
**Events**: BYPASSED

**Why (DDD Perspective)**:
- Handler tests focus on orchestration, NOT user creation mechanics
- 94% faster than createViaHandlers (50ms vs 800ms)
- Bounded context isolation - don't test Auth when testing Authorization

#### Decision Tree for L2

```
What are you testing?
│
├── Command/Query Handler orchestration?
│   └── Setup: createAsync() for dependencies
│   └── Test: Execute handler directly (inject via app.get())
│   └── Verify: Check DB state and return value
│
├── Event Handler behavior?
│   └── Setup: createAsync() for aggregate (if needed)
│   └── Test: createViaHandlers() OR dispatch event directly
│   └── Verify: Check side effects (projections, jobs, etc.)
│
├── Repository save/load?
│   └── Setup: createSync() for aggregate
│   └── Test: repository.save() then repository.findById()
│   └── Verify: Aggregate reconstitution
│
└── Domain Event emission?
    └── Setup: createSync() for aggregate
    └── Test: Call aggregate method
    └── Verify: Check aggregate.getUncommittedEvents()
```

#### Handler Orchestration Tests (Default L2 Pattern)

```typescript
// src/contexts/auth/application/commands/set-date-of-birth/__tests__/handler.integration.spec.ts
import { saveTestVerifiedUserWithProjections } from '@test/shared/fixtures/auth/user-identity-composite.fixture';

describe('SetDateOfBirthHandler (L2 Integration)', () => {
  it('should successfully set date of birth for user aged 25', async () => {
    // ✅ CORRECT: composite for setup (~60ms, real repository.save() + real events)
    const { userId } = await saveTestVerifiedUserWithProjections(context.app);

    const command = new SetDateOfBirthCommand(userId, dateOfBirth, ...);

    // Test handler orchestration (THIS is what we're testing)
    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    expect(result.value.age).toBe(25);

    // Verify database updated
    const dbDateOfBirth = await getUserDateOfBirth(dbService, userId);
    expect(dbDateOfBirth).toBeDefined();
  });
});
```

#### Event Handler Tests (Use createViaHandlers)

**Mode**: `createViaHandlers()` for entity being tested
**Performance**: ~800ms per entity
**Events**: FULL FLOW

**Why (DDD Perspective)**:
- Event handlers ARE integration points
- Testing event flow verifies aggregate behavior
- Event semantics matter - "UserRegisteredEvent triggers permission creation" ≠ "user exists in DB"

> `createViaHandlers()` (Mode 3, "Traditional" in the old `HybridFixture`)
> was **not** part of the `TS-TEST-FIXTURE-001..006` migration — only
> `createAsync()`'s internal `createProjections()` bypass was replaced. As
> of 2026-07-12 this call still exists on the legacy fixture class; verify
> it's still present before copying this example into new code, and prefer
> the repository fixture/composite with `eventDispatcher: { mode: 'real' }`
> (the default) for new tests that need real event handlers to run.

```typescript
// src/contexts/authorization/application/event-handlers/__tests__/user-registered.handler.spec.ts
describe('UserRegisteredEventHandler', () => {
  it('should create default permissions when user registered', async () => {
    // ✅ CORRECT: createViaHandlers() to trigger full event flow (800ms)
    const userId = await UserIdentityFixture.createViaHandlers(app, {
      email: 'test@project.test',
      role: 'CITIZEN'
    });

    // Wait for event handler to complete
    await waitFor(1000);

    // ✅ VERIFY: Permissions created by event handler
    const permissions = await db
      .selectFrom('user_permissions')
      .where('user_id', '=', userId)
      .execute();

    expect(permissions).toHaveLength(1);
    expect(permissions[0].role).toBe('CITIZEN');
  });
});
```

**Anti-Pattern**:
```typescript
// ❌ WRONG: capture-mode dispatcher for an event handler test
describe('UserRegisteredEventHandler', () => {
  it('should create permissions (BROKEN)', async () => {
    // eventDispatcher: { mode: 'capture' } swaps the dispatcher for a no-op —
    // real handlers never run, so downstream side effects never happen.
    const context = await testSetup.setup({ eventDispatcher: { mode: 'capture' } });
    const { userId } = await saveTestUnverifiedUser(context.app);

    // This assertion will FAIL because the event handler didn't run!
    const permissions = await db
      .selectFrom('user_permissions')
      .where('user_id', '=', userId)
      .execute();

    expect(permissions).toHaveLength(1); // ❌ FAIL: permissions.length = 0
  });
});

// ✅ CORRECT: default 'real' mode (or omit eventDispatcher entirely) —
// repository.save() emits the real UserRegisteredEvent, handler runs
const { userId } = await saveTestUnverifiedUser(context.app); // eventDispatcher defaults to 'real'
```

---

### L3 Tests (E2E - API Endpoints)

**Mode**: HTTP calls via supertest ALWAYS
**Setup**: `createAsync()` for test data prerequisites
**Performance**: ~200-500ms per request

**Why**:
- E2E tests verify HTTP API, not domain events
- Fixtures for dependencies you DON'T test
- Real HTTP calls for what you DO test

```typescript
describe('POST /local-services/requests', () => {
  beforeEach(async () => {
    // ✅ Fast setup via composite (~60ms, real save + real events)
    const { userId: newUserId } = await saveTestVerifiedUserWithProjections(context.app);
    userId = newUserId;
    residenceId = await UserResidenceFixture.createAsync(db, { userId });

    // Get auth token via HTTP (this IS the flow for auth tests)
    const loginResponse = await request(app)
      .post('/auth/login')
      .send({ email: 'test@project.test', password: 'SecurePass123!' })
      .expect(200);

    authToken = loginResponse.body.accessToken;
  });

  it('should create job request', async () => {
    // ✅ HTTP call - the actual test
    const response = await request(app)
      .post('/local-services/requests')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Test job', description: 'Need help', ... })
      .expect(201);

    expect(response.body.data.id).toBeDefined();
  });
});
```

**When to Use createViaHandlers in E2E** (Rare):

Only when testing full event flow end-to-end:

```typescript
describe('Event Moderation Flow E2E', () => {
  it('should create event, enqueue moderation, and process', async () => {
    // ✅ Fixture user (not testing auth)
    const { userId } = await saveTestUnverifiedUserWithProjections(context.app);

    // ✅ Real flow for event (THIS is what we're testing)
    const response = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Community Cleanup', ... })
      .expect(201);

    const eventId = response.body.data.id;

    // Wait for BullMQ processing
    await waitFor(2000);

    // Verify moderation decision stored
    const moderation = await db
      .selectFrom('moderation_decisions')
      .where('content_id', '=', eventId)
      .executeTakeFirst();

    expect(moderation).toBeDefined();
  });
});
```

---

## Cross-Context Dependencies

### Dependency Depth Strategy

> **`FixtureRegistry` no longer exists.** The example below (`FixtureRegistry.createMany()`)
> documented a cross-context orchestration mechanism (`ScenarioBuilder` +
> `RelationshipBuilder` + `FixtureRegistry`) that `TS-TEST-FIXTURE-003`
> (2026-07-11) found to be **dead, unregistered, and unusable code — zero
> real consumers, and every `FixtureRegistry.register()` call it depended on
> was itself only ever a JSDoc example, never a real registration**. All 6
> files were deleted. Kept below only as a historical record of the intent;
> for immediate dependencies, fixture them explicitly (Mother/composite for
> Category 1, row-builder for Category 2) — there is no registry to resolve
> transitive ones automatically as of 2026-07-12.

**Principle**: Fixture only **immediate** dependencies.

```
Authorization test needs:
├── UserIdentity (immediate - required)
├── Geographic verification (immediate - required for capabilities)
└── UserResidence (transitive - UserResidenceFixture handles this)
```

```typescript
// ✅ CORRECT (2026-07-12): explicit, typed composite for UserIdentity + projections
const { userId } = await saveTestVerifiedUserWithProjections(context.app, { email: 'test@project.test' });
const residenceId = await UserResidenceFixture.createAsync(db, { userId });

// ❌ HISTORICAL (pre-migration, do not copy): FixtureRegistry no longer exists
// const ids = await FixtureRegistry.createMany(db, [
//   { name: 'UserIdentity', params: { email: 'test@project.test' }, as: 'testUser' },
//   { name: 'UserResidence', params: { userId: '$testUser.id' } },
// ]);
```

### User Projection Pattern (Project Reality)

**ALL contexts depend on UserIdentity** (User Projection Pattern):

| Context | Required Fixtures | Auto-Created Projections |
|---------|------------------|--------------------------|
| **Auth** | UserIdentity | - |
| **Authorization** | UserIdentity | - |
| **Geographic-Auth** | UserIdentity, UserResidence | geographic_auth_users |
| **Engagement** | UserIdentity | engagement_users |
| **Neighborhood-Economy** | UserIdentity, UserResidence | All above |

**Projections are created** by the `saveTest*WithProjections()` composite —
Mother + real `repository.save()` + 6 typed Category 2 row-builders
(`geographic_auth_users`, `engagement_users`, `economy_users`,
`community_communication_users`, `organization_users`, `user_profiles`,
`user_profile_stats`), replacing the old `UserIdentityFixture.createProjections()`
raw-insert transaction. Full detail, including exact `onConflict` semantics
per table: [`domain-colocated-fixture-mother-pattern.md`](./domain-colocated-fixture-mother-pattern.md).
**Note**: `createProjections()` itself still physically exists on the legacy
`UserIdentityFixtureClass` as of 2026-07-12 — `TS-TEST-FIXTURE-006` (done) closed this as a
**permanent, intentional exception** (one remaining transitive consumer, `authorization-seeders.ts`,
registered as `TEST-D001`), not a pending removal — do not assume it has been or will be deleted.

```typescript
// ✅ CORRECT (2026-07-12): composite creates the users row AND all projections
const { userId } = await saveTestUnverifiedUserWithProjections(context.app);
// -> repository.save() on the real UserIdentity aggregate, then Promise.all
//    over 7 typed row-builders, onConflict semantics preserved per table
```

**Implication**: Don't manually create projections - fixture handles it.

---

## Rate Limiting Cleanup

### When to Clear Rate Limits

| Scenario | Clear in beforeEach? | Rationale |
|----------|---------------------|-----------|
| **Rate limit E2E tests** | ✅ YES (mandatory) | Tests deliberately trigger limits |
| **Auth E2E tests** | ✅ YES | Multiple login attempts |
| **Standard E2E tests** | ❌ NO | Unique emails per test avoid accumulation |
| **L2 handler tests** | ❌ NO | No HTTP layer, no rate limiting |
| **L1 unit tests** | ❌ NO | No infrastructure |

### Optimal Pattern

```typescript
// Standard E2E tests - NO rate limit clearing
describe('POST /events', () => {
  beforeEach(async () => {
    await context.cleaner.cleanPostgreSQL(); // DB only - faster

    // Unique email per test = no rate limit accumulation
    testUser = await UserIdentityFixture.createAsync(db, {
      email: `test-${Date.now()}-${Math.random()}@project.test`
    });
  });
});

// Rate limit E2E tests - FULL cleanup
describe('Rate Limiting Tests', () => {
  beforeEach(async () => {
    await context.cleaner.cleanAll(context.app); // DB + Redis

    testUser = await UserIdentityFixture.createAsync(db, { ... });
  });
});
```

### Performance Impact

| Cleanup Strategy | Time | When to Use |
|------------------|------|-------------|
| `cleanPostgreSQL()` | ~50ms | Standard tests (unique emails) |
| `cleanAll()` | ~60ms | Rate limit tests, auth tests |

**Recommendation**: Use `cleanPostgreSQL()` by default. Add `cleanAll()` ONLY for rate-limit-specific tests.

---

## Context-Specific Seeders

**Location**: `test/shared/fixtures/{context}/`
**Purpose**: Fast, specialized seeders for context-specific test data beyond generic fixtures

### Events Context Seeders

> **Consolidated (2026-07-11, `TS-TEST-FIXTURE-003`)**: the standalone
> `test/shared/fixtures/events/event-seeders.ts` file below has been
> **removed**. Its 4 functions were folded into `EventTestFixtures`
> (`src/contexts/community-communication/infrastructure/events/repositories/__fixtures__/event-test.fixtures.ts`)
> as methods, preserving each function's subtle field differences (attendee
> increment behavior, moderation status, `completed` vs `posted`, version
> numbering) rather than forcing a single unified shape — 9 e2e files were
> migrated to the consolidated class. The functional descriptions and
> options below are still accurate; only the import path/API surface
> (function → class method) changed. Check `EventTestFixtures` directly for
> current method signatures before copying the examples below.

**Original file** (removed): `test/shared/fixtures/events/event-seeders.ts`
**Created**: TS-TEST-001 Week 4
**Use Cases**: E2E tests for community-communication context (events, feedback)

#### `seedPastEvent()` - Fast Past Event Creation

**Performance**: ~15-20ms
**Creates**:
- `community_events` table entry (past event with COMPLETED status)
- `community_communication_users` projection (organizer) ✅ AUTO

**Use When**: Testing feedback functionality (requires past events)

**Signature**:
```typescript
async function seedPastEvent(
  db: DbOrTrx,
  organizerId: string,
  options?: Partial<PastEventOptions>
): Promise<PastEventResult>
```

**Example**:
```typescript
import { seedPastEvent } from '@test/shared/fixtures/events';

describe('Event Feedback Tests', () => {
  it('should submit feedback for past event', async () => {
    // Create organizer (user + session, no projection needed - seedPastEvent creates it)
    const organizer = await seedRegularUserE2E(db, {
      customPermissions: [{ action: Action.CREATE, subject: Subject.COMMUNITY_EVENT }]
    });
    await storeSessionInRedis(context.app, organizer);

    // ✅ ONE CALL: Creates past event + organizer projection
    const { eventId, startTime, endTime } = await seedPastEvent(db, organizer.userId, {
      title: 'Past Community Cleanup',
      description: 'Testing feedback',
      startTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    });

    // Test feedback submission
    const response = await request(app)
      .post(`/events/${eventId}/feedback`)
      .set('Authorization', `Bearer ${organizer.accessToken}`)
      .send({ rating: 5, positiveTags: ['WELL_ORGANIZED'] })
      .expect(201);
  });
});
```

**Options**:
```typescript
interface PastEventOptions {
  title?: string;               // Default: 'Past Event for Testing'
  description?: string;          // Default: 'Testing event feedback functionality'
  startTime?: Date;             // Default: 3 days ago
  endTime?: Date;               // Default: 3 days ago + 2 hours
  maxAttendees?: number | null; // Default: null (unlimited)
  latitude?: number;            // Default: 51.0374 (Starachowice)
  longitude?: number;           // Default: 21.0716
  addressLine?: string;         // Default: 'ul. Testowa 1'
  city?: string;                // Default: 'Starachowice'
  postalCode?: string;          // Default: '27-200'
}
```

**Anti-Pattern (Avoid)**:
```typescript
// ❌ OLD APPROACH: Two-phase event creation (50-60ms, complex)
const futureStartTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const eventResponse = await request(app)
  .post('/events')
  .send({ startTime: futureStartTime, ... });
const eventId = eventResponse.body.data.id;

await db.updateTable('community_events').set({
  start_time: pastStartTime,
  status: 'COMPLETED',
}).execute();

// ✅ NEW APPROACH: Direct seeder (15-20ms, clear intent)
const { eventId } = await seedPastEvent(db, organizerId, {
  startTime: pastStartTime
});
```

#### `seedEventAttendee()` - Fast Attendee Creation

**Performance**: ~10ms
**Creates**:
- `event_attendees` table entry
- `community_communication_users` projection (attendee) ✅ AUTO

**Use When**: Testing attendance tracking, feedback eligibility

**Signature**:
```typescript
async function seedEventAttendee(
  db: DbOrTrx,
  eventId: string,
  userId: string,
  status: RSVPStatus, // 'GOING' | 'INTERESTED' | 'NOT_GOING' | 'ATTENDED'
  options?: EventAttendeeOptions
): Promise<void>
```

**Example**:
```typescript
import { seedEventAttendee } from '@test/shared/fixtures/events';

describe('Feedback Eligibility Tests', () => {
  it('should allow feedback from ATTENDED attendees', async () => {
    const { eventId, organizerId } = await seedPastEvent(db, organizer.userId);

    // Create participant
    const participant = await seedRegularUserE2E(db);
    await storeSessionInRedis(context.app, participant);

    // ✅ Add attendee with ATTENDED status (auto-creates projection)
    await seedEventAttendee(db, eventId, participant.userId, 'ATTENDED', {
      rsvpDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // 1 day before event
    });

    // Test feedback submission
    const response = await request(app)
      .post(`/events/${eventId}/feedback`)
      .set('Authorization', `Bearer ${participant.accessToken}`)
      .send({ rating: 5 })
      .expect(201);
  });
});
```

**Options**:
```typescript
interface EventAttendeeOptions {
  rsvpDate?: Date;  // Default: 4 days ago (before event)
}
```

#### `seedEventFeedback()` - Fast Feedback Creation

**Performance**: ~10ms
**Creates**: `event_feedback` table entry

**Use When**: Setting up existing feedback for response tests, analytics tests

**Signature**:
```typescript
async function seedEventFeedback(
  db: DbOrTrx,
  options: EventFeedbackOptions
): Promise<string> // Returns feedbackId
```

**Example**:
```typescript
import { seedEventFeedback } from '@test/shared/fixtures/events';

describe('Organizer Response Tests', () => {
  it('should allow organizer to respond to feedback', async () => {
    const { eventId, organizerId } = await seedPastEvent(db, organizer.userId);

    // ✅ Create existing feedback
    const feedbackId = await seedEventFeedback(db, {
      eventId,
      organizerId,
      participantId: participant.userId,
      rating: 4,
      positiveTags: ['WELL_ORGANIZED'],
      comment: 'Great event!',
    });

    // Test organizer response
    const response = await request(app)
      .post(`/events/${eventId}/feedback/${feedbackId}/respond`)
      .set('Authorization', `Bearer ${organizer.accessToken}`)
      .send({ response: 'Thank you for your feedback!' })
      .expect(200);
  });
});
```

**Options**:
```typescript
interface EventFeedbackOptions {
  eventId: string;
  organizerId: string;
  participantId: string;
  rating: number | null;                     // 1-5 stars, nullable per BR-FEEDBACK-003
  positiveTags?: PositiveFeedbackTag[];      // ['WELL_ORGANIZED', 'FRIENDLY_ORGANIZER', ...]
  negativeTags?: NegativeFeedbackTag[];      // ['NEEDS_IMPROVEMENT', 'POOR_ORGANIZATION', ...]
  comment?: string;                          // Max 300 chars per BR-FEEDBACK-002
  organizerResponse?: string;                // Max 500 chars per BR-FEEDBACK-008
  respondedAt?: Date;
  submittedAt?: Date;                        // Default: now
}
```

---

### Geographic-Auth Context Seeders

**File**: `test/shared/fixtures/geographic-auth/geographic-auth-seeders.ts`
**Created**: TS-TEST-001 Week 4
**Use Cases**: Geographic verification, residence management, PostGIS queries

#### `seedResidence()` - Fast Residence Creation (L2)

**Performance**: ~10-15ms
**Creates**:
- `user_residences` table entry
- `geographic_auth_users` projection (if not exists) ✅ AUTO

**Does NOT Create**: Capabilities (requires HTTP + auth context)

**Use When**: L2 integration tests, handler tests requiring residence

**Signature**:
```typescript
async function seedResidence(
  db: DbOrTrx,
  userId: string,
  cityData: PolishCityData,
  options?: ResidenceOptions
): Promise<ResidenceResult>
```

**Example**:
```typescript
import { seedResidence, polishCities } from '@test/shared/fixtures/geographic-auth';

describe('UpdateServiceRadiusHandler', () => {
  it('should update service radius', async () => {
    const userId = await UserIdentityFixture.createAsync(db, { ... });

    // ✅ Fast residence creation (~10-15ms)
    const { residenceId } = await seedResidence(db, userId, polishCities.STARACHOWICE, {
      street: 'Marszałkowska',
      buildingNumber: '42',
      apartmentNumber: '10',
    });

    const result = await handler.execute(new UpdateServiceRadiusCommand(
      userId,
      residenceId,
      5000 // 5km radius
    ));

    expect(result.isSuccess).toBe(true);
  });
});
```

**Options**:
```typescript
interface ResidenceOptions {
  street?: string;                     // Default: 'Testowa'
  buildingNumber?: string;             // Default: '1'
  apartmentNumber?: string;            // Default: null
  coordinateAccuracyMeters?: number;   // Default: 10
  verificationLevel?: number;          // Default: 0
  serviceRadiusMeters?: number;        // Default: 0
}
```

#### `seedResidenceE2E()` - Fast Residence with Capabilities (E2E)

**Performance**: ~30-40ms
**Creates**:
- Everything from `seedResidence()` +
- Capabilities via HTTP endpoints (ADDRESS_VALIDATED by default)

**Use When**: E2E tests requiring verified residence, capability-based tests

**Signature**:
```typescript
async function seedResidenceE2E(
  db: DbOrTrx,
  app: INestApplication,
  userId: string,
  accessToken: string,
  cityData: PolishCityData,
  options?: ResidenceE2EOptions
): Promise<ResidenceE2EResult>
```

**Example**:
```typescript
import { seedResidenceE2E, polishCities } from '@test/shared/fixtures/geographic-auth';

describe('POST /events - Geographic Requirements', () => {
  it('should create event only with verified residence', async () => {
    const user = await seedRegularUserE2E(db, {
      customPermissions: [{ action: Action.CREATE, subject: Subject.COMMUNITY_EVENT }]
    });
    await storeSessionInRedis(context.app, user);

    // ✅ Create residence with ADDRESS_VALIDATED capability (~30-40ms)
    const { residenceId, capabilities } = await seedResidenceE2E(
      db,
      context.app,
      user.userId,
      user.accessToken,
      polishCities.STARACHOWICE,
      {
        capabilities: ['ADDRESS_VALIDATED'], // Default
      }
    );

    expect(capabilities).toContain('ADDRESS_VALIDATED');

    // Now can create event
    const response = await request(context.app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        title: 'Community Cleanup',
        residenceId,
        visibilityRadiusMeters: 1000,
        // ...
      })
      .expect(201);
  });
});
```

**Options**:
```typescript
interface ResidenceE2EOptions extends ResidenceOptions {
  capabilities?: GeographicCapability[];  // Default: ['ADDRESS_VALIDATED']
}

type GeographicCapability =
  | 'ADDRESS_VALIDATED'      // +10 trust, 500m service radius
  | 'MUNICIPAL_CONFIRMED'    // +20 trust, 2km service radius
  | 'DOCUMENT_VERIFIED';     // +30 trust, 5km service radius
```

#### `polishCities` - Ready-to-Use City Data

**Use When**: Any test requiring Polish city coordinates

**Available Cities**:
```typescript
import { polishCities } from '@test/shared/fixtures/geographic-auth';

// Starachowice (Project primary city)
polishCities.STARACHOWICE
// {
//   city: 'Starachowice',
//   postalCode: '27-200',
//   voivodeship: 'Świętokrzyskie',
//   latitude: 51.0374,
//   longitude: 21.0716,
//   terc: '2611011',
//   ...
// }

// Warsaw (testing large city)
polishCities.WARSAW
// {
//   city: 'Warszawa',
//   latitude: 52.2297,
//   longitude: 21.0122,
//   ...
// }

// Krakow (testing distance queries)
polishCities.KRAKOW
// {
//   city: 'Kraków',
//   latitude: 50.0647,
//   longitude: 19.945,
//   ...
// }
```

**Example**:
```typescript
import { seedResidence, polishCities } from '@test/shared/fixtures/geographic-auth';

describe('Distance Query Tests', () => {
  it('should find residences within 100km of Starachowice', async () => {
    // Create residences in different cities
    const user1 = await UserIdentityFixture.createAsync(db, { ... });
    const user2 = await UserIdentityFixture.createAsync(db, { ... });
    const user3 = await UserIdentityFixture.createAsync(db, { ... });

    // ✅ Use ready-to-use city data
    await seedResidence(db, user1, polishCities.STARACHOWICE);
    await seedResidence(db, user2, polishCities.WARSAW);    // ~150km away
    await seedResidence(db, user3, polishCities.KRAKOW);    // ~200km away

    // Test distance query
    const nearby = await db
      .selectFrom('user_residences')
      .where(/* PostGIS distance query within 100km */)
      .execute();

    expect(nearby).toHaveLength(1); // Only Starachowice
  });
});
```

---

### Authorization Context Seeders

**File**: `test/shared/fixtures/authorization/authorization-seeders.ts`
**Created**: TS-TEST-001 Week 3
**Use Cases**: E2E tests with authentication, role-based testing

#### `seedMultipleAuthorizedUsers()` - Batch User Creation

**Performance**: ~25ms per user (sequential)
**Creates**: Multiple users with auth + session + permissions + projections

**Use When**: Tests requiring many users (6+ participants, rate limit tests)

**Signature**:
```typescript
async function seedMultipleAuthorizedUsers(
  db: DbOrTrx,
  optionsList: AuthorizedUserOptions[]
): Promise<AuthorizedUserResult[]>
```

**Example**:
```typescript
import { seedMultipleAuthorizedUsers } from '@test/shared/fixtures/authorization';

describe('Rate Limiting - Multiple Participants', () => {
  it('should rate limit RSVP requests (10 per hour)', async () => {
    const { eventId } = await seedPastEvent(db, organizer.userId);

    // ✅ Batch create 11 participants (~275ms total)
    const participants = await seedMultipleAuthorizedUsers(
      db,
      Array(11).fill({
        customPermissions: [{ action: Action.CREATE, subject: Subject.COMMUNITY_EVENT }],
        createProjectionsFor: ['community-communication']
      })
    );

    // ✅ Parallel Redis session storage
    await Promise.all(
      participants.map(p => storeSessionInRedis(context.app, p))
    );

    // Test: Make 11 RSVP requests
    const responses = await Promise.all(
      participants.map(p =>
        request(app)
          .post(`/events/${eventId}/rsvp`)
          .set('Authorization', `Bearer ${p.accessToken}`)
          .send({ status: 'GOING' })
      )
    );

    const successfulRequests = responses.filter(r => r.status === 200);
    const tooManyRequests = responses.filter(r => r.status === 429);

    // Exactly 10 should succeed, 1 should be rate limited
    expect(successfulRequests.length).toBe(10);
    expect(tooManyRequests.length).toBe(1);
  });
});
```

**Anti-Pattern (Avoid)**:
```typescript
// ❌ OLD APPROACH: Sequential loops with individual Redis storage
const participants = [];
for (let i = 0; i < 11; i++) {
  const participant = await seedRegularUserE2E(db, { ... });
  await storeSessionInRedis(context.app, participant); // Sequential!
  participants.push(participant);
}
// Total: ~275ms + 11 Redis round-trips

// ✅ NEW APPROACH: Batch creation + parallel Redis
const participants = await seedMultipleAuthorizedUsers(db, Array(11).fill({ ... }));
await Promise.all(participants.map(p => storeSessionInRedis(context.app, p)));
// Total: ~275ms + parallel Redis (faster)
```

---

### User Projection Seeder (Cross-Context)

**File**: `test/shared/fixtures/authorization/user-projection-seeder.ts`
**Created**: TS-TEST-001 Week 4
**Use Cases**: Manual projection creation (rare - usually auto-created)

#### `seedUserProjectionForContext()` - Single Projection

**Performance**: ~5-10ms
**Creates**: User projection in specified context table

**Use When**: Manually creating projections (99% auto-created by seeders)

**Signature**:
```typescript
async function seedUserProjectionForContext(
  db: DbOrTrx,
  context: ContextWithUserProjection,
  userId: string,
  displayName?: string
): Promise<void>
```

**Example** (Rare - Usually Auto-Created):
```typescript
import { seedUserProjectionForContext } from '@test/shared/fixtures/authorization';

// ❌ RARELY NEEDED - Most seeders auto-create projections
await seedUserProjectionForContext(db, 'community-communication', userId);

// ✅ INSTEAD: Use opt-in pattern in seedRegularUserE2E
const user = await seedRegularUserE2E(db, {
  createProjectionsFor: ['community-communication'] // Auto-creates projection
});
```

#### `seedUserProjectionsForContexts()` - Batch Projections

**Performance**: ~5-10ms per context (parallel)
**Creates**: User projections in multiple contexts

**Signature**:
```typescript
async function seedUserProjectionsForContexts(
  db: DbOrTrx,
  contexts: ContextWithUserProjection[],
  userId: string,
  displayName?: string
): Promise<void>
```

**Example** (Rare):
```typescript
import { seedUserProjectionsForContexts } from '@test/shared/fixtures/authorization';

// ✅ If user needs projections in multiple contexts
await seedUserProjectionsForContexts(
  db,
  ['community-communication', 'engagement', 'neighborhood-economy'],
  userId
);
```

**Note**: 99% of time, use opt-in pattern in authorization seeders:
```typescript
const user = await seedRegularUserE2E(db, {
  createProjectionsFor: ['community-communication', 'engagement']
});
```

---

### Context-Specific Seeder Performance Comparison

| Operation | Performance | Auto-Creates Projections | Use Case |
|-----------|-------------|-------------------------|----------|
| **Events** |
| `seedPastEvent()` | ~15-20ms | ✅ Organizer projection | Feedback tests |
| `seedEventAttendee()` | ~10ms | ✅ Attendee projection | Attendance tests |
| `seedEventFeedback()` | ~10ms | ❌ | Existing feedback setup |
| **Geographic-Auth** |
| `seedResidence()` | ~10-15ms | ✅ Geographic projection | L2 residence tests |
| `seedResidenceE2E()` | ~30-40ms | ✅ Geographic projection | E2E verified residence |
| `polishCities.*` | 0ms | N/A | City data reference |
| **Authorization** |
| `seedMultipleAuthorizedUsers()` | ~25ms/user | ✅ All requested projections | Batch user creation |
| `seedUserProjectionForContext()` | ~5-10ms | N/A (manual) | Rare manual projections |
| `seedUserProjectionsForContexts()` | ~5-10ms/context | N/A (manual) | Rare batch projections |

---

### Key Insights from Context-Specific Seeders

1. **Auto-Projection Creation**: Most seeders auto-create user projections → avoid manual projection calls
2. **Batch Over Loops**: Use `seedMultipleAuthorizedUsers()` instead of loops with individual `seedRegularUserE2E()`
3. **Direct Past Events**: Use `seedPastEvent()` instead of two-phase API creation + database update
4. **Ready-to-Use Data**: Use `polishCities` instead of hardcoding coordinates
5. **L2 vs E2E Variants**: Use `seedResidence()` for L2, `seedResidenceE2E()` for E2E with capabilities

---

## Performance Optimization Summary

### Root Causes of 20-30s Test Times

| Cause | Impact | Solution |
|-------|--------|----------|
| Real password hashing | ~200ms per user | ✅ Use dummy hash (default in fixtures) |
| Full event flow | ~800ms per entity | ✅ Use createAsync() to bypass events |
| BullMQ startup wait | ~2s per suite | ✅ Required for event tests, skip for L1/L2 |
| Full DB cleanup | ~50-100ms | ✅ Acceptable, keep for isolation |
| Rate limit clearing | ~10ms | ✅ Skip for non-rate-limit tests |

### Expected Performance Improvements

| Test Type | Before (Full Flow) | After (Fixtures) | Improvement |
|-----------|-------------------|------------------|-------------|
| L1 Unit (10 tests) | N/A | <1s | - |
| L2 Handler (10 tests) | ~15s | ~3s | **5x faster** |
| L3 E2E (10 tests) | ~30s | ~10s | **3x faster** |

### Fast Test File Structure Example

```typescript
// Fast L2 handler test (~500ms total for 10 tests)
describe('CreateJobRequestHandler', () => {
  let context: TestAppContext;
  let userId: string;
  let residenceId: string;

  beforeAll(async () => {
    context = await testSetup.setup(); // ~2s, ONCE
  }, 120000);

  beforeEach(async () => {
    await context.cleaner.cleanPostgreSQL(); // ~50ms (skip Redis)

    // Fast fixture setup (~100ms total) — FixtureRegistry no longer exists
    // (removed as dead code, TS-TEST-FIXTURE-003); fixture immediate deps explicitly
    const { userId: newUserId } = await saveTestUnverifiedUserWithProjections(context.app);
    userId = newUserId;
    residenceId = await UserResidenceFixture.createAsync(db, { userId });
  });

  it('should create job request', async () => {
    const handler = context.app.get(CreateJobRequestHandler);
    const result = await handler.execute(new CreateJobRequestCommand({
      requesterId: userId,
      title: 'Need plumber',
      ...
    }));

    expect(result.isSuccess).toBe(true);
  });

  // 9 more tests...

  afterAll(async () => {
    await testSetup.cleanup(context);
  });
});
```

---

## Decision Trees

### Master Decision Tree

> Concepts below are generic (any aggregate). For `UserIdentity` specifically,
> read `createSync()` as "call the Mother directly", `createAsync()` as
> "`saveTest*User()` repository fixture or `saveTest*WithProjections()`
> composite", and note `createViaHandlers()` is unmigrated legacy API — see
> [`domain-colocated-fixture-mother-pattern.md`](./domain-colocated-fixture-mother-pattern.md).

```
What are you implementing?
│
├─ L1 Test (Aggregate/Spec/VO)?
│  └─ Mode: pure construction ALWAYS (Mother, direct call)
│  └─ Setup: beforeEach (pure functions)
│  └─ Performance: <1ms per test
│
├─ L2 Handler Test?
│  ├─ Testing handler orchestration?
│  │  └─ Mode: repository fixture / composite for setup
│  │  └─ Performance: ~60ms setup, test handler directly
│  │
│  ├─ Testing event handler?
│  │  └─ Mode: repository fixture / composite, eventDispatcher default 'real'
│  │  └─ Performance: ~60ms setup + real handler execution, no artificial wait needed for save itself
│  │
│  └─ Testing repository?
│     └─ Mode: Mother (pure construction) for aggregate
│     └─ Performance: <1ms, test save/load
│
└─ L3 E2E Test?
   ├─ Testing endpoint setup?
   │  └─ Mode: composite + HTTP calls
   │  └─ Performance: ~60ms setup, ~200ms per request
   │
   └─ Testing event flow end-to-end?
      └─ Mode: composite + HTTP + waitFor BullMQ (dispatcher stays 'real')
      └─ Performance: ~2s for full flow
```

### Fixture Mode Selection Decision Tree

```
What fixture mode? (UserIdentity-concrete, 2026-07-12)
│
├─ Mother, direct call → L1 tests (aggregate, spec, VO)
│  └─ No DB, no events, <1ms
│
├─ Repository fixture (saveTest*User()) → L2/L3 setup, no cross-context projection needed
│  └─ Real repository.save(), real events by default, ~62ms measured
│
├─ Composite (saveTest*WithProjections()) → L2/L3 setup needing another context's projection row
│  └─ Repository fixture + Promise.all over typed row-builders, ~60-70ms
│
└─ createViaHandlers() → legacy, unmigrated — verify it still exists before use
   └─ Full event flow through the old fixture class, ~800ms
```

### Rate Limiting Cleanup Decision Tree

```
Should I clear rate limits in beforeEach?
│
├─ Testing rate limiting? → YES (cleanAll)
├─ Testing auth endpoints? → YES (cleanAll)
├─ Using unique emails? → NO (cleanPostgreSQL)
└─ L1/L2 handler tests? → NO (cleanPostgreSQL)
```

---

## Project Context-Specific Examples

### Auth Context

```typescript
// L1 Aggregate Test
import { createUnverifiedUser } from '@contexts/auth/domain/aggregates/__fixtures__/user-identity.mother';

describe('UserIdentityAggregate', () => {
  it('should verify email', () => {
    const user = createUnverifiedUser({ email: createTestEmail({ value: 'test@example.com' }) });
    const token = user.generateEmailVerificationToken();
    user.verifyEmail(token);
    expect(user.isEmailVerified).toBe(true);
  });
});

// L2 Handler Test
import { saveTestVerifiedUserWithProjections } from '@test/shared/fixtures/auth/user-identity-composite.fixture';

describe('SetDateOfBirthHandler', () => {
  it('should set date of birth', async () => {
    const { userId } = await saveTestVerifiedUserWithProjections(context.app); // ~60ms, real save + real events
    const result = await handler.execute(new SetDateOfBirthCommand(userId, dob));
    expect(result.isSuccess).toBe(true);
  });
});

// L2 Event Handler Test — createViaHandlers() untouched by the migration, still legacy as of 2026-07-12
describe('UserRegisteredEventHandler', () => {
  it('should create permissions', async () => {
    const userId = await UserIdentityFixture.createViaHandlers(app, { ... }); // 800ms
    await waitFor(1000);
    const permissions = await db.selectFrom('user_permissions')...;
    expect(permissions).toHaveLength(1);
  });
});
```

### Authorization Context

```typescript
// L2 Handler Test (depends on Auth)
import { saveTestUnverifiedUserWithProjections } from '@test/shared/fixtures/auth/user-identity-composite.fixture';

describe('AssignRoleHandler', () => {
  it('should assign role', async () => {
    const { userId } = await saveTestUnverifiedUserWithProjections(context.app); // ~60ms
    const result = await handler.execute(new AssignRoleCommand(userId, 'MODERATOR'));
    expect(result.isSuccess).toBe(true);
  });
});

// L3 E2E Test - Using ADR-0061 Authorization Seeders
import {
  seedAdminUserE2E,
  seedModeratorUserE2E,
  seedRegularUserE2E,
  type AuthorizedUserWithSessionResult,
} from '../../../../test/shared/fixtures/authorization';
import { DatabaseService } from '../../../shared/database/database.service';

describe('Authorization E2E', () => {
  let dbService: DatabaseService;
  let adminUser: AuthorizedUserWithSessionResult;
  let testUser: AuthorizedUserWithSessionResult;

  beforeAll(async () => {
    context = await testSetup.setup();
    dbService = context.app.get(DatabaseService);
  }, 120000);

  beforeEach(async () => {
    await context.cleaner.cleanAll();
    await clearRateLimitingData(context.app);

    // ✅ Fast E2E seeders (~25ms each) - includes session + accessToken
    const db = dbService.getDatabase();
    adminUser = await seedAdminUserE2E(db);   // Role: ADMIN
    testUser = await seedRegularUserE2E(db);  // Role: USER
  });

  it('should assign role via HTTP', async () => {
    // ✅ Use .accessToken for Bearer header
    const response = await request(context.app.getHttpServer())
      .put(`/authorization/assign-role/${testUser.userId}`)  // ✅ Use .userId (not .id)
      .set('Authorization', `Bearer ${adminUser.accessToken}`)
      .send({ role: 'MODERATOR', reason: 'Promotion' })
      .expect(200);

    expect(response.body.data.role).toBe('moderator');
  });
});
```

**Authorization E2E Seeders (ADR-0061)**:

| Seeder | Role | Performance | Returns |
|--------|------|-------------|---------|
| `seedAdminUserE2E(db)` | ADMIN | ~25ms | `{ userId, accessToken, sessionId, email, permissionId, role }` |
| `seedModeratorUserE2E(db)` | MODERATOR | ~25ms | `{ userId, accessToken, sessionId, email, permissionId, role }` |
| `seedRegularUserE2E(db)` | USER | ~25ms | `{ userId, accessToken, sessionId, email, permissionId, role }` |

**Key Points**:
- **Use `.userId`** (not `.id`) - consistent with `AuthorizedUserWithSessionResult` type
- **Use `.accessToken`** for Bearer header - same value as `sessionId`
- Seeders auto-create: user, session, permissions, capabilities, projections
- ~25ms per user (94% faster than the old `AtomicCreators` ~400ms)
- ⚠️ **`AtomicCreators` — REMOVED** (`TS-TEST-FIXTURE-001` Faza 3, 2026-07-10): the file (`test/shared/test-data/atomic-creators.ts`, 1201 lines) was deleted entirely, not merely deprecated — a grep audit found `new AtomicCreators(` had zero real instances repo-wide (only its own JSDoc example matched). The two lightweight types some files still imported from it (`TestResidence`, `CustomPermission`) were relocated to `test/shared/test-data/types.ts` and inline in `permissions-seeder.ts` respectively. Use authorization seeders instead.

### Geographic-Auth Context

```typescript
// L2 Handler Test (depends on Auth + Residence)
describe('VerifyResidenceHandler', () => {
  it('should verify residence', async () => {
    const { userId } = await saveTestVerifiedUserWithProjections(context.app); // ~60ms
    const result = await handler.execute(new VerifyResidenceCommand(userId, address));
    expect(result.isSuccess).toBe(true);
  });
});
```

### Neighborhood-Economy Context (Quick Jobs)

```typescript
// L2 Handler Test (full dependency chain)
describe('CreateQuickJobHandler', () => {
  it('should create job and enqueue moderation', async () => {
    // ✅ Fixture dependencies (not testing user/residence creation)
    // FixtureRegistry no longer exists (removed as dead code, TS-TEST-FIXTURE-003)
    const { userId } = await saveTestUnverifiedUserWithProjections(context.app);

    // Test handler (THIS is what we're testing)
    const result = await handler.execute(new CreateQuickJobCommand(...));
    expect(result.isSuccess).toBe(true);

    // Verify moderation job enqueued
    expect(mockQueue.addCalls).toHaveLength(1);
  });
});

// L2 Event Handler Test
describe('JobRequestCreatedEventHandler', () => {
  it('should invalidate cache', async () => {
    // ✅ Real flow for job creation (event emission)
    const jobId = await QuickJobFixture.createViaHandlers(app, { ... }); // 800ms

    await waitFor(500);

    // Verify cache invalidated (event handler responsibility)
    expect(mockCacheService.invalidateCalls).toContainEqual(...);
  });
});
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using createViaHandlers() for Everything

```typescript
// ❌ WRONG: 800ms overhead in L2 handler test
describe('AssignRoleHandler', () => {
  it('should assign role', async () => {
    const userId = await UserIdentityFixture.createViaHandlers(app, { ... }); // 800ms
    // We're testing AssignRoleHandler, NOT user registration!
  });
});

// ✅ CORRECT: composite setup (~60ms, real save + real events, no full handler chain wait)
describe('AssignRoleHandler', () => {
  it('should assign role', async () => {
    const { userId } = await saveTestUnverifiedUserWithProjections(context.app); // ~60ms
  });
});
```

### Anti-Pattern 2: Capture-Mode Dispatcher for Event Handler Tests

```typescript
// ❌ WRONG: Event handler never runs
describe('UserRegisteredEventHandler', () => {
  it('should create permissions', async () => {
    // eventDispatcher: { mode: 'capture' } swaps in a no-op — bypasses events!
    const context = await testSetup.setup({ eventDispatcher: { mode: 'capture' } });
    const { userId } = await saveTestUnverifiedUser(context.app);
    // Handler didn't run, test will fail
    const permissions = await db.selectFrom('user_permissions')...;
    expect(permissions).toHaveLength(1); // ❌ FAIL: 0 permissions
  });
});

// ✅ CORRECT: default 'real' dispatcher — repository.save() emits real events, handler runs
describe('UserRegisteredEventHandler', () => {
  it('should create permissions', async () => {
    const { userId } = await saveTestUnverifiedUser(context.app); // eventDispatcher defaults to 'real'
    await waitFor(1000);
    const permissions = await db.selectFrom('user_permissions')...;
    expect(permissions).toHaveLength(1); // ✅ PASS
  });
});
```

> **Historical note**: prior to `TS-TEST-FIXTURE-001..006`, this anti-pattern
> was framed as "`createAsync()` (raw INSERT, bypasses events) vs.
> `createViaHandlers()` (full flow)". The raw-INSERT bypass no longer exists
> for `UserIdentity` — `repository.save()` always emits real events unless
> the DI-level `eventDispatcher: { mode: 'capture' }` override is used, which
> is the new (and only) way to intentionally suppress them.

### Anti-Pattern 3: Testing Aggregate Invariants at L2/L3

```typescript
// ❌ WRONG: Business rule tested at L2 (slow)
describe('SetDateOfBirthHandler', () => {
  it('should reject age below 16', async () => {
    // This is L1 Specification test disguised as L2!
  });
});

// ✅ CORRECT: Business rule at L1 Specification
describe('MinimumAgeSpecification', () => {
  it('should return false for age below 16', () => {
    const spec = new MinimumAgeSpecification();
    expect(spec.isSatisfiedBy({ age: 15 })).toBe(false);
  });
});

// ✅ CORRECT: Handler at L2 (orchestration only)
describe('SetDateOfBirthHandler', () => {
  it('should set date of birth successfully', async () => {
    const { userId } = await saveTestVerifiedUserWithProjections(context.app);
    const result = await handler.execute(new SetDateOfBirthCommand(userId, validDate));
    expect(result.isSuccess).toBe(true);
  });
});
```

### Anti-Pattern 4: Real Hash for Non-Auth Tests

```typescript
// ❌ WRONG: Real hash for event test (200ms overhead)
describe('CreateEventHandler', () => {
  it('should create event', async () => {
    // Using real registration endpoint → real hash (200ms)
    await request(app).post('/auth/register').send({ email, password }).expect(201);
    // We're NOT testing auth, why pay for real hashing?
  });
});

// ✅ CORRECT: Dummy hash via composite (~60ms)
describe('CreateEventHandler', () => {
  it('should create event', async () => {
    const { userId } = await saveTestUnverifiedUserWithProjections(context.app); // ~60ms
    // Still ~3-4x faster than real HTTP registration, same test coverage for events
  });
});
```

---

## Quick Reference Tables

### Mode Selection by Test Level

**Concepts** (generic, valid for any aggregate's fixture) mapped to the
**concrete `UserIdentity` API** as of 2026-07-12 — see
[`domain-colocated-fixture-mother-pattern.md`](./domain-colocated-fixture-mother-pattern.md)
for the full pattern:

| Test Level | Concept | Concrete `UserIdentity` API | When Alternative |
|------------|---------|------------------------------|------------------|
| **L1 Unit** | Pure construction, no DB/events | Mother directly (`createUnverifiedUser()` etc.) | Never — always pure construction at L1 |
| **L2 Handler** | Fast setup, real save, no full downstream handler wait | `saveTest*User()` (repository fixture) or `saveTest*WithProjections()` (composite, if another context's projection is read) | Testing event handlers → keep `eventDispatcher: { mode: 'real' }` (default) and wait for the handler |
| **L2 Event** | Full event flow through real handlers | Composite/repository fixture with default `eventDispatcher: { mode: 'real' }` + `waitFor()` | Testing handler in isolation → `eventDispatcher: { mode: 'capture' }` + assert on the captured dispatcher |
| **L3 E2E Setup** | Fast setup for dependencies you don't test | Composite (`saveTest*WithProjections()`) | Testing auth flow specifically → real HTTP registration |
| **L3 E2E Event** | Composite/repository fixture + HTTP for what you test | Composite + HTTP | Testing full event flow end-to-end → default `eventDispatcher: { mode: 'real' }`, no override needed |

`createViaHandlers()` (the old "Mode 3 / Traditional" on the legacy
`UserIdentityFixtureClass`) was **not** part of the `TS-TEST-FIXTURE-001..006`
migration and may still exist on the legacy class as of 2026-07-12 — verify
before relying on it in new code; prefer the real-dispatcher composite/repository
fixture path above.

### Performance Comparison

| Operation | Time | Use Case |
|-----------|------|----------|
| Mother, direct call (e.g. `createUnverifiedUser()`) | <1ms | L1 tests |
| `saveTest*User()` (repository fixture, Mother + real `repository.save()`) | ~62ms (measured, `TS-TEST-FIXTURE-001` Faza 2+, capture mode, 20 calls avg) | L2/L3 setup, no cross-context projections needed |
| `saveTest*WithProjections()` (composite) | ~60-70ms (repository fixture + `Promise.all` over 6-7 typed row-builders) | L2/L3 setup needing another context's projection row |
| `createViaHandlers()` (legacy, unmigrated) | ~800ms | Historical — verify it still exists before using |
| seedAdminUserE2E() | ~25ms | Authorization E2E tests |
| seedModeratorUserE2E() | ~25ms | Authorization E2E tests |
| seedRegularUserE2E() | ~25ms | Authorization E2E tests |
| HTTP registration | ~600ms | L3 auth tests |
| Real password hash | ~200ms | Auth login tests |
| Dummy password hash | <1ms | All other tests |

### Cleanup Strategy

| Cleanup Method | Time | Clears | When to Use |
|----------------|------|--------|-------------|
| `cleanPostgreSQL()` | ~50ms | DB tables only | Standard tests |
| `cleanAll()` | ~60ms | DB + Redis | Rate limit tests, auth tests |

---

## References

**ADRs**:
- [ADR-0035: Specification-First Testing Strategy](docs/adr/0035-specification-first-testing-strategy.md)
- [ADR-0061: Hybrid Fixture System](docs/adr/0061-hybrid-fixture-system-test-data-seeding.md)

**Patterns**:
- [Testing Pyramid Pattern](.claude/knowledge/patterns/testing/testing-pyramid-pattern.md)
- [Aggregate Pattern](.claude/knowledge/patterns/domain/aggregate-pattern.md)
- [Domain Event Pattern](.claude/knowledge/patterns/domain/domain-event-pattern.md)
- [Domain-Colocated Fixture Mother Pattern](./domain-colocated-fixture-mother-pattern.md) — canonical replacement for `UserIdentityFixture.createAsync()`/`createSync()` as of `TS-TEST-FIXTURE-001..006` (2026-07-10/12)
- [Typed Projection Row-Builder Pattern](./typed-projection-row-builder-pattern.md) — Category 2 (cross-context projection tables) detail

**Real Examples**:
- `src/contexts/auth/domain/aggregates/__fixtures__/user-identity.mother.ts` — canonical construction
- `test/shared/fixtures/auth/user-identity-repository.fixture.ts` / `user-identity-composite.fixture.ts` — canonical persistence
- `test/shared/fixtures/auth/user-identity-fixture-class.ts` — legacy class, `createProjections()` kept as a permanent exception (`TEST-D001`, closed via `TS-TEST-FIXTURE-006`), not scheduled for deletion
- `src/contexts/auth/application/commands/set-date-of-birth/__tests__/handler.integration.spec.ts`
- `src/app/api/auth/auth-core.e2e.spec.ts`

**E2E Testing Guide**:
- [E2E Testing Guide](test/shared/E2E_TESTING_GUIDE.md)

---

**Version History**:
- 2.1 (2026-07-13): `TS-TEST-FIXTURE-006` is closed (was still described as "blocked" in two places) —
  corrected wording to "closed as a permanent, intentional exception (`TEST-D001`)" wherever this
  guide referenced it. No API/content changes, wording-only.
- 2.0 (2026-07-12): Migrated `UserIdentity` mode-selection guidance to the domain-colocated Mother pattern (`TS-TEST-FIXTURE-001..006`)
  - **NEW**: "Status migracji [2026-07-12]" section at top — links to `domain-colocated-fixture-mother-pattern.md`
  - Rewrote `Fixture Mode Selection`, `Cross-Context Dependencies`, `Project Context-Specific Examples`, `Anti-Patterns to Avoid`, `Decision Trees`, and `Quick Reference Tables` to reference the Mother + repository fixture + composite (`saveTest*WithProjections()`) instead of `UserIdentityFixture.createAsync()`/`.createSync()` as the concrete API
  - Corrected `FixtureRegistry.createMany()` examples — that class was found to be dead code (zero real consumers) and **deleted** in `TS-TEST-FIXTURE-003`, not merely unused
  - Corrected `AtomicCreators` from "DEPRECATED" to **REMOVED** (`TS-TEST-FIXTURE-001` Faza 3 — file deleted, zero real consumers found on re-audit)
  - Corrected `Events Context Seeders` — `event-seeders.ts` consolidated into `EventTestFixtures` (`TS-TEST-FIXTURE-003`), file removed
  - Left unchanged, per explicit scope: `Core Principle`, `Context-Specific Seeders` (`geographic-auth`/`authorization` subsections), `Password Hashing Optimization`
  - Documented current migration status: 133/135 real `UserIdentityFixture` consumers migrated; `createProjections()` on the legacy class still physically exists, retirement blocked on `TS-TEST-FIXTURE-006`
- 1.3 (2026-01-09): Added Context-Specific Seeders section (TS-TEST-001 Week 4)
  - **NEW SECTION**: Context-Specific Seeders (~600 lines)
  - **Events Context Seeders**: `seedPastEvent()`, `seedEventAttendee()`, `seedEventFeedback()`
  - **Geographic-Auth Context Seeders**: `seedResidence()`, `seedResidenceE2E()`, `polishCities`
  - **Authorization Context Seeders**: `seedMultipleAuthorizedUsers()` batch creation
  - **User Projection Seeders**: `seedUserProjectionForContext()`, `seedUserProjectionsForContexts()`
  - Performance comparison table: All seeders 5-50ms (vs 800ms full flow)
  - Key insights: Auto-projection creation, batch over loops, direct past events
  - Anti-patterns documented: Two-phase event creation, sequential loops
  - Purpose: Ensure agents know about and use specialized seeders (not just generic fixtures)
- 1.2 (2026-01-08): AtomicCreators marked as DEPRECATED (TS-TEST-001 Week 3 complete)
  - ⚠️ **AtomicCreators fully deprecated** - replaced by authorization seeders
  - All geographic-auth E2E tests migrated (9 files, 493 tests)
  - Zero AtomicCreators usage remaining in E2E tests
- 1.1 (2026-01-07): Added Authorization E2E seeders documentation (TS-TEST-001 Week 3)
  - New seeders: `seedAdminUserE2E()`, `seedModeratorUserE2E()`, `seedRegularUserE2E()`
  - Returns `AuthorizedUserWithSessionResult` with `.userId`, `.accessToken`, `.sessionId`
  - Performance: ~25ms per user (94% faster than deprecated AtomicCreators)
- 1.0 (2026-01-06): Initial version based on Week 2 auth migration learnings
  - Combined technical performance optimization with DDD-aligned domain integrity
  - Validated by @backend-technology-expert and @ddd-application-expert
