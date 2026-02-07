# Mapper Pattern

## 🎯 Problem

**Challenges with aggregate-database mapping**:
- Direct DB access in aggregates → async domain methods (breaks DDD)
- Manual conversion logic → duplicated code across repositories
- Missing type safety → runtime errors from DB schema changes
- Inconsistent reconstruction → some mappers use factory methods, others use constructors
- No error handling → aggregate reconstruction failures crash the application
- Format inconsistencies → DB stores strings, domain expects enums

**Real-world pain points**:
- **Production bug**: Forgot to convert DB enum string to domain enum → `TypeError: Cannot read property 'isApproved' of undefined`
- **Type mismatch**: DB stores `created_at` as Date, mapper returns string → runtime error in domain logic
- **Missing validation**: Mapper bypasses value object validation → invalid data enters domain layer
- **Inconsistent nullability**: DB nullable fields not properly handled → `undefined` in non-nullable domain properties

---

## ✅ Solution

**Mapper pattern with**:
- **IAggregateMapper<TAggregate, TDbEntity>** interface for type safety
- **toDomain()**: Database record → Domain aggregate (async for PII decryption)
- **toPersistence()**: Domain aggregate → Database record (async for PII encryption)
- **Result pattern**: Return `Result<T, Error>` for all operations
- **Value object reconstruction**: Private helpers for complex reconstructions
- **Type-safe database types**: Use generated Kysely types (e.g., `EngagementCommentsTable`)
- **Version tracking**: Accept version parameter for optimistic locking
- **@Injectable() decorator**: NestJS dependency injection

---

## 🔧 Implementation

### Example 1: CommentAggregateMapper (Complete Mapper)

**File**: `src/contexts/engagement/infrastructure/repositories/mappers/comment-aggregate.mapper.ts` (~270 lines)

**Key characteristics**:
- toDomain() with value object reconstruction
- toPersistence() with explicit field mapping
- Private helpers for complex reconstructions
- Error handling with Result pattern
- Type safety with Kysely generated types

```typescript
import { Injectable } from '@nestjs/common';
import { BaseError, Result } from '@vytches/ddd';

import type { EngagementCommentsTable } from '@shared/database/types/database.types';
import {
  ModerationLevelEnum,
  ModerationStatus,
  ModerationStatusEnum,
  UserId,
} from '@shared/domain';
import { ProjectErrorCode } from '@shared/domain/errors';

import {
  CommentAggregate,
  type CommentProps,
} from '../../../domain/aggregates/comment.aggregate';
import { EngagementValidationError } from '../../../domain/errors/engagement-validation.error';
import type { DeletionType } from '../../../domain/events/comment-deleted.event';
import { CommentContent, CommentId, NestingLevel, TargetReference } from '../../../domain/value-objects';
import type { TargetTypeEnum } from '../../../domain/value-objects/target-reference.vo';

/**
 * Mapper-specific error type
 *
 * Extends BaseError with ProjectErrorCode for consistent error handling.
 * Used when conversion fails (invalid data, missing fields, etc.).
 */
export class CommentMapperError extends BaseError {
  public readonly code = ProjectErrorCode.DATABASE_ERROR;

  constructor(
    message: string,
    public override readonly cause?: unknown
  ) {
    super(message);
  }

  static create(message: string, cause?: unknown): CommentMapperError {
    return new CommentMapperError(message, cause);
  }
}

/**
 * Mapper interface for type safety
 *
 * Ensures consistency across all aggregate mappers.
 * SECURITY: Async methods support PII encryption/decryption (GDPR compliance).
 */
export interface ICommentAggregateMapper {
  toDomain(
    record: EngagementCommentsTable,
    version: number
  ): Promise<Result<CommentAggregate, CommentMapperError>>;

  toPersistence(
    aggregate: CommentAggregate
  ): Promise<Result<Partial<EngagementCommentsTable>, CommentMapperError>>;
}

/**
 * Comment Aggregate Mapper
 *
 * Maps between Comment domain aggregate and database persistence format.
 *
 * @module Engagement/Infrastructure/Repositories/Mappers
 * @see TS-ENGAGE-001
 */
@Injectable()
export class CommentAggregateMapper implements ICommentAggregateMapper {
  // ========================================
  // toDomain(): Database → Domain Aggregate
  // ========================================

  /**
   * Convert database record to domain aggregate
   *
   * Steps:
   * 1. Reconstruct value objects (CommentId, UserId, TargetReference, etc.)
   * 2. Handle optional fields (parentCommentId, deletedAt, etc.)
   * 3. Build aggregate properties object
   * 4. Call CommentAggregate.reconstituteFromPersistence()
   * 5. Return Result with aggregate or error
   *
   * CRITICAL: Uses reconstituteFromPersistence(), NOT create()
   * - create() = Factory method with business rule validation
   * - reconstituteFromPersistence() = Bypass validation (data already validated)
   *
   * @param record - Database record from engagement_comments table
   * @param version - Current aggregate version from aggregate_versions table
   * @returns Result with reconstructed aggregate or error
   */
  async toDomain(
    record: EngagementCommentsTable,
    version: number
  ): Promise<Result<CommentAggregate, CommentMapperError>> {
    try {
      // ============================================
      // Step 1: Reconstruct Value Objects
      // ============================================

      // CommentId (simple value object)
      const commentId = CommentId.fromString(record.id);

      // UserId (simple value object)
      const userId = UserId.fromString(record.user_id);

      // TargetReference (complex value object with validation)
      const targetResult = TargetReference.create(
        record.target_type as TargetTypeEnum,
        record.target_id
      );
      if (targetResult.isFailure) {
        throw new Error(`Invalid target reference: ${targetResult.error.message}`);
      }
      const target = targetResult.value;

      // ============================================
      // Step 2: Handle Optional Fields
      // ============================================

      // Parent comment ID (optional)
      const parentCommentId = record.parent_id
        ? CommentId.fromString(record.parent_id)
        : undefined;

      // NestingLevel (complex value object with validation)
      const nestingLevelResult = NestingLevel.create(record.nesting_level);
      if (nestingLevelResult.isFailure) {
        throw new Error(`Invalid nesting level: ${nestingLevelResult.error.message}`);
      }
      const nestingLevel = nestingLevelResult.value;

      // ============================================
      // Step 3: Reconstruct Complex Value Objects
      // ============================================

      // CommentContent (uses private helper method)
      const contentResult = this.reconstructCommentContent(
        record.content,
        record.content_hash
      );
      if (contentResult.isFailure) {
        throw new Error(`Invalid content: ${contentResult.error.message}`);
      }
      const content = contentResult.value;

      // ModerationStatus (uses private helper method)
      const moderationStatus = this.reconstructModerationStatus(
        record.moderation_status,
        record.moderation_level,
        record.moderation_category,
        record.moderation_confidence
      );

      // ============================================
      // Step 4: Build Aggregate Properties
      // ============================================

      const props: CommentProps = {
        userId,
        content,
        target,
        targetOwnerId: undefined, // Not stored in DB (runtime data)
        parentCommentId,
        parentCommentAuthorId: undefined, // Not stored in DB (runtime data)
        nestingLevel,
        moderationStatus,
        verificationLevel: 50, // Default (actual value from engagement_user_trust)
        editCount: record.edit_count,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
        deletedAt: record.deleted_at || undefined,
        deletedBy: record.deleted_by || undefined,
        deletionType: this.inferDeletionType(record),
        deletionReason: record.delete_reason || undefined,
      };

      // ============================================
      // Step 5: Reconstruct Aggregate (with version)
      // ============================================

      // CRITICAL: Uses reconstituteFromPersistence() (NOT create())
      // - Bypasses business rule validation
      // - Accepts version for optimistic locking
      const aggregate = CommentAggregate.reconstituteFromPersistence(
        commentId,
        props,
        version
      );

      return Result.ok(aggregate);
    } catch (error) {
      return Result.fail(
        CommentMapperError.create(
          `Failed to reconstruct Comment aggregate: ${(error as Error).message}`,
          error
        )
      );
    }
  }

  // ========================================
  // toPersistence(): Domain Aggregate → Database
  // ========================================

  /**
   * Convert domain aggregate to database persistence format
   *
   * Steps:
   * 1. Extract scalar values from value objects
   * 2. Convert domain enums to database enums
   * 3. Handle optional fields with null coalescing
   * 4. Map computed fields (is_edited, is_deleted)
   * 5. Return Result with database record or error
   *
   * CRITICAL: Returns Partial<EngagementCommentsTable>
   * - Allows upsert operations (INSERT or UPDATE)
   * - Repository config determines which fields are inserted/updated
   *
   * @param aggregate - Domain aggregate
   * @returns Result with database record data or error
   */
  async toPersistence(
    aggregate: CommentAggregate
  ): Promise<Result<Partial<EngagementCommentsTable>, CommentMapperError>> {
    try {
      const persistenceData: Partial<EngagementCommentsTable> = {
        // ============================================
        // Identity Fields
        // ============================================
        id: aggregate.id.value,
        user_id: aggregate.userId.value,

        // ============================================
        // Target Reference Fields
        // ============================================
        target_type: aggregate.target.targetType as EngagementCommentsTable['target_type'],
        target_id: aggregate.target.targetId,
        target_owner_id: aggregate.targetOwnerId || null,

        // ============================================
        // Threading Fields
        // ============================================
        parent_id: aggregate.parentCommentId?.value || null,
        root_id: aggregate.nestingLevel.isTopLevel()
          ? null
          : aggregate.id.value, // Simplified - actual root tracking needs parent chain
        nesting_level: aggregate.nestingLevel.getLevel(),

        // ============================================
        // Content Fields
        // ============================================
        content: aggregate.content.getContent(),
        content_hash: aggregate.content.hash,

        // ============================================
        // Moderation Fields
        // ============================================
        moderation_status: aggregate.moderationStatus.status as EngagementCommentsTable['moderation_status'],
        moderation_level: aggregate.moderationStatus.level || null,
        moderation_category: aggregate.moderationStatus.category || null,
        moderation_confidence: aggregate.moderationStatus.confidence?.toFixed(2) || null,
        moderated_at: aggregate.moderationStatus.isPending() ? null : new Date(),
        moderated_by: null, // System moderation (no human moderator)

        // ============================================
        // Edit Tracking Fields
        // ============================================
        is_edited: aggregate.editCount > 0,
        edit_count: aggregate.editCount,
        last_edited_at: aggregate.editCount > 0 ? aggregate.updatedAt : null,

        // ============================================
        // Deletion Fields
        // ============================================
        is_deleted: aggregate.isDeleted(),
        deleted_at: aggregate.deletedAt || null,
        deleted_by: aggregate.deletedBy || null,
        delete_reason: aggregate.deletionReason || null,

        // ============================================
        // Timestamp Fields
        // ============================================
        created_at: aggregate.createdAt,
        updated_at: aggregate.updatedAt,
      };

      return Result.ok(persistenceData);
    } catch (error) {
      return Result.fail(
        CommentMapperError.create(
          `Failed to convert Comment aggregate to persistence: ${(error as Error).message}`,
          error
        )
      );
    }
  }

  // ========================================
  // Private Helper Methods
  // ========================================

  /**
   * Reconstruct CommentContent from stored values
   *
   * Uses CommentContent.create() factory method for validation.
   * Note: Hash is regenerated by factory method (not stored hash).
   */
  private reconstructCommentContent(
    content: string,
    _hash: string
  ): Result<CommentContent, EngagementValidationError> {
    // Create via factory method
    // Validation will pass since content was already validated on creation
    // Note: _hash unused as CommentContent generates its own hash from content
    return CommentContent.create(content);
  }

  /**
   * Reconstruct ModerationStatus from database values
   *
   * Maps database enum strings to domain ModerationStatus value object.
   * Uses static factory methods (pending(), approved(), rejected(), etc.).
   */
  private reconstructModerationStatus(
    status: string,
    level: string | null,
    category: string | null,
    confidence: string | null
  ): ModerationStatus {
    const confidenceNum = confidence ? parseFloat(confidence) : undefined;

    switch (status) {
      case ModerationStatusEnum.APPROVED:
        if (level === ModerationLevelEnum.SKIPPED) {
          return ModerationStatus.skippedForElite();
        }
        return ModerationStatus.approved(
          level as ModerationLevelEnum | undefined,
          confidenceNum
        );

      case ModerationStatusEnum.REJECTED:
        return ModerationStatus.rejected(
          (level as ModerationLevelEnum) || ModerationLevelEnum.L0,
          category || 'unknown',
          confidenceNum
        );

      case ModerationStatusEnum.HIDDEN:
        return ModerationStatus.hidden(category || undefined);

      case ModerationStatusEnum.ESCALATED:
        return ModerationStatus.escalated(
          (level as ModerationLevelEnum) || ModerationLevelEnum.L1,
          category || undefined,
          confidenceNum
        );

      case ModerationStatusEnum.PENDING:
      default:
        return ModerationStatus.pending();
    }
  }

  /**
   * Infer deletion type from database record
   *
   * Business logic to determine deletion type (author, moderator, system).
   * Used when reconstructing deleted comments.
   */
  private inferDeletionType(record: EngagementCommentsTable): DeletionType | undefined {
    if (!record.is_deleted) return undefined;

    // If deleted_by matches user_id, it's author deletion
    if (record.deleted_by === record.user_id) return 'author';

    // If there's a delete_reason, it's likely a moderator
    if (record.delete_reason) return 'moderator';

    // Default to system
    return 'system';
  }
}
```

---

## 📋 Rules

### MUST

1. **MUST implement IAggregateMapper<TAggregate, TDbEntity>** - Type safety
2. **MUST use @Injectable() decorator** - NestJS dependency injection
3. **MUST return Result<T, Error>** - NO throwing exceptions
4. **MUST use reconstituteFromPersistence()** - NOT create() (bypasses validation)
5. **MUST accept version parameter in toDomain()** - Optimistic locking support
6. **MUST use Kysely generated types** - Type safety (e.g., `EngagementCommentsTable`)
7. **MUST use private helper methods** - Complex value object reconstruction
8. **MUST handle optional fields** - Null coalescing (|| null, || undefined)
9. **MUST use value object factory methods** - CommentContent.create(), NestingLevel.create()
10. **MUST create custom mapper error** - Extends BaseError with ProjectErrorCode

### MUST NOT

1. **NEVER throw exceptions** - Always return Result
2. **NEVER use aggregate.create()** - Use reconstituteFromPersistence() for DB reconstruction
3. **NEVER skip version parameter** - Required for optimistic locking
4. **NEVER access aggregate private fields** - Use public getters
5. **NEVER skip type conversions** - DB enums → domain enums (explicit cast)
6. **NEVER return full TDbEntity** - Use Partial<TDbEntity> for upsert flexibility
7. **NEVER inline complex reconstruction** - Use private helper methods

---

## ⚠️ Anti-Patterns

### 1. Using create() Instead of reconstituteFromPersistence() (Validation Bypass)

```typescript
// ❌ WRONG: Using create() for DB reconstruction
async toDomain(
  record: EngagementCommentsTable,
  version: number
): Promise<Result<CommentAggregate, CommentMapperError>> {
  const userId = UserId.fromString(record.user_id);
  const content = CommentContent.create(record.content).value;
  const target = TargetReference.create(record.target_type, record.target_id).value;

  // ❌ Uses create() - validates business rules unnecessarily
  const aggregateResult = CommentAggregate.create(
    userId,
    content,
    target,
    record.target_owner_id,
    50 // verificationLevel
  );

  // Problem: create() validates trust level >= 40
  // But we're reconstructing from DB (already validated!)
  // If trust level changed, aggregate fails to load!

  return Result.ok(aggregateResult.value);
}

// ✅ CORRECT: Using reconstituteFromPersistence()
async toDomain(
  record: EngagementCommentsTable,
  version: number
): Promise<Result<CommentAggregate, CommentMapperError>> {
  const userId = UserId.fromString(record.user_id);
  const content = CommentContent.create(record.content).value;
  const target = TargetReference.create(record.target_type, record.target_id).value;

  const props: CommentProps = {
    userId,
    content,
    target,
    // ... all other fields
  };

  // ✅ Bypasses business rule validation (data already in DB)
  const aggregate = CommentAggregate.reconstituteFromPersistence(
    CommentId.fromString(record.id),
    props,
    version
  );

  return Result.ok(aggregate);
}
```

---

### 2. Throwing Exceptions (Should Return Result)

```typescript
// ❌ WRONG: Throwing exception
async toDomain(
  record: EngagementCommentsTable,
  version: number
): Promise<CommentAggregate> {
  const targetResult = TargetReference.create(
    record.target_type,
    record.target_id
  );

  if (targetResult.isFailure) {
    throw new Error(`Invalid target: ${targetResult.error.message}`); // ❌ Exception!
  }

  // ...
}

// ✅ CORRECT: Returning Result
async toDomain(
  record: EngagementCommentsTable,
  version: number
): Promise<Result<CommentAggregate, CommentMapperError>> {
  try {
    const targetResult = TargetReference.create(
      record.target_type,
      record.target_id
    );

    if (targetResult.isFailure) {
      throw new Error(`Invalid target: ${targetResult.error.message}`);
    }

    // ... rest of mapping

    return Result.ok(aggregate);
  } catch (error) {
    return Result.fail(
      CommentMapperError.create(
        `Failed to reconstruct aggregate: ${(error as Error).message}`,
        error
      )
    );
  }
}
```

---

### 3. Missing Version Parameter (Optimistic Locking Broken)

```typescript
// ❌ WRONG: No version parameter
async toDomain(
  record: EngagementCommentsTable
  // Missing: version: number
): Promise<Result<CommentAggregate, CommentMapperError>> {
  const props: CommentProps = { /* ... */ };

  // ❌ No version passed to reconstituteFromPersistence()
  const aggregate = CommentAggregate.reconstituteFromPersistence(
    commentId,
    props
    // Missing: version parameter
  );

  return Result.ok(aggregate);
}

// Later: Optimistic locking fails (aggregate has no initial version)

// ✅ CORRECT: Version parameter for optimistic locking
async toDomain(
  record: EngagementCommentsTable,
  version: number // ✅ Version from aggregate_versions table
): Promise<Result<CommentAggregate, CommentMapperError>> {
  const props: CommentProps = { /* ... */ };

  // ✅ Version passed for optimistic locking
  const aggregate = CommentAggregate.reconstituteFromPersistence(
    commentId,
    props,
    version
  );

  return Result.ok(aggregate);
}
```

---

### 4. Inline Complex Reconstruction (Hard to Test)

```typescript
// ❌ WRONG: Inline complex reconstruction
async toDomain(
  record: EngagementCommentsTable,
  version: number
): Promise<Result<CommentAggregate, CommentMapperError>> {
  // ❌ Inline moderation status reconstruction (50 lines of switch statement)
  let moderationStatus: ModerationStatus;
  const confidenceNum = record.moderation_confidence
    ? parseFloat(record.moderation_confidence)
    : undefined;

  switch (record.moderation_status) {
    case ModerationStatusEnum.APPROVED:
      if (record.moderation_level === ModerationLevelEnum.SKIPPED) {
        moderationStatus = ModerationStatus.skippedForElite();
      } else {
        moderationStatus = ModerationStatus.approved(
          record.moderation_level as ModerationLevelEnum,
          confidenceNum
        );
      }
      break;
    // ... 30 more lines
  }

  // Problem: Can't unit test moderation status reconstruction separately
}

// ✅ CORRECT: Private helper method
async toDomain(
  record: EngagementCommentsTable,
  version: number
): Promise<Result<CommentAggregate, CommentMapperError>> {
  // ✅ Delegated to private helper method
  const moderationStatus = this.reconstructModerationStatus(
    record.moderation_status,
    record.moderation_level,
    record.moderation_category,
    record.moderation_confidence
  );

  // Benefits:
  // - Unit testable separately
  // - Reusable across methods
  // - Clear separation of concerns
}

private reconstructModerationStatus(
  status: string,
  level: string | null,
  category: string | null,
  confidence: string | null
): ModerationStatus {
  // ... reconstruction logic
}
```

---

### 5. Missing Type Conversions (Runtime Type Errors)

```typescript
// ❌ WRONG: No explicit type conversion
async toPersistence(
  aggregate: CommentAggregate
): Promise<Result<Partial<EngagementCommentsTable>, CommentMapperError>> {
  const persistenceData: Partial<EngagementCommentsTable> = {
    // ❌ No type assertion - TypeScript error or runtime mismatch
    target_type: aggregate.target.targetType, // Type mismatch!
    moderation_status: aggregate.moderationStatus.status, // Type mismatch!
  };

  return Result.ok(persistenceData);
}

// ✅ CORRECT: Explicit type conversion
async toPersistence(
  aggregate: CommentAggregate
): Promise<Result<Partial<EngagementCommentsTable>, CommentMapperError>> {
  const persistenceData: Partial<EngagementCommentsTable> = {
    // ✅ Explicit type assertion
    target_type: aggregate.target.targetType as EngagementCommentsTable['target_type'],
    moderation_status: aggregate.moderationStatus.status as EngagementCommentsTable['moderation_status'],
  };

  return Result.ok(persistenceData);
}
```

---

### 6. Accessing Aggregate Private Fields (Encapsulation Violation)

```typescript
// ❌ WRONG: Accessing private fields directly
async toPersistence(
  aggregate: CommentAggregate
): Promise<Result<Partial<EngagementCommentsTable>, CommentMapperError>> {
  const persistenceData: Partial<EngagementCommentsTable> = {
    // ❌ Accessing private fields (TypeScript error, breaks encapsulation)
    content: aggregate._content.getContent(),
    user_id: aggregate._userId.value,
  };

  return Result.ok(persistenceData);
}

// ✅ CORRECT: Using public getters
async toPersistence(
  aggregate: CommentAggregate
): Promise<Result<Partial<EngagementCommentsTable>, CommentMapperError>> {
  const persistenceData: Partial<EngagementCommentsTable> = {
    // ✅ Using public getters
    content: aggregate.content.getContent(),
    user_id: aggregate.userId.value,
  };

  return Result.ok(persistenceData);
}
```

---

## 📚 References

### ADRs
- **ADR-0013**: Hybrid Error Handling - Result pattern in application layer

### Implementation Files
- `src/contexts/engagement/infrastructure/repositories/mappers/comment-aggregate.mapper.ts` (~270L)
- `src/contexts/auth/infrastructure/repositories/mappers/user-identity-aggregate.mapper.ts` (~300L)
- `src/shared/infrastructure/repositories/base-kysely.repository.ts` - IAggregateMapper interface

### Related Patterns
- **repository-pattern.md** - Repositories use mappers for toDomain() / toPersistence()
- **aggregate-pattern.md** - reconstituteFromPersistence() vs create()
- **value-object-pattern.md** - Value object reconstruction in mappers

---

## 🎯 When to Use

### Use Mapper When

✅ **Persisting aggregates**: Command repositories need toPersistence()
✅ **Loading aggregates**: Command repositories need toDomain()
✅ **Type conversion required**: DB schema differs from domain model
✅ **Complex value objects**: Multiple fields map to single value object
✅ **Optional fields**: Null handling for nullable DB columns

### Mapper Responsibilities

**toDomain()**:
- Reconstruct value objects from DB primitives
- Handle optional fields (null → undefined)
- Accept version for optimistic locking
- Use reconstituteFromPersistence() (NOT create())
- Return Result for error handling

**toPersistence()**:
- Extract primitives from value objects
- Convert domain enums to DB enums
- Handle optional fields (undefined → null)
- Map computed fields (is_edited, is_deleted)
- Return Partial<TDbEntity> for upsert flexibility

---

**Version**: 1.0
**Created**: 2026-01-04
**Last Updated**: 2026-01-04
**Maintained By**: @project-project-orchestrator
**Primary Users**: infrastructure-testing-implementer, code-quality-verifier

**Pattern Type**: Infrastructure (MANDATORY for all command repositories)
**Status**: Production-enforced
**Lines**: ~600
