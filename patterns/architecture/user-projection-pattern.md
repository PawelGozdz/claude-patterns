# User Projection Pattern

## 🎯 Problem

**Multiple bounded contexts need user data, but cross-context JOINs violate DDD principles.**

In a DDD monolith with multiple bounded contexts:
- Each context needs SOME user data (not all PII from auth context)
- Direct FK to `users` table creates tight coupling between contexts
- Cross-context SQL JOINs break bounded context autonomy
- GDPR data minimization requires contexts to store only what they need
- Future microservice migration requires eventual consistency

**Real Project Example**: Geographic-auth context needs `age` and `verification_level` for location access policies, but NOT `email`/`password` from auth context.

## ✅ Solution

**User Projection Pattern** creates per-context user projection tables (`{context}_users`) synchronized via integration events from auth context.

**Key Components**:
1. **Source**: Auth context's `users` table (single source of truth)
2. **Projections**: Per-context `{context}_users` tables with ONLY needed fields
3. **Sync**: Integration events (`UserRegistered`, `UserProfileUpdated`, `UserDeleted`)
4. **Event Handlers**: Thin handlers dispatching commands for atomic updates
5. **Pragmatic FKs**: FK to `users(id)` for monolith integrity (removed for microservices)

## 🔧 Implementation

### Step 1: Create Projection Table (Per Context)

**Real Project Code** from `geographic-auth` context migration:

```sql
-- Migration: contexts/geographic-auth/migrations/YYYYMMDD_create_geographic_auth_users_table.sql
CREATE TABLE geographic_auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Pragmatic FK for monolith
  date_of_birth DATE, -- For age-based policies (NOT stored as age)
  display_name VARCHAR(255), -- For UI display
  profile_picture_url TEXT, -- For avatars
  primary_residence_id UUID, -- Context-specific field
  verification_level VARCHAR(50) NOT NULL DEFAULT 'UNVERIFIED', -- Context-specific field
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Eventual consistency tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id) -- One projection per auth user
);

CREATE INDEX idx_geographic_auth_users_user_id ON geographic_auth_users(user_id);
CREATE INDEX idx_geographic_auth_users_verification_level ON geographic_auth_users(verification_level);
```

**Field Selection Principles**:
- ✅ **Include**: Fields needed for business rules in THIS context
- ❌ **Exclude**: PII not needed (GDPR data minimization)
- ✅ **Add**: Context-specific fields (`verification_level`, `primary_residence_id`)
- ✅ **Always**: `synced_at` for eventual consistency debugging

### Step 2: Create Repository (Template Method Pattern)

**Real Project Code** from `geographic-auth/infrastructure/repositories/user-read-model.kysely.repository.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import type { Selectable } from 'kysely';
import { BaseUserReadModelRepository } from '@shared/infrastructure/repositories/base-user-read-model.repository';

/**
 * Geographic-auth specific user projection repository
 * Extends shared base class - only implements 4 template methods
 * Code reduction: 196 LoC → 60 LoC (70% savings)
 */
@Injectable()
export class UserReadModelKyselyRepository
  extends BaseUserReadModelRepository<
    UserReadModelDto,
    CreateUserReadModelInput,
    UpdateUserReadModelInput
  >
  implements IUserReadModelRepository
{
  /**
   * Table name for this context's projection
   */
  protected getTableName(): string {
    return 'geographic_auth_users';
  }

  /**
   * Map database row to DTO (snake_case → camelCase)
   */
  protected mapToDto(row: Selectable<GeographicAuthUsersTable>): UserReadModelDto {
    return {
      id: row.id,
      userId: row.user_id,
      dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth) : null,
      displayName: row.display_name ?? null,
      profilePictureUrl: row.profile_picture_url ?? null,
      primaryResidenceId: row.primary_residence_id, // Context-specific
      verificationLevel: row.verification_level, // Context-specific
      syncedAt: row.synced_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Map create input to database fields
   */
  protected mapCreateInput(input: CreateUserReadModelInput): Partial<GeographicAuthUsersTable> {
    return {
      user_id: input.userId,
      date_of_birth: input.dateOfBirth?.toISOString().split('T')[0] ?? null,
      display_name: input.displayName ?? null,
      profile_picture_url: input.profilePictureUrl ?? null,
      verification_level: input.verificationLevel ?? 'UNVERIFIED',
      synced_at: new Date(),
    };
  }

  /**
   * Map update input to database fields (only defined fields updated)
   */
  protected mapUpdateInput(input: UpdateUserReadModelInput): Partial<GeographicAuthUsersTable> {
    const updateData: Partial<GeographicAuthUsersTable> = {};

    if (input.dateOfBirth !== undefined) {
      updateData.date_of_birth = input.dateOfBirth?.toISOString().split('T')[0] ?? null;
    }
    if (input.displayName !== undefined) updateData.display_name = input.displayName;
    if (input.profilePictureUrl !== undefined) updateData.profile_picture_url = input.profilePictureUrl;
    if (input.verificationLevel !== undefined) updateData.verification_level = input.verificationLevel;

    updateData.synced_at = new Date();
    return updateData;
  }
}
```

**Base class provides**: `create()`, `findByUserId()`, `updateByUserId()`, `deleteByUserId()`, `exists()`

### Step 3: Create Event Handlers (Thin Handlers → Commands)

**Real Project Code** from `engagement/application/event-handlers/user-registered.handler.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { ICommandBus, Result, safeRun } from '@vytches/ddd';
import { UserRegisteredIntegrationEvent } from '@shared/domain/integration-events/user-registered.integration-event';
import { CreateUserReadModelCommand } from '../commands/create-user-read-model/command';

/**
 * THIN Handler: UserRegistered event → CreateUserReadModelCommand
 *
 * NO @EventHandler decorator - manually registered in EngagementModule.onModuleInit()
 * to prevent synchronous execution during parent transaction.
 *
 * IntegrationEventsQueueProcessor includes 200ms delay for MVCC visibility.
 */
@Injectable()
export class UserRegisteredHandler {
  constructor(
    @Inject(LOGGER_SERVICE) private readonly logger: ILoggerService,
    @Inject(ICommandBus) private readonly commandBus: ICommandBus
  ) {}

  async handle(event: UserRegisteredIntegrationEvent): Promise<void> {
    try {
      this.logger.info('Processing UserRegistered event in engagement context', {
        userId: event.userId,
        hasDateOfBirth: !!event.dateOfBirth,
      });

      // Create command to dispatch to THICK handler
      const createReadModelCommand = new CreateUserReadModelCommand(
        event.userId,
        event.dateOfBirth || null,
        event.displayName,
        event.profilePictureUrl
      );

      // Execute command via CommandBus (handler has @Transactional)
      const [error, result] = await safeRun(() =>
        this.commandBus.execute(createReadModelCommand)
      );

      if (error || (result && 'isFailure' in result && result.isFailure)) {
        this.logger.error('Failed to create user read-model', { error, result });
        return; // Don't rethrow - log and continue
      }

      this.logger.info('Successfully created user read-model for new user', {
        userId: event.userId,
        readModelId: result?.value,
      });
    } catch (error) {
      this.logger.error('Unexpected error processing UserRegistered event', { error });
      // Don't rethrow - prevents event processing failure
    }
  }
}
```

**Key Pattern**: Event Handler (THIN) → Command → Command Handler (THICK with `@Transactional`)

### Step 4: Register Event Handler Manually

**Real Project Code** from `engagement/engagement.module.ts`:

```typescript
import { OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

export class EngagementModule implements OnModuleInit {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly userRegisteredHandler: UserRegisteredHandler,
    private readonly userProfileUpdatedHandler: UserProfileUpdatedHandler
  ) {}

  onModuleInit() {
    // Manual registration - prevents synchronous execution during transaction
    // IntegrationEventsQueueProcessor adds 200ms delay for MVCC visibility
    this.eventEmitter.on('user.registered', (event) =>
      this.userRegisteredHandler.handle(event)
    );
    this.eventEmitter.on('user.profile.updated', (event) =>
      this.userProfileUpdatedHandler.handle(event)
    );
  }
}
```

### Step 5: Update Internal Tables (Use Projection)

**BEFORE** (cross-context FK):

```sql
-- ❌ WRONG: FK to auth context's users table
CREATE TABLE engagement_actions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id), -- Cross-context!
  action_type VARCHAR(50),
  ...
);
```

**AFTER** (local projection FK):

```sql
-- ✅ CORRECT: FK to local engagement_users projection
CREATE TABLE engagement_actions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES engagement_users(id), -- Local projection!
  action_type VARCHAR(50),
  ...
);
```

## 📋 Rules

### MUST

- ✅ **MUST** create `{context}_users` table for EACH context needing user data
- ✅ **MUST** include ONLY fields needed by THIS context (GDPR minimization)
- ✅ **MUST** add `synced_at TIMESTAMPTZ` for eventual consistency tracking
- ✅ **MUST** have `UNIQUE(user_id)` constraint (one projection per auth user)
- ✅ **MUST** subscribe to `UserRegistered`, `UserDeleted` events (minimum)
- ✅ **MUST** make event handlers idempotent (check existence before INSERT)
- ✅ **MUST** use THIN event handlers → THICK command handlers with `@Transactional`
- ✅ **MUST** update internal tables to FK local projection (not `users`)

### MUST NOT

- ❌ **MUST NOT** store PII not needed by context (GDPR violation)
- ❌ **MUST NOT** JOIN across `users` and `{context}_users` in queries
- ❌ **MUST NOT** use `@EventHandler` decorator (synchronous execution risk)
- ❌ **MUST NOT** throw exceptions from event handlers (breaks event processing)
- ❌ **MUST NOT** store password hashes outside auth context
- ❌ **MUST NOT** duplicate email/phone unless absolutely required

## ⚠️ Anti-Patterns

### Anti-Pattern 1: Cross-Context JOINs

```sql
-- ❌ WRONG: Joining auth context table with local context table
SELECT
  e.id,
  u.email, -- From auth context!
  e.action_type
FROM engagement_actions e
INNER JOIN users u ON u.id = e.user_id; -- Violates DDD!
```

**Why Bad**: Breaks bounded context isolation, couples contexts at database level, prevents microservice migration.

**Fix**: Store needed fields in local projection or use ACL Registry for runtime queries.

### Anti-Pattern 2: Storing All User Fields

```sql
-- ❌ WRONG: Copying all fields from users table
CREATE TABLE engagement_users (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  email VARCHAR(255), -- Not needed for engagement!
  password_hash VARCHAR(255), -- SECURITY RISK!
  phone VARCHAR(20), -- Not needed for engagement!
  date_of_birth DATE, -- OK if needed
  ...
);
```

**Why Bad**: GDPR data minimization violation, security risk (password leak), unnecessary storage.

**Fix**: Store ONLY fields needed for business rules in this context.

### Anti-Pattern 3: Synchronous Event Handlers

```typescript
// ❌ WRONG: @EventHandler decorator causes synchronous execution
@EventHandler(UserRegisteredEvent) // Runs DURING parent transaction!
async onUserRegistered(event) {
  await this.repo.create(...); // FK violation risk (MVCC not visible yet)
}
```

**Why Bad**: Runs synchronously during parent transaction, MVCC visibility issues, FK violations.

**Fix**: Manual registration in `onModuleInit()` with IntegrationEventsQueueProcessor (200ms delay).

### Anti-Pattern 4: Non-Idempotent Handlers

```typescript
// ❌ WRONG: No existence check - duplicate key error on retry
async handle(event: UserRegisteredIntegrationEvent) {
  await this.repo.create({ userId: event.userId, ... }); // Fails on retry!
}
```

**Why Bad**: Event replay causes duplicate key errors, not idempotent.

**Fix**: Check existence before INSERT or use `ON CONFLICT DO NOTHING`.

## 📚 References

### ADRs
- **ADR-0025**: Hybrid Event System (Integration Events for cross-context sync)
- **ADR-0035**: Testing Pyramid (L1/L2/L3 test distribution)

### Related Patterns
- **ACL Registry Pattern**: For immediate cross-context queries (when events not sufficient)
- **Event-Driven Projection Pattern**: Thin handlers → thick command handlers

### Implementation Files
- `src/shared/infrastructure/repositories/base-user-read-model.repository.ts` - Shared base class
- `src/contexts/engagement/infrastructure/repositories/user-read-model.kysely.repository.ts` - Engagement projection
- `src/contexts/geographic-auth/infrastructure/repositories/user-read-model.kysely.repository.ts` - Geographic-auth projection
- `src/contexts/engagement/application/event-handlers/user-registered.handler.ts` - Event handler example

### Reference Documentation
- `.claude/knowledge/learned/user-projection-matrix.md` - Complete matrix of all context projections

## 🎯 When to Use

**Use User Projection Pattern when:**

1. ✅ **Context Needs User Data** - Business rules require user fields
2. ✅ **Data Minimization** - Context needs SOME fields, not all from auth
3. ✅ **Eventual Consistency OK** - Projection can be slightly delayed (200ms)
4. ✅ **Future Microservices** - Planning to split contexts later

**Do NOT use when:**

1. ❌ **Immediate Consistency Required** - Use ACL Registry instead
2. ❌ **Read-Only Access** - Use ACL Registry for one-off queries
3. ❌ **Same Context** - Use direct FK to local aggregate tables

### Projection Matrix (Quick Reference)

| Context | Local Table | Fields Needed | Events Subscribed |
|---------|-------------|---------------|-------------------|
| **auth** | `users` | ALL (source of truth) | - (is source) |
| **geographic-auth** | `geographic_auth_users` | dateOfBirth, displayName, verification_level | UserRegistered, UserProfileUpdated, UserDeleted |
| **engagement** | `engagement_users` | dateOfBirth, displayName | UserRegistered, UserProfileUpdated, UserDeleted |
| **local-services** | `local_services_users` | dateOfBirth, trust_score, capabilities | UserRegistered, UserProfileUpdated, TrustScoreChanged |
| **community-communication** | `community_comm_users` | dateOfBirth, displayName | UserRegistered, UserProfileUpdated, UserDeleted |

### GDPR Compliance

**Data Minimization**:
```
Auth Context:      email, phone, password, DOB, name
Geographic-Auth:   DOB (NOT email/phone/password)
Engagement:        DOB (NOT email/phone/password)
```

**Right to Erasure** (`UserDeletedEvent`):
1. Auth context emits `UserDeletedEvent`
2. Each context handler deletes local projection
3. CASCADE constraints delete related data
4. User data purged across all contexts

### Testing Strategy

**L1 Tests (Unit)**: Repository methods with mocked database
**L2 Tests (Integration)**: Event handlers with real CommandBus
**L3 Tests (E2E)**: Full event flow from auth → all projections

```typescript
// L2 Test: UserRegisteredHandler
it('should create user read-model when UserRegistered event received', async () => {
  const event = new UserRegisteredIntegrationEvent({
    userId: 'user-1',
    dateOfBirth: new Date('1990-01-01'),
    displayName: 'Test User',
  });

  await handler.handle(event);

  const projection = await repo.findByUserId('user-1');
  expect(projection).toBeDefined();
  expect(projection.displayName).toBe('Test User');
});
```

### Test Data Seeding for Cross-Context Tests

**Problem**: E2E tests in one context (e.g., `neighborhood-economy`) need data from another context (e.g., `geographic-auth` residences) to function correctly, especially for geographic filtering.

**Why This Matters**:
- Geographic filtering in moderation requires user residences synchronized to context projections
- Tests in `neighborhood-economy` query local `neighborhood_economy_users` table (not `geographic_auth.user_residences`)
- Without projection sync, tests fail with "no results found" even though residences exist in `geographic_auth`

#### Pattern A: Seeding with Projection Sync (Cross-Context Tests)

**Use When**: Testing features that depend on data from another context (e.g., geographic filtering in moderation)

```typescript
import {
  seedResidence,
  syncResidenceToContextProjections
} from '@test/shared/fixtures/geographic-auth/geographic-auth-seeders';

it('should filter content by user city', async () => {
  // STEP 1: Create user in auth context
  const user = await seedRegularUserE2E(db, {
    createProjectionsFor: ['engagement', 'neighborhood-economy'],
  });

  // STEP 2: Create residence in geographic-auth context
  const residence = await seedResidence(
    db,
    user.userId,
    polishCities.STARACHOWICE_GMINA
  );

  // STEP 3: Sync residence to target context projections
  // CRITICAL: Without this, neighborhood-economy can't see the residence!
  await syncResidenceToContextProjections(
    db,
    user.userId,
    residence.residenceId,
    ['neighborhood-economy'] // Target context(s)
  );

  // STEP 4: Create content in target context
  const content = await seedCommentE2E(db, user.userId, {
    moderationStatus: 'pending',
  });

  // STEP 5: Query with geographic filter (uses synced projections)
  const response = await request(app)
    .get('/moderation/queue')
    .set('Authorization', `Bearer ${moderator.accessToken}`)
    .query({
      'geographicFilter[type]': 'city',
      'geographicFilter[cityCode]': '2612053', // Starachowice
    });

  // ✅ Content is returned because residence was synced to neighborhood-economy
  const contentIds = response.body.data.items.map(item => item.contentId);
  expect(contentIds).toContain(content.commentId);
});
```

#### Pattern B: Seeding Without Projection Sync (Single Context Tests)

**Use When**: Testing features within geographic-auth context only

```typescript
it('should calculate trust score based on residence distance', async () => {
  const user = await seedRegularUserE2E(db);

  // Residence only needed in geographic-auth context
  const residence = await seedResidence(
    db,
    user.userId,
    polishCities.STARACHOWICE_GMINA
  );
  // No syncResidenceToContextProjections() needed!

  // Test geographic-auth functionality
  const response = await request(app)
    .get('/geographic-auth/trust-score')
    .set('Authorization', `Bearer ${user.accessToken}`);

  expect(response.body.data.trustScore).toBeGreaterThan(0);
});
```

#### Available Projection Contexts

```typescript
// Supported contexts for syncResidenceToContextProjections():
await syncResidenceToContextProjections(db, userId, residenceId, [
  'engagement',              // For user interactions (comments, likes, shares)
  'neighborhood-economy',    // For geographic filtering in moderation
  'community-communication', // For local announcements and alerts
]);
```

#### Real-World Example: Geographic Filtering Tests

**File**: `src/app/api/moderation/__tests__/geographic-filtering-powiat.e2e.spec.ts`

```typescript
async function seedTestContent(): Promise<void> {
  const db = context.app.get(DatabaseService).getDatabase();

  // User from Starachowice (powiat starachowicki = 2612)
  const starachowiceResidence = await seedResidence(
    db,
    regularUser.userId,
    polishCities.STARACHOWICE_GMINA
  );

  // CRITICAL: Sync residence to context projections
  // Geographic filtering in moderation queries neighborhood_economy_users
  await syncResidenceToContextProjections(
    db,
    regularUser.userId,
    starachowiceResidence.residenceId,
    ['engagement', 'neighborhood-economy', 'community-communication']
  );

  // Now create content that will be filtered by city
  const comment = await seedCommentE2E(db, regularUser.userId, {
    content: 'Comment from starachowicki powiat',
    moderationStatus: 'pending',
  });

  starachowiceCommentId = comment.commentId;
}
```

#### Anti-Pattern: Direct Cross-Context JOINs

```typescript
// ❌ WRONG: Querying geographic_auth directly from neighborhood-economy
SELECT c.*, r.city_code
FROM neighborhood_economy.comments c
JOIN geographic_auth.user_residences r ON r.user_id = c.author_id
WHERE r.city_code = '2612053';
-- Violates bounded context isolation!

// ✅ CORRECT: Query synced projections in same context
SELECT c.*, u.primary_residence_city_code
FROM neighborhood_economy.comments c
JOIN neighborhood_economy_users u ON u.user_id = c.author_id
WHERE u.primary_residence_city_code = '2612053';
-- Uses synced projection within bounded context
```

#### Troubleshooting

**Problem**: Test returns no results even though residences exist

**Symptoms**:
```typescript
const response = await request(app).get('/moderation/queue?geographicFilter[type]=city&geographicFilter[cityCode]=2612053');
expect(response.body.data.items).toHaveLength(1); // ❌ Fails - length is 0
```

**Root Cause**: Residence created in `geographic_auth` but NOT synced to `neighborhood_economy_users` projection

**Fix**:
```typescript
// Add this AFTER seedResidence():
await syncResidenceToContextProjections(
  db,
  user.userId,
  residence.residenceId,
  ['neighborhood-economy'] // Target context for moderation filtering
);
```

#### When to Sync Projections (Decision Tree)

```
Test scenario:
    |
    ├─ Testing geographic-auth features only?
    |   └─ NO sync needed (single context)
    |
    ├─ Testing moderation with geographic filtering?
    |   └─ Sync to ['neighborhood-economy']
    |
    ├─ Testing engagement features with location?
    |   └─ Sync to ['engagement']
    |
    ├─ Testing community alerts with location?
    |   └─ Sync to ['community-communication']
    |
    └─ Testing multiple features across contexts?
        └─ Sync to ALL relevant contexts:
            await syncResidenceToContextProjections(db, userId, residenceId, [
              'engagement',
              'neighborhood-economy',
              'community-communication',
            ]);
```

#### Key Principles

1. **Projection Sync is Explicit**: Not automatic - you must call `syncResidenceToContextProjections()`
2. **Bounded Context Isolation**: Each context queries its own `{context}_users` table
3. **Test Realism**: Syncing simulates the event flow that happens in production (ResidenceCreated → projections)
4. **Performance**: Sync only to contexts you're testing (not all contexts)

#### Related Patterns

- **Rate Limit Testing Pattern**: Concurrent requests for reliable rate limiting (`.claude/knowledge/patterns/testing/rate-limit-testing-pattern.md`)
- **Redis Test Isolation Pattern**: Cache clearing for fresh test data (`.claude/knowledge/patterns/testing/redis-test-isolation-pattern.md`)
- **E2E Testing Guide**: Test data seeding best practices (`test/shared/E2E_TESTING_GUIDE.md`)

---

**Pattern Discovered**: 2025-12-18 (TS-USER-PROJECTION-001)
**Status**: Production (3 contexts implemented)
**Lines**: 298
