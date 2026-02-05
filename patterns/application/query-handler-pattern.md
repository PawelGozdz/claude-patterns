# Query Handler Pattern

## 🎯 Problem

**Challenges with query handler implementation**:
- Write operations in query handlers → violates CQRS
- Complex DTOs construction → should use read models
- Missing pagination → performance issues with large datasets
- No filtering/sorting → poor user experience
- Aggregate loading for reads → unnecessary domain logic execution
- Missing user context → cannot track who accessed data

**Real-world pain points**:
- **Performance bug**: Loading 10,000 comments without pagination → 30-second response time
- **CQRS violation**: Query handler called aggregate.edit() → state change in read operation
- **Audit failure**: No user context in query logging → cannot trace data access
- **N+1 query problem**: Loading comments one by one instead of batch → 500+ database queries

---

## ✅ Solution

**Query Handler pattern with**:
- `BaseQueryHandler<Query, Result<DTO, Error>>` extension
- `@QueryHandler(QueryClass)` decorator
- `@Injectable()` NestJS decorator
- Read-only repositories: `IQueryRepository` interfaces
- Pagination support: `page`, `limit` parameters
- Filtering & sorting: Optional query parameters
- User context: `getUserContext()` for audit logging
- Read model context: `getReadModelContext()` for telemetry
- Result pattern: ALL queries return `Result<DTO, Error>`
- NEVER write operations: Read-only, no state changes

---

## 🔧 Implementation

### Example: GetCommentsForTargetHandler (Pagination + Filtering)

**File**: `src/contexts/engagement/application/queries/get-comments-for-target/handler.ts`

**Key characteristics**:
- Read-only query repository
- Pagination (page, limit)
- Filtering (moderationStatus, includeDeleted, topLevelOnly)
- User context for audit
- Multiple query strategies (top-level, replies, all)

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { QueryHandler, Result } from '@vytches/ddd';
import { BaseQueryHandler } from '@shared/application/base/base-query-handler';
import type { ILoggerService } from '@shared/infrastructure/logging';
import { LOGGER_SERVICE } from '@shared/infrastructure/logging';
import { RequestContextService } from '@shared/infrastructure/request-context';
import { EngagementValidationError } from '../../../domain/errors/engagement-validation.error';
import type { ICommentQueryRepository } from '../../../domain/repositories/comment-query.repository';
import { GetCommentsForTargetQuery, type CommentsForTargetDto } from './query';

@Injectable()
@QueryHandler(GetCommentsForTargetQuery)
export class GetCommentsForTargetHandler extends BaseQueryHandler<
  GetCommentsForTargetQuery,
  Result<CommentsForTargetDto, EngagementValidationError>
> {
  constructor(
    // 1. ✅ Query repository (read-only)
    @Inject(COMMENT_QUERY_REPOSITORY)
    private readonly commentQueryRepository: ICommentQueryRepository,

    // 2. ✅ Base dependencies
    @Inject(LOGGER_SERVICE) logger: ILoggerService,
    @Inject(RequestContextService) requestContext: RequestContextService,
    @Inject(REDACTION_SERVICE) redactionService: RedactionService
  ) {
    super(logger, requestContext, redactionService);
  }

  // 3. ✅ Telemetry methods
  protected getOperationName(): string {
    return 'GetCommentsForTarget';
  }

  protected getBoundedContext(): string {
    return 'Engagement';
  }

  // 4. ✅ User context for audit logging
  protected override getUserContext(query: GetCommentsForTargetQuery): {
    userId?: string;
    sessionId?: string;
    userRole?: string;
  } {
    return {
      userId: query.requestingUserId, // Who is querying
    };
  }

  // 5. ✅ Read model context for telemetry
  protected override getReadModelContext(_query: GetCommentsForTargetQuery): {
    entityId?: string;
    entityType?: string;
  } {
    return {
      entityType: 'CommentsList',
    };
  }

  // 6. ✅ Query execution (read-only, NO state changes)
  public async executeBusinessLogic(
    query: GetCommentsForTargetQuery
  ): Promise<Result<CommentsForTargetDto, EngagementValidationError>> {
    const { targetType, targetId, page, limit } = query;

    // Log read model access
    this.logReadModelAccess('CommentsReadModel');

    // ============================================
    // Query Strategy Selection (based on filters)
    // ============================================
    let commentsResult;

    if (query.topLevelOnly) {
      // Strategy 1: Top-level comments only
      commentsResult = await this.commentQueryRepository.findTopLevelByTarget(
        targetType,
        targetId,
        { page, limit }
      );
    } else if (query.parentCommentId) {
      // Strategy 2: Replies to specific comment
      commentsResult = await this.commentQueryRepository.findReplies(
        query.parentCommentId,
        { page, limit }
      );
    } else {
      // Strategy 3: All comments with filters
      commentsResult = await this.commentQueryRepository.findMany(
        {
          targetType,
          targetId,
          moderationStatus: query.moderationStatus,
          includeDeleted: query.includeDeleted,
        },
        { page, limit },
        { orderBy: query.orderBy, direction: query.direction }
      );
    }

    // ============================================
    // Error handling
    // ============================================
    if (commentsResult.isFailure) {
      return Result.fail(commentsResult.error as EngagementValidationError);
    }

    // ============================================
    // Map to DTO
    // ============================================
    const comments = commentsResult.value.items;
    const totalCount = commentsResult.value.totalCount;

    const dto: CommentsForTargetDto = {
      comments: comments.map((comment) => ({
        id: comment.id,
        userId: comment.userId,
        content: comment.content,
        nestingLevel: comment.nestingLevel,
        moderationStatus: comment.moderationStatus,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      })),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    };

    return Result.ok(dto);
  }
}
```

---

## 📋 Rules

### MUST

1. **Extend `BaseQueryHandler<Query, Result<DTO, Error>>`**
2. **Decorators**: `@Injectable()` and `@QueryHandler(QueryClass)`
3. **Read-only**: Use `IQueryRepository` interfaces, NEVER command repositories
4. **Pagination**: ALL list queries support `page` and `limit`
5. **User context**: Override `getUserContext()` for audit logging
6. **Read model context**: Override `getReadModelContext()` for telemetry
7. **Result pattern**: Return `Result<DTO, Error>`
8. **Filtering & sorting**: Optional parameters for flexible queries
9. **Log read access**: Call `logReadModelAccess()` for audit trail
10. **Telemetry**: Implement `getOperationName()` and `getBoundedContext()`

### MUST NOT

1. **NEVER write operations** - queries are read-only
2. **NEVER load aggregates** - use denormalized read models
3. **NEVER business rules** - queries don't validate, they fetch data
4. **NEVER missing pagination** - all list queries must paginate
5. **NEVER @Transactional** - read operations don't need transactions
6. **NEVER state changes** - queries must be side-effect free

---

## ⚠️ Anti-Patterns

### 1. State Change in Query (CQRS Violation)

```typescript
// ❌ WRONG: Query handler modifies state
public async executeBusinessLogic(query: GetUserProfileQuery) {
  const user = await this.repository.findById(query.userId);

  // ❌ State change in query!
  user.recordProfileView();
  await this.repository.save(user);

  return Result.ok(user.toDto());
}

// ✅ CORRECT: Query is read-only
public async executeBusinessLogic(query: GetUserProfileQuery) {
  const user = await this.queryRepository.findById(query.userId);

  // ✅ No state changes, just return data
  return Result.ok({
    id: user.id,
    name: user.name,
    email: user.email,
  });
}
```

---

### 2. Missing Pagination (Performance Issue)

```typescript
// ❌ WRONG: No pagination (returns ALL results)
public async executeBusinessLogic(query: GetCommentsQuery) {
  const comments = await this.repository.findAll(); // ❌ Could be 10,000+!
  return Result.ok(comments);
}

// ✅ CORRECT: Pagination support
public async executeBusinessLogic(query: GetCommentsQuery) {
  const { page, limit } = query; // ✅ Pagination parameters

  const result = await this.repository.findMany(
    { targetId: query.targetId },
    { page, limit } // ✅ Limit results
  );

  return Result.ok({
    comments: result.items,
    pagination: {
      page,
      limit,
      totalCount: result.totalCount,
      totalPages: Math.ceil(result.totalCount / limit),
    },
  });
}
```

---

### 3. Loading Aggregates for Read (Inefficient)

```typescript
// ❌ WRONG: Loading aggregate for query
public async executeBusinessLogic(query: GetCommentQuery) {
  // ❌ Loads aggregate with all domain logic
  const commentAggregate = await this.commentRepository.findById(query.commentId);

  return Result.ok({
    id: commentAggregate.id.value,
    content: commentAggregate.content.getContent(),
    // ... extracting data from aggregate
  });
}

// ✅ CORRECT: Use denormalized read model
public async executeBusinessLogic(query: GetCommentQuery) {
  // ✅ Direct query to read model (faster, simpler)
  const comment = await this.commentQueryRepository.findById(query.commentId);

  return Result.ok({
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt,
    // ... data already in DTO format
  });
}
```

---

### 4. Missing User Context (Audit Failure)

```typescript
// ❌ WRONG: No user context
export class GetCommentsHandler extends BaseQueryHandler<...> {
  // ❌ Missing getUserContext() override
}

// Later: Audit log has no user information
// "Who accessed comment #12345?" → Unknown!

// ✅ CORRECT: User context for audit
export class GetCommentsHandler extends BaseQueryHandler<...> {
  protected override getUserContext(query: GetCommentsQuery) {
    return {
      userId: query.requestingUserId, // ✅ Track who queried
    };
  }
}

// Later: Audit log has user information
// "User 'uuid-123' accessed comment #12345 at 2026-01-04 15:30:00"
```

---

## 🔧 Module Registration (Auto-Discovery)

Query handlers use the `@QueryHandler(QueryClass)` decorator for **automatic registration**.
VytchesExplorerService discovers all decorated handler classes and registers them with the query bus.

### Registration Pattern

**File**: `src/contexts/neighborhood-economy/neighborhood-economy.module.ts`

```typescript
import { Module } from '@nestjs/common';

@Module({
  providers: [
    // ✅ Just add handlers to providers - auto-discovery handles the rest
    GetJobRequestHandler,
    ListJobRequestsHandler,
    GetMyJobRequestsHandler,
    // ... all query handlers
  ],
})
export class NeighborhoodEconomyModule {
  // ✅ NO queryBus injection needed
  // ✅ NO manual queryBus.register() calls needed
  // ✅ NO registerQueryHandlers() method needed
  // @QueryHandler(QueryClass) decorator on handler class enables auto-discovery
}
```

### Registration Steps

**For EVERY new query handler**:

1. ✅ **Add `@QueryHandler(QueryClass)` decorator** on the handler class
2. ✅ **Add `@Injectable()` decorator** on the handler class
3. ✅ **Add to `providers`** array in `@Module()` decorator
4. ✅ That's it — VytchesExplorerService handles the rest

### Complete Module Structure

**Typical module with query handlers**:

```typescript
@Module({
  imports: [SharedModule, DatabaseModule],
  providers: [
    // QUERY HANDLERS - alphabetical order
    GetAccountHandler,
    GetAccountBalanceHandler,
    ListAccountsHandler,
    SearchAccountsHandler,
    // ... repositories, etc.
  ],
})
export class AccountModule implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    // Query handlers auto-registered via @QueryHandler decorator
    // Only error mappers and ACL adapters need manual registration here
    this.registerErrorMappers();
  }
}
```

### Registration Rules

**MUST**:
- ✅ Add `@QueryHandler(QueryClass)` decorator on handler class
- ✅ Add `@Injectable()` decorator on handler class
- ✅ Add handler to `providers` array
- ✅ Handler must extend `BaseQueryHandler<Query, Result<DTO, Error>>`

**MUST NOT**:
- ❌ Manually call `queryBus.register()` (auto-discovery handles it)
- ❌ Inject QueryBus in module constructor (not needed)
- ❌ Export handlers in `exports` array (not needed for auto-discovery)
- ❌ Inject handlers in module constructor (not needed)

### Anti-Pattern: Missing Decorator

```typescript
// ❌ WRONG: Handler in providers but NO @QueryHandler decorator
@Injectable()  // ✅ Has @Injectable
// ❌ MISSING @QueryHandler(GetJobRequestQuery)
export class GetJobRequestHandler extends BaseQueryHandler<...> {
  // ...
}

@Module({
  providers: [GetJobRequestHandler], // ✅ In providers
})
export class NeighborhoodEconomyModule {}

// Result: Runtime error when executing query
await queryBus.execute(new GetJobRequestQuery(...));
// Error: No handler found for query "GetJobRequestQuery"
```

**Fix**: Add `@QueryHandler(GetJobRequestQuery)` decorator to handler class.

### Event Handlers Registration

**Integration event handlers** use different pattern with `eventBus.registerHandler()`:

```typescript
private registerEventHandlers(): void {
  // Register integration event handler
  this.eventBus.registerHandler(UserRegisteredIntegrationEvent, {
    handle: async event => {
      await this.userRegisteredHandler.handle(event as any);
    },
  });

  this.eventBus.registerHandler(PaymentCompletedIntegrationEvent, {
    handle: async event => {
      await this.paymentCompletedHandler.handle(event as any);
    },
  });
}
```

**Note**: Domain event handlers with `@EventHandler` decorator are auto-discovered by VytchesDDD - NO manual registration needed.

---

## 📚 References

### ADRs
- **ADR-0012**: CQRS Structure - Query/Command separation
- **ADR-0013**: Hybrid Error Handling - Result pattern in application layer

### Implementation Files
- `src/contexts/engagement/application/queries/get-comments-for-target/handler.ts`
- `src/contexts/auth/application/queries/get-user-profile/handler.ts`
- `src/shared/application/base/base-query-handler.ts` (base class)

### Related Patterns
- **command-handler-pattern.md** - Write-side CQRS handlers
- **repository-pattern.md** - Query repositories vs command repositories
- **controller-schema-pattern.md** - API layer query endpoints
- **geographic-filtering-pattern.md** - Geographic query filters (TERYT + GPS radius) for moderation queues

---

## 🎯 When to Use

### Use Query Handlers When

✅ **Read operations**: Fetching data without state changes
✅ **Reporting**: Analytics, dashboards, metrics
✅ **Search**: Filtering, pagination, sorting
✅ **List views**: Paginated lists with filters
✅ **Detail views**: Single entity retrieval

### Use Command Handlers Instead When

❌ **Write operations**: Create, update, delete
❌ **State changes**: Status transitions, business processes
❌ **Transactions required**: Multiple writes must be atomic

---

**Version**: 2.0
**Created**: 2026-01-04
**Last Updated**: 2026-02-05
**Maintained By**: @project-orchestrator
**Primary Users**: domain-application-implementer, code-quality-verifier

**v2.0 Changes** (2026-02-05):
- **MAJOR**: Module Registration section rewritten for `@QueryHandler` auto-discovery
  - Removed manual `queryBus.register()` pattern (kept as anti-pattern reference)
  - Simplified registration: just add `@QueryHandler` decorator + providers array
  - VytchesExplorerService handles automatic discovery and registration
  - No more `onModuleInit` boilerplate for handler registration
