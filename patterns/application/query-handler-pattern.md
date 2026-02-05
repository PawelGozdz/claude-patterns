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

## 🔧 Module Registration

**CRITICAL**: Query handlers MUST be registered in module's `onModuleInit()` lifecycle hook.

### Registration Pattern

**File**: `src/contexts/neighborhood-economy/neighborhood-economy.module.ts`

```typescript
import type { OnModuleInit } from '@nestjs/common';
import { Inject, Module } from '@nestjs/common';
import { IQueryBus, EnhancedQueryBus } from '@vytches/ddd';

@Module({
  providers: [
    // 1. Add handler to providers array
    GetJobRequestHandler,
    ListJobRequestsHandler,
    GetMyJobRequestsHandler,
    // ... all query handlers
  ],
  exports: [
    // 2. Export handlers for CQRS bus registration
    GetJobRequestHandler,
    ListJobRequestsHandler,
    GetMyJobRequestsHandler,
  ],
})
export class NeighborhoodEconomyModule implements OnModuleInit {
  constructor(
    // 3. Inject QueryBus
    @Inject(IQueryBus) private readonly queryBus: EnhancedQueryBus,

    // 4. Inject ALL query handlers
    @Inject(GetJobRequestHandler)
    private readonly getJobRequestHandler: GetJobRequestHandler,
    @Inject(ListJobRequestsHandler)
    private readonly listJobRequestsHandler: ListJobRequestsHandler,
    @Inject(GetMyJobRequestsHandler)
    private readonly getMyJobRequestsHandler: GetMyJobRequestsHandler,
  ) {}

  // 5. Implement onModuleInit
  onModuleInit() {
    this.registerQueryHandlers();
  }

  // 6. Register each query with QueryBus
  private registerQueryHandlers(): void {
    this.queryBus.register(GetJobRequestQuery, this.getJobRequestHandler);
    this.queryBus.register(ListJobRequestsQuery, this.listJobRequestsHandler);
    this.queryBus.register(GetMyJobRequestsQuery, this.getMyJobRequestsHandler);
  }
}
```

### Registration Steps

**For EVERY new query handler**:

1. ✅ **Add to `providers`** array in `@Module()` decorator
2. ✅ **Export handler** in `exports` array (for CQRS bus registration)
3. ✅ **Inject handler** in module constructor with `@Inject(HandlerClass)`
4. ✅ **Register in `registerQueryHandlers()`** method:
   ```typescript
   this.queryBus.register(QueryClass, this.handlerInstance);
   ```

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
  exports: [
    // Export handlers for CQRS registration
    GetAccountHandler,
    GetAccountBalanceHandler,
    ListAccountsHandler,
    SearchAccountsHandler,
  ],
})
export class AccountModule implements OnModuleInit {
  constructor(
    @Inject(IQueryBus) private readonly queryBus: EnhancedQueryBus,
    @Inject(GetAccountHandler) private readonly getAccountHandler: GetAccountHandler,
    @Inject(GetAccountBalanceHandler) private readonly getAccountBalanceHandler: GetAccountBalanceHandler,
    @Inject(ListAccountsHandler) private readonly listAccountsHandler: ListAccountsHandler,
    @Inject(SearchAccountsHandler) private readonly searchAccountsHandler: SearchAccountsHandler,
  ) {}

  onModuleInit() {
    this.registerQueryHandlers();
  }

  private registerQueryHandlers(): void {
    this.queryBus.register(GetAccountQuery, this.getAccountHandler);
    this.queryBus.register(GetAccountBalanceQuery, this.getAccountBalanceHandler);
    this.queryBus.register(ListAccountsQuery, this.listAccountsHandler);
    this.queryBus.register(SearchAccountsQuery, this.searchAccountsHandler);
  }
}
```

### Registration Rules

**MUST**:
- ✅ Register EVERY query handler in `onModuleInit()`
- ✅ Inject handler in constructor with `@Inject()` decorator
- ✅ Add handler to `providers` and `exports` arrays
- ✅ Use `queryBus.register(QueryClass, handlerInstance)` syntax
- ✅ Implement `OnModuleInit` interface
- ✅ Group registrations in dedicated `registerQueryHandlers()` method

**MUST NOT**:
- ❌ Forget to register handler in QueryBus (runtime error: "No handler found for query")
- ❌ Register query class without handler instance
- ❌ Skip `OnModuleInit` implementation
- ❌ Register handlers in constructor (DI not ready yet)
- ❌ Forget to inject handler in constructor

### Anti-Pattern: Missing Registration

```typescript
// ❌ WRONG: Handler in providers but NOT registered in QueryBus
@Module({
  providers: [GetJobRequestHandler], // ✅ In providers
  exports: [GetJobRequestHandler],   // ✅ Exported
})
export class NeighborhoodEconomyModule {
  // ❌ NO OnModuleInit implementation!
  // ❌ NO queryBus.register() call!
}

// Result: Runtime error when executing query
await queryBus.execute(new GetJobRequestQuery(...));
// Error: No handler found for query "GetJobRequestQuery"
```

**Fix**: Implement complete registration pattern (see above).

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

**Version**: 1.0
**Created**: 2026-01-04
**Last Updated**: 2026-01-04
**Maintained By**: @localhero-project-orchestrator
**Primary Users**: domain-application-implementer, code-quality-verifier
