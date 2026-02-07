# Repository Pattern

## 🎯 Problem

**Challenges with repository implementation**:
- Code duplication across repositories → 80% duplicate code in auth repositories
- Manual transaction management → database connection pool exhaustion
- Missing optimistic locking → concurrent modification bugs
- Inconsistent event handling → missing eventMap registration causes runtime errors
- Manual version tracking → race conditions in high-concurrency scenarios
- No separation of read/write concerns → inefficient queries

**Real-world pain points**:
- **Production bug (2025-12-25)**: Missing event in eventMap → `TypeError: event.getChangeReason is not a function`
- **Performance issue**: Loading aggregate for read queries → 10x slower than read models
- **Concurrency bug**: Two users editing same comment → lost update (no optimistic locking)
- **Memory leak**: Forgot to commit transaction → database connection pool exhausted after 50 requests

---

## ✅ Solution

**Repository pattern with**:
- **BaseKyselyRepository** extension → eliminates 80% code duplication
- **CQRS separation**: Command repositories (write) vs Query repositories (read)
- **Optimistic locking**: aggregate_versions table join pattern
- **Event handling**: 3-layer protection (imports, eventMap, verification test)
- **Upsert pattern**: Configurable conflict resolution
- **Mapper integration**: Type-safe toDomain() / toPersistence()
- **Transaction management**: TransactionHost automatic handling
- **Result pattern**: Return `Result<T, Error>` for all operations

---

## 🔧 Implementation

### Example 1: CommentCommandKyselyRepository (Write-Side)

**File**: `src/contexts/engagement/infrastructure/repositories/comment-command-kysely.repository.ts` (~250 lines)

**Key characteristics**:
- Extends BaseKyselyRepository
- 3-layer event protection (imports, eventMap, verification test)
- Optimistic locking via aggregate_versions join
- Upsert with conflict resolution
- TransactionHost for automatic transaction management

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterKysely } from '@nestjs-cls/transactional-adapter-kysely';
import { IEnhancedEventDispatcher, IEventPersistenceHandler, Result } from '@vytches/ddd';
import { sql } from 'kysely';

import type { Database } from '@shared/database/types/database.types';
import { ProjectDomainEvent } from '@shared/domain/events/project-domain-event.base';
import {
  BaseKyselyRepository,
  EVENT_PERSISTENCE_HANDLER_TOKEN,
  UNIVERSAL_EVENT_DISPATCHER_TOKEN,
  type IRepositoryConfig,
} from '@shared/infrastructure';
import { SystemCryptoService } from '@shared/infrastructure/security/system-crypto.service';

import { CommentAggregate } from '../../domain/aggregates/comment.aggregate';

// ========================================
// Layer 1: Comprehensive Event Imports (ALL events from context)
// ========================================
import {
  CommentCreatedEvent,
  CommentDeletedEvent,
  CommentEditedEvent,
  CommentModeratedEvent,
} from '../../domain/events';
import type { ICommentCommandRepository } from '../../domain/repositories/comment-command.repository';
import { CommentRepositoryError } from '../../domain/repositories/comment-command.repository';
import { CommentId, NestingLevel } from '../../domain/value-objects';

import { CommentAggregateMapper } from './mappers/comment-aggregate.mapper';

/**
 * Kysely-based implementation of Comment Command Repository
 *
 * Performance targets:
 * - findById() operations <5ms
 * - Save operations with event handling <10ms
 * - getParentInfo() <5ms (for reply validation)
 */
@Injectable()
export class CommentCommandKyselyRepository
  extends BaseKyselyRepository<CommentAggregate, CommentRepositoryError, 'engagement_comments'>
  implements ICommentCommandRepository
{
  private readonly commentMapper: CommentAggregateMapper;

  constructor(
    // 1. ✅ TransactionHost for automatic transaction management
    @Inject(TransactionHost) txHost: TransactionHost<TransactionalAdapterKysely<Database>>,

    // 2. ✅ Mapper for toDomain() / toPersistence()
    @Inject(CommentAggregateMapper) mapper: CommentAggregateMapper,

    // 3. ✅ Event handling infrastructure
    @Inject(UNIVERSAL_EVENT_DISPATCHER_TOKEN) eventDispatcher: IEnhancedEventDispatcher,
    @Inject(EVENT_PERSISTENCE_HANDLER_TOKEN) eventPersistenceHandler: IEventPersistenceHandler,

    // 4. ✅ GDPR crypto for PII encryption
    @Inject(SystemCryptoService) systemCrypto: SystemCryptoService
  ) {
    super('engagement_comments', txHost, mapper as any, eventDispatcher, eventPersistenceHandler, systemCrypto);
    this.commentMapper = mapper;
  }

  // ========================================
  // BaseKyselyRepository Implementation
  // ========================================

  /**
   * Implementation of createQueryWithVersionJoin for optimistic locking
   *
   * Joins engagement_comments with aggregate_versions to get current_version.
   * Single query approach eliminates N+1 issues.
   */
  protected createQueryWithVersionJoin() {
    return this.getDb()
      .selectFrom('engagement_comments')
      .leftJoin('aggregate_versions', join =>
        join.onRef('aggregate_versions.aggregate_id', '=', sql`engagement_comments.id::varchar`)
      )
      .selectAll('engagement_comments')
      .select(['aggregate_versions.current_version']);
  }

  /**
   * Create CommentRepositoryError for type-safe error handling
   */
  protected createRepositoryError(
    message: string,
    operation?: string,
    _cause?: unknown
  ): CommentRepositoryError {
    return CommentRepositoryError.persistenceError(`${operation}: ${message}`);
  }

  /**
   * Repository configuration for upsert behavior
   *
   * Defines:
   * - conflictColumns: Columns used for conflict detection (usually ['id'])
   * - updateColumns: Columns updated on conflict (excludes immutable fields)
   * - insertOnlyColumns: Columns set ONLY on insert (created_at, id, etc.)
   */
  protected getRepositoryConfig(): IRepositoryConfig<Database['engagement_comments']> {
    return {
      conflictColumns: ['id'], // Primary key for conflict detection

      // Update these fields on conflict (mutable)
      updateColumns: [
        'content',
        'content_hash',
        'moderation_status',
        'moderation_level',
        'moderation_category',
        'moderation_confidence',
        'moderated_at',
        'moderated_by',
        'is_edited',
        'edit_count',
        'last_edited_at',
        'is_deleted',
        'deleted_at',
        'deleted_by',
        'delete_reason',
        'updated_at',
      ],

      // Insert ONLY (never update)
      insertOnlyColumns: [
        'id',
        'user_id',
        'target_type',
        'target_id',
        'parent_id',
        'root_id',
        'nesting_level',
        'created_at',
      ],
    };
  }

  /**
   * Get aggregate type name for error messages
   */
  protected getAggregateTypeName(): string {
    return 'Comment';
  }

  /**
   * Type guard for CommentRepositoryError
   */
  protected isRepositoryError(error: unknown): error is CommentRepositoryError {
    return error instanceof CommentRepositoryError;
  }

  // ========================================
  // Layer 2: Event Map Registration (ALL imported events)
  // ========================================

  /**
   * Reconstruct domain event from database JSON
   *
   * CRITICAL: ALL domain events from engagement context MUST be registered here.
   * Missing events cause runtime errors when loading aggregates from database.
   *
   * @see Layer 1 imports for complete event list
   * @see repository-events-pattern.md for 3-layer protection system
   */
  protected override async reconstructEventByType(plainEvent: any): Promise<any | null> {
    // eventMap: ALL domain events from context (alphabetically)
    const eventMap: Record<string, any> = {
      CommentCreatedEvent,
      CommentDeletedEvent,
      CommentEditedEvent,
      CommentModeratedEvent,
    };

    const EventClass = eventMap[plainEvent.eventName];

    if (!EventClass) {
      // Log warning for debugging unknown events
      console.warn(
        `[CommentRepository] Unknown event type: ${plainEvent.eventName}. ` +
        `Available events: ${Object.keys(eventMap).join(', ')}`
      );
      return null;
    }

    try {
      return ProjectDomainEvent.fromPlainObject(EventClass as any, plainEvent);
    } catch (error) {
      console.error(`Failed to reconstruct ${plainEvent.eventName}:`, error);
      return null;
    }
  }

  // ========================================
  // ICommentCommandRepository Implementation
  // ========================================

  /**
   * Find Comment by ID (uses optimistic locking)
   *
   * Single query with version join for efficiency.
   * Returns null if not found (NOT an error).
   */
  async findById(
    id: CommentId
  ): Promise<Result<CommentAggregate | null, CommentRepositoryError>> {
    try {
      // Single query with version join
      const result = await this.createQueryWithVersionJoin()
        .where('engagement_comments.id', '=', id.value)
        .executeTakeFirst();

      if (!result) {
        return Result.ok(null); // Not found is OK
      }

      // Extract version and record
      const { current_version, ...record } = result;
      const version = current_version || 0;

      // Mapper reconstructs aggregate
      const aggregateResult = await this.commentMapper.toDomain(
        record as Database['engagement_comments'],
        version
      );

      if (aggregateResult.isFailure) {
        return Result.fail(
          CommentRepositoryError.persistenceError(
            `Failed to reconstruct Comment aggregate: ${aggregateResult.error.message}`
          )
        );
      }

      return Result.ok(aggregateResult.value);
    } catch (error) {
      return Result.fail(
        CommentRepositoryError.persistenceError(
          `Database error finding comment by ID: ${(error as Error).message}`
        )
      );
    }
  }

  /**
   * Get parent comment info for reply validation
   *
   * Custom query for specific business need (BR-COMMENT-002: max 3 nesting levels).
   * NOT provided by BaseKyselyRepository (domain-specific).
   */
  async getParentInfo(
    parentId: CommentId
  ): Promise<Result<ParentCommentInfo | null, CommentRepositoryError>> {
    try {
      const result = await this.getDb()
        .selectFrom('engagement_comments')
        .select(['nesting_level', 'user_id'])
        .where('id', '=', parentId.value)
        .where('is_deleted', '=', false)
        .executeTakeFirst();

      if (!result) {
        return Result.ok(null);
      }

      return Result.ok({
        nestingLevel: result.nesting_level,
        authorId: result.user_id,
      });
    } catch (error) {
      return Result.fail(
        CommentRepositoryError.persistenceError(
          `Database error getting parent info: ${(error as Error).message}`
        )
      );
    }
  }
}
```

---

### Example 2: CommentQueryKyselyRepository (Read-Side)

**File**: `src/contexts/engagement/infrastructure/repositories/comment-query-kysely.repository.ts` (~300 lines)

**Key characteristics**:
- Read-only queries (CQRS)
- NO BaseKyselyRepository (no events, no transactions needed)
- Direct Kysely<Database> injection
- Pagination support
- User projection joins (engagement_users)
- Performance-optimized queries

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Result } from '@vytches/ddd';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import { DATABASE_TOKEN } from '@shared/database/tokens';
import type { Database, EngagementCommentsTable } from '@shared/database/types/database.types';
import type { ModerationStatusEnum } from '@shared/domain';

import type {
  CommentListResponse,
  CommentReadModel,
  ICommentQueryRepository,
  PaginationOptions,
} from '../../domain/repositories/comment-query.repository';
import { CommentQueryRepositoryError } from '../../domain/repositories/comment-query.repository';
import type { TargetTypeEnum } from '../../domain/value-objects/target-reference.vo';

/**
 * Kysely-based implementation of Comment Query Repository
 *
 * Query optimization strategies:
 * - Indexed columns: user_id, target_type, target_id, parent_id, moderation_status
 * - Top-level queries filter by parent_id IS NULL
 * - Thread queries use root_id for efficient subtree retrieval
 * - COUNT queries use indexed aggregation
 *
 * Performance targets:
 * - findById: <5ms
 * - findByTarget (paginated): <20ms
 * - findTopLevelByTarget: <15ms
 * - findReplies: <10ms
 * - countByTarget: <5ms
 */
@Injectable()
export class CommentQueryKyselyRepository implements ICommentQueryRepository {
  constructor(
    // ✅ Direct Kysely<Database> injection (NO TransactionHost, read-only)
    @Inject(DATABASE_TOKEN)
    private readonly db: Kysely<Database>
  ) {}

  /**
   * Get database connection (read-only, no transactions needed for queries)
   */
  private getDb() {
    return this.db;
  }

  // ========================================
  // ICommentQueryRepository Implementation
  // ========================================

  /**
   * Find comment by ID
   *
   * TS-USER-PROJECTION-002: Joins with engagement_users for display fields.
   * No version join (query repository doesn't need optimistic locking).
   */
  async findById(
    commentId: string
  ): Promise<Result<CommentReadModel | null, CommentQueryRepositoryError>> {
    try {
      const result = await this.getDb()
        .selectFrom('engagement_comments as c')
        .leftJoin('engagement_users as u', 'c.user_id', 'u.user_id')
        .selectAll('c')
        .select(sql`u.display_name`.as('author_display_name'))
        .select(sql`u.profile_picture_url`.as('author_profile_picture_url'))
        .select(sql`u.verification_level`.as('author_verification_level'))
        .where('c.id', '=', commentId)
        .executeTakeFirst();

      if (!result) {
        return Result.ok(null);
      }

      return Result.ok(this.mapToReadModel(result));
    } catch (error) {
      return Result.fail(
        CommentQueryRepositoryError.queryFailed(
          `Failed to find comment by ID: ${(error as Error).message}`
        )
      );
    }
  }

  /**
   * Find comments for a target entity (paginated)
   *
   * Returns all comments (including replies) for a target.
   * TS-USER-PROJECTION-002: Joins with engagement_users for display fields.
   * TS-MOD-003 Phase 1: Visibility filtering based on author identity.
   */
  async findByTarget(
    targetType: TargetTypeEnum,
    targetId: string,
    options: PaginationOptions,
    sort?: CommentSortOptions,
    currentUserId?: string
  ): Promise<Result<CommentListResponse, CommentQueryRepositoryError>> {
    try {
      const effectiveSort = sort ?? { sortBy: 'createdAt', sortOrder: 'desc' };

      // Build query with user projection join
      let query = this.getDb()
        .selectFrom('engagement_comments as c')
        .leftJoin('engagement_users as u', 'c.user_id', 'u.user_id')
        .selectAll('c')
        .select(sql`u.display_name`.as('author_display_name'))
        .select(sql`u.profile_picture_url`.as('author_profile_picture_url'))
        .select(sql`u.verification_level`.as('author_verification_level'))
        .where('c.target_type', '=', targetType as EngagementCommentsTable['target_type'])
        .where('c.target_id', '=', targetId)
        .where('c.is_deleted', '=', false);

      // Build count query (same filters)
      let countQuery = this.getDb()
        .selectFrom('engagement_comments as c')
        .select(sql<number>`count(*)::integer`.as('total'))
        .where('c.target_type', '=', targetType as EngagementCommentsTable['target_type'])
        .where('c.target_id', '=', targetId)
        .where('c.is_deleted', '=', false);

      // TS-MOD-003 Phase 1: Apply visibility filter based on author
      if (currentUserId) {
        // Author can see own PENDING/ESCALATED comments + all APPROVED
        query = query.where((eb) =>
          eb.or([
            eb('c.moderation_status', '=', 'approved'),
            eb.and([
              eb('c.moderation_status', 'in', ['pending', 'escalated']),
              eb('c.user_id', '=', currentUserId),
            ]),
          ])
        );
        countQuery = countQuery.where((eb) =>
          eb.or([
            eb('c.moderation_status', '=', 'approved'),
            eb.and([
              eb('c.moderation_status', 'in', ['pending', 'escalated']),
              eb('c.user_id', '=', currentUserId),
            ]),
          ])
        );
      } else {
        // Public: only APPROVED
        query = query.where('c.moderation_status', '=', 'approved');
        countQuery = countQuery.where('c.moderation_status', '=', 'approved');
      }

      // Apply sorting
      query = query.orderBy(`c.${effectiveSort.sortBy}`, effectiveSort.sortOrder);

      // Apply pagination
      const offset = (options.page - 1) * options.limit;
      query = query.limit(options.limit).offset(offset);

      // Execute queries
      const [items, countResult] = await Promise.all([
        query.execute(),
        countQuery.executeTakeFirst(),
      ]);

      const totalCount = countResult?.total || 0;

      return Result.ok({
        items: items.map(this.mapToReadModel),
        totalCount,
        page: options.page,
        limit: options.limit,
      });
    } catch (error) {
      return Result.fail(
        CommentQueryRepositoryError.queryFailed(
          `Failed to find comments by target: ${(error as Error).message}`
        )
      );
    }
  }

  /**
   * Map database record to read model (NO aggregate reconstruction)
   *
   * Read models are simple DTOs, NOT domain aggregates.
   * No business logic, just data transformation.
   */
  private mapToReadModel(record: any): CommentReadModel {
    return {
      id: record.id,
      userId: record.user_id,
      content: record.content,
      targetType: record.target_type,
      targetId: record.target_id,
      parentId: record.parent_id,
      nestingLevel: record.nesting_level,
      moderationStatus: record.moderation_status,
      authorDisplayName: record.author_display_name,
      authorProfilePictureUrl: record.author_profile_picture_url,
      authorVerificationLevel: record.author_verification_level,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    };
  }
}
```

---

## 📋 Rules

### MUST

1. **Command repositories MUST extend BaseKyselyRepository** - 80% code reduction
2. **Query repositories MUST NOT extend BaseKyselyRepository** - Direct Kysely<Database> injection
3. **MUST implement createQueryWithVersionJoin()** - Optimistic locking pattern
4. **MUST configure getRepositoryConfig()** - Upsert behavior (conflictColumns, updateColumns, insertOnlyColumns)
5. **MUST inject TransactionHost** - Command repositories use transactional context
6. **MUST inject mapper** - Type-safe toDomain() / toPersistence()
7. **MUST follow 3-layer event protection** - imports, eventMap, verification test (see repository-events-pattern.md)
8. **MUST return Result<T, Error>** - NO throwing exceptions
9. **MUST use specific repository errors** - Type-safe error handling
10. **MUST implement domain-specific queries** - Business logic queries beyond CRUD

### MUST NOT

1. **NEVER use BaseKyselyRepository for query repositories** - Adds unnecessary overhead
2. **NEVER skip optimistic locking** - Concurrent modification bugs
3. **NEVER load aggregates in query repositories** - Use read models instead
4. **NEVER manual transaction management** - TransactionHost handles it
5. **NEVER throw exceptions** - Always return Result
6. **NEVER skip eventMap registration** - Runtime errors when loading aggregates
7. **NEVER skip mapper integration** - Direct DB record manipulation breaks encapsulation

---

## ⚠️ Anti-Patterns

### 1. Using BaseKyselyRepository for Query Repository (Performance Issue)

```typescript
// ❌ WRONG: Query repository extends BaseKyselyRepository
export class CommentQueryKyselyRepository
  extends BaseKyselyRepository<CommentAggregate, CommentQueryError, 'engagement_comments'>
  implements ICommentQueryRepository
{
  // Overhead: event handling, transaction management, optimistic locking
  // All unnecessary for read-only queries!
}

// ✅ CORRECT: Query repository uses direct Kysely<Database>
@Injectable()
export class CommentQueryKyselyRepository implements ICommentQueryRepository {
  constructor(
    @Inject(DATABASE_TOKEN) private readonly db: Kysely<Database>
  ) {}

  private getDb() {
    return this.db; // No TransactionHost, no events, no overhead
  }
}
```

---

### 2. Loading Aggregates for Read Queries (10x Slower)

```typescript
// ❌ WRONG: Loading full aggregate for read query
async findByTarget(targetId: string): Promise<Result<CommentDto[], Error>> {
  // Loads full aggregate with version join, event reconstruction, domain logic
  const comments = await this.commentRepository.findByTargetId(targetId);

  return Result.ok(comments.map(c => c.toDto())); // 10x slower than read model!
}

// ✅ CORRECT: Use denormalized read model
async findByTarget(targetId: string): Promise<Result<CommentReadModel[], Error>> {
  const result = await this.db
    .selectFrom('engagement_comments as c')
    .leftJoin('engagement_users as u', 'c.user_id', 'u.user_id')
    .selectAll('c')
    .select(['u.display_name', 'u.profile_picture_url'])
    .where('c.target_id', '=', targetId)
    .execute();

  return Result.ok(result.map(this.mapToReadModel)); // 10x faster!
}
```

---

### 3. Missing Optimistic Locking (Concurrent Modification Bug)

```typescript
// ❌ WRONG: No version join (lost updates possible)
protected createQueryWithVersionJoin() {
  return this.getDb()
    .selectFrom('engagement_comments')
    .selectAll('engagement_comments');
  // Missing: aggregate_versions join
}

// Later: Two users edit same comment → last write wins (lost update!)

// ✅ CORRECT: Version join for optimistic locking
protected createQueryWithVersionJoin() {
  return this.getDb()
    .selectFrom('engagement_comments')
    .leftJoin('aggregate_versions', join =>
      join.onRef('aggregate_versions.aggregate_id', '=', sql`engagement_comments.id::varchar`)
    )
    .selectAll('engagement_comments')
    .select(['aggregate_versions.current_version']); // ✅ Optimistic locking
}
```

---

### 4. Manual Transaction Management (Connection Pool Exhaustion)

```typescript
// ❌ WRONG: Manual transaction management
async save(aggregate: CommentAggregate): Promise<Result<void, Error>> {
  const tx = await this.db.transaction().execute(async (trx) => {
    // Manual transaction handling
    const record = await this.mapper.toPersistence(aggregate);
    await trx.insertInto('engagement_comments').values(record).execute();
    await trx.commit(); // Manual commit
  });
  // Forgot to commit in error path → connection leak!
}

// ✅ CORRECT: TransactionHost automatic handling
constructor(
  @Inject(TransactionHost) txHost: TransactionHost<TransactionalAdapterKysely<Database>>,
  // ...
) {
  super('engagement_comments', txHost, mapper, eventDispatcher, eventPersistenceHandler, systemCrypto);
}

// BaseKyselyRepository.save() handles transactions automatically
// Auto-commit on success, auto-rollback on error
```

---

### 5. Throwing Exceptions (Should Return Result)

```typescript
// ❌ WRONG: Throwing exception
async findById(id: CommentId): Promise<CommentAggregate | null> {
  const result = await this.createQueryWithVersionJoin()
    .where('engagement_comments.id', '=', id.value)
    .executeTakeFirst();

  if (!result) {
    throw new NotFoundException('Comment not found'); // ❌ Exception!
  }

  return this.mapper.toDomain(result); // ❌ Throws on mapper error
}

// ✅ CORRECT: Returning Result
async findById(
  id: CommentId
): Promise<Result<CommentAggregate | null, CommentRepositoryError>> {
  try {
    const result = await this.createQueryWithVersionJoin()
      .where('engagement_comments.id', '=', id.value)
      .executeTakeFirst();

    if (!result) {
      return Result.ok(null); // ✅ Not found is OK
    }

    const { current_version, ...record } = result;
    const aggregateResult = await this.mapper.toDomain(record, current_version || 0);

    if (aggregateResult.isFailure) {
      return Result.fail(
        CommentRepositoryError.persistenceError(
          `Failed to reconstruct aggregate: ${aggregateResult.error.message}`
        )
      );
    }

    return Result.ok(aggregateResult.value); // ✅ Result pattern
  } catch (error) {
    return Result.fail(
      CommentRepositoryError.persistenceError(
        `Database error: ${(error as Error).message}`
      )
    );
  }
}
```

---

### 6. Missing Event Registration (Runtime Error)

```typescript
// ❌ WRONG: Incomplete eventMap
protected override async reconstructEventByType(plainEvent: any): Promise<any | null> {
  const eventMap: Record<string, any> = {
    CommentCreatedEvent,
    CommentEditedEvent,
    // Missing: CommentDeletedEvent, CommentModeratedEvent
  };

  const EventClass = eventMap[plainEvent.eventName];

  if (!EventClass) {
    return null; // Silently returns null → runtime error later!
  }

  return ProjectDomainEvent.fromPlainObject(EventClass as any, plainEvent);
}

// Later: Loading comment with CommentDeletedEvent → TypeError: event.getDeletionReason is not a function

// ✅ CORRECT: Complete eventMap with all events (see repository-events-pattern.md)
protected override async reconstructEventByType(plainEvent: any): Promise<any | null> {
  // Import ALL events from context (Layer 1)
  const eventMap: Record<string, any> = {
    CommentCreatedEvent,
    CommentDeletedEvent,
    CommentEditedEvent,
    CommentModeratedEvent,
  };

  const EventClass = eventMap[plainEvent.eventName];

  if (!EventClass) {
    // Log warning for debugging (Layer 2)
    console.warn(
      `[CommentRepository] Unknown event type: ${plainEvent.eventName}. ` +
      `Available events: ${Object.keys(eventMap).join(', ')}`
    );
    return null;
  }

  return ProjectDomainEvent.fromPlainObject(EventClass as any, plainEvent);
}

// Layer 3: Create verification test (see repository-events-pattern.md)
```

---

## 📚 References

### ADRs
- **ADR-0012**: CQRS Structure - Command/Query separation
- **ADR-0013**: Hybrid Error Handling - Result pattern in application layer
- **ADR-0025**: Hybrid Event System - Domain events within transaction

### Implementation Files
- `src/shared/infrastructure/repositories/base-kysely.repository.ts` - Base repository (~400L)
- `src/contexts/engagement/infrastructure/repositories/comment-command-kysely.repository.ts` (~250L)
- `src/contexts/engagement/infrastructure/repositories/comment-query-kysely.repository.ts` (~300L)
- `src/contexts/engagement/infrastructure/repositories/mappers/comment-aggregate.mapper.ts` (~200L)

### Related Patterns
- **repository-events-pattern.md** - 3-layer event protection system
- **mapper-pattern.md** - toDomain() / toPersistence() conversion
- **aggregate-pattern.md** - Aggregates with optimistic locking
- **transactional-pattern.md** - @Transactional for command handlers
- **geographic-filtering-pattern.md** - JSONB EXISTS + PostGIS queries for geographic filtering

---

## 🎯 When to Use

### Use Command Repository (BaseKyselyRepository) When

✅ **Write operations**: Create, update, delete aggregates
✅ **Event sourcing**: Domain events need persistence
✅ **Optimistic locking**: Concurrent modification protection needed
✅ **Transaction management**: ACID guarantees required
✅ **Aggregate loading**: Full domain model reconstruction

### Use Query Repository (Direct Kysely) When

✅ **Read operations**: Fetching data without state changes
✅ **List views**: Paginated lists with filtering/sorting
✅ **Reporting**: Analytics, dashboards, metrics
✅ **Performance critical**: 10x faster than aggregate loading
✅ **User projections**: Joins with {context}_users tables

### Example Decision Tree

```
Need to persist aggregate?
├─ YES → Command Repository
│  ├─ Extends BaseKyselyRepository
│  ├─ TransactionHost injection
│  ├─ Event handling (eventMap)
│  ├─ Optimistic locking (version join)
│  └─ Mapper integration
│
└─ NO → Query Repository
   ├─ Direct Kysely<Database>
   ├─ No transactions
   ├─ No events
   ├─ Read models (NOT aggregates)
   └─ User projection joins
```

---

**Version**: 1.0
**Created**: 2026-01-04
**Last Updated**: 2026-01-04
**Maintained By**: @project-project-orchestrator
**Primary Users**: infrastructure-testing-implementer, code-quality-verifier

**Pattern Type**: Infrastructure (MANDATORY for all repositories)
**Status**: Production-enforced
**Lines**: ~700
