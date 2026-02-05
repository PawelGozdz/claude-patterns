# Command Handler Pattern

## 🎯 Problem

**Challenges with command handler implementation**:
- Direct repository access in aggregates → async domain methods
- userId from request body → security vulnerability (ADR-0021)
- Missing @Transactional → manual transaction management errors
- Business logic in handlers → should be in aggregates/policies
- Missing error handling → unhandled exceptions crash application
- No logging/correlation → debugging impossible

**Real-world pain points**:
- **Production security bug**: userId accepted from request body → user impersonation attack
- **Transaction leak**: Forgot to commit transaction → database connection pool exhaustion
- **Missing correlation ID**: Cannot trace request across contexts → 2-hour debugging session
- **Business logic in handler**: Age validation in handler instead of specification → impossible to unit test

---

## ✅ Solution

**Command Handler pattern with**:
- `BaseCommandHandler<Command, Result<DTO, Error>>` extension
- `@CommandHandler(CommandClass)` decorator
- `@Injectable()` NestJS decorator
- `executeBusinessLogic()` implementation - ONLY orchestration
- Dual Identity Pattern: Extract userId from `RequestContextService`, NEVER from command
- `@Transactional()` on execute() method (inherited from BaseCommandHandler)
- Result pattern: ALL methods return `Result<T, Error>`
- ACL Registry for cross-context calls
- LOGGER_SERVICE injection for structured logging
- `getOperationName()` and `getBoundedContext()` for telemetry

---

## 🔧 Implementation

### Example 1: PostCommentHandler (Standard CQRS Pattern)

**File**: `src/contexts/engagement/application/commands/post-comment/handler.ts` (~250 lines)

**Key characteristics**:
- Dual Identity: userId from RequestContext, NOT command
- ACL Registry: Cross-context call to geographic-auth
- Local trust replica: engagement_user_trust for BR-COMMENT-003
- Visitor comment limit: Non-resident restrictions (BR-RES-005)
- Transaction support: @Transactional inherited from BaseCommandHandler

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, Result } from '@vytches/ddd';
import { BaseCommandHandler } from '@shared/application/base/base-command-handler';
import { UserId } from '@shared/domain';
import { ACL_REGISTRY_SERVICE, type ACLRegistryService } from '@shared/infrastructure/acl';
import { ILoggerService, LOGGER_SERVICE } from '@shared/infrastructure/logging';
import { RequestContextService } from '@shared/infrastructure/request-context';
import { CommentAggregate } from '../../../domain/aggregates/comment.aggregate';
import { EngagementValidationError } from '../../../domain/errors/engagement-validation.error';
import type { ICommentCommandRepository } from '../../../domain/repositories/comment-command.repository';
import { CommentContent, TargetReference } from '../../../domain/value-objects';
import type { CommentDto } from '../../dto/comment.dto';
import { PostCommentCommand } from './command';

// ✅ ACL interface (defined locally per ACL pattern)
interface IGeographicAuthAPI {
  getAddressComponents(userId: string): Promise<{
    city: string;
    street: string;
    gmina: string;
    voivodeship: string;
    tercCode: string;
  }>;
}

@Injectable()
@CommandHandler(PostCommentCommand)
export class PostCommentHandler extends BaseCommandHandler<
  PostCommentCommand,
  Result<CommentDto, EngagementValidationError>
> {
  constructor(
    // 1. ✅ Required base dependencies
    @Inject(LOGGER_SERVICE) logger: ILoggerService,
    @Inject(RequestContextService) requestContext: RequestContextService,
    @Inject(REDACTION_SERVICE) redactionService: RedactionService,

    // 2. ✅ Handler-specific dependencies
    @Inject(COMMENT_COMMAND_REPOSITORY)
    private readonly commentRepository: ICommentCommandRepository,
    @Inject(ENGAGEMENT_USER_TRUST_REPOSITORY)
    private readonly trustRepository: IEngagementUserTrustRepository,
    @Inject(VISITOR_COMMENT_LIMIT_REPOSITORY)
    private readonly visitorLimitRepository: IVisitorCommentLimitRepository,
    @Inject(ACL_REGISTRY_SERVICE)
    private readonly aclRegistry: ACLRegistryService
  ) {
    super(logger, requestContext, redactionService);
  }

  // 3. ✅ Telemetry methods
  protected getOperationName(): string {
    return 'PostComment';
  }

  protected getBoundedContext(): string {
    return 'Engagement';
  }

  // 4. ✅ Business logic orchestration (NO business rules!)
  public async executeBusinessLogic(
    command: PostCommentCommand
  ): Promise<Result<CommentDto, EngagementValidationError>> {
    // ============================================
    // Step 1: Extract userId from RequestContext (Dual Identity Pattern)
    // ============================================
    const userId = this.requestContext.getUserId();
    if (!userId) {
      return Result.fail(EngagementValidationError.authenticationRequired());
    }

    // ============================================
    // Step 2: Load user data from local replica
    // ============================================
    const verificationLevel = await this.trustRepository.getVerificationLevel(userId);
    const isBanned = await this.trustRepository.isCommentBanned(userId);

    if (isBanned) {
      return Result.fail(EngagementValidationError.userBannedFromCommenting());
    }

    // ============================================
    // Step 3: Cross-context validation via ACL (if needed)
    // ============================================
    let isVisitor = false;
    if (command.targetCity) {
      try {
        // ✅ ACL Registry for cross-context call
        const geoAuthACL = this.aclRegistry.getGlobalRequired<IGeographicAuthAPI>('geographic-auth');
        const addressComponents = await geoAuthACL.getAddressComponents(userId);
        const homeCity = addressComponents.city;

        // Check if user is non-resident
        if (isNonResident(homeCity, command.targetCity)) {
          isVisitor = true;

          // Check visitor comment limit (BR-RES-005)
          const countResult = await this.visitorLimitRepository.getCommentCount(
            userId,
            command.targetId
          );

          if (countResult.isSuccess && countResult.value.isLimitExceeded) {
            return Result.fail(
              EngagementValidationError.visitorCommentLimitExceeded(50, command.targetId)
            );
          }
        }
      } catch (error) {
        // Fail open: if residence unknown, treat as resident (no limits)
        this.logger.warn('Could not determine user residence for visitor limit check', {
          userId,
          targetCity: command.targetCity,
          error: error.message,
        });
      }
    }

    // ============================================
    // Step 4: Create value objects (format validation)
    // ============================================
    const contentResult = CommentContent.create(command.content);
    if (contentResult.isFailure) {
      return Result.fail(contentResult.error as EngagementValidationError);
    }

    const targetResult = TargetReference.create(command.targetType, command.targetId);
    if (targetResult.isFailure) {
      return Result.fail(targetResult.error as EngagementValidationError);
    }

    // ============================================
    // Step 5: Call aggregate factory (business rules)
    // ============================================
    const commentResult = CommentAggregate.create(
      UserId.create(userId),
      contentResult.value,
      targetResult.value,
      command.targetOwnerId,
      verificationLevel
    );

    if (commentResult.isFailure) {
      return Result.fail(commentResult.error);
    }

    // ============================================
    // Step 6: Persist aggregate (transaction auto-handled)
    // ============================================
    await this.commentRepository.save(commentResult.value);

    // ============================================
    // Step 7: Update visitor counter if applicable
    // ============================================
    if (isVisitor) {
      await this.visitorLimitRepository.incrementCommentCount(userId, command.targetId);
    }

    // ============================================
    // Step 8: Map to DTO and return
    // ============================================
    const dto: CommentDto = {
      id: commentResult.value.id.value,
      userId: commentResult.value.userId.value,
      content: commentResult.value.content.getContent(),
      targetType: commentResult.value.target.type,
      targetId: commentResult.value.target.id,
      nestingLevel: commentResult.value.nestingLevel.getLevel(),
      moderationStatus: commentResult.value.moderationStatus.status,
      verificationLevel: commentResult.value.verificationLevel,
      editCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return Result.ok(dto);
  }
}
```

---

## 📋 Rules

### MUST

1. **Extend `BaseCommandHandler<Command, Result<DTO, Error>>`**
2. **Decorators**: `@Injectable()` and `@CommandHandler(CommandClass)`
3. **Constructor injection**: logger, requestContext, redactionService, repositories, services
4. **Dual Identity**: Extract userId from `RequestContextService.getUserId()`, NEVER from command
5. **Implement telemetry**: `getOperationName()`, `getBoundedContext()`
6. **Result pattern**: `executeBusinessLogic()` returns `Result<DTO, Error>`
7. **Orchestration ONLY**: Load data, call aggregate methods, persist - NO business rules
8. **ACL Registry**: Cross-context calls via `aclRegistry.getGlobalRequired<T>()`
9. **@Transactional**: Inherited from BaseCommandHandler, auto-commit on success, auto-rollback on error
10. **Error handling**: Return `Result.fail(error)`, NEVER throw exceptions

### MUST NOT

1. **NEVER accept userId from command** - always from RequestContext (ADR-0021)
2. **NEVER business rules in handler** - delegate to aggregates/policies/specifications
3. **NEVER throw exceptions** - always return Result
4. **NEVER async domain methods** - keep aggregates synchronous
5. **NEVER direct context imports** - use ACL Registry for cross-context calls
6. **NEVER manual transaction management** - @Transactional handles it
7. **NEVER forget correlation ID** - auto-added by BaseCommandHandler

---

## ⚠️ Anti-Patterns

### 1. userId from Command (Security Vulnerability)

```typescript
// ❌ WRONG: userId from command (user can fake it!)
export class PostCommentCommand {
  constructor(
    public readonly userId: string, // ❌ CRITICAL SECURITY FLAW!
    public readonly content: string,
    public readonly targetId: string
  ) {}
}

// Handler accepts userId from request body
public async executeBusinessLogic(command: PostCommentCommand) {
  const userId = command.userId; // ❌ User can impersonate anyone!
  // ...
}

// ✅ CORRECT: userId from RequestContext (from JWT token)
export class PostCommentCommand {
  constructor(
    // ❌ NO userId field!
    public readonly content: string,
    public readonly targetId: string
  ) {}
}

// Handler extracts userId from JWT token
public async executeBusinessLogic(command: PostCommentCommand) {
  const userId = this.requestContext.getUserId(); // ✅ From JWT, cannot fake
  if (!userId) {
    return Result.fail(EngagementValidationError.authenticationRequired());
  }
  // ...
}
```

---

### 2. Business Rules in Handler (Should be in Aggregate)

```typescript
// ❌ WRONG: Age validation in handler
public async executeBusinessLogic(command: RegisterUserCommand) {
  const userId = this.requestContext.getUserId();

  // ❌ Business rule in handler!
  const age = this.calculateAge(command.dateOfBirth);
  if (age < 16) {
    return Result.fail(new MinimumAgeError());
  }

  // Create aggregate...
}

// ✅ CORRECT: Business rule in aggregate (via specification)
// In handler:
public async executeBusinessLogic(command: RegisterUserCommand) {
  const userId = this.requestContext.getUserId();

  // ✅ Aggregate handles business rules
  const userResult = UserIdentityAggregate.create(
    email,
    password,
    dateOfBirth // Aggregate validates via specification
  );

  if (userResult.isFailure) {
    return Result.fail(userResult.error);
  }

  await this.repository.save(userResult.value);
  return Result.ok(dto);
}

// In aggregate:
public static create(...): Result<UserIdentityAggregate, Error> {
  // ✅ Business rule validated by specification
  const ageSpec = new MeetsMinimumAgeSpecification(16);
  if (!ageSpec.isSatisfiedBy({ dateOfBirth })) {
    return Result.fail(new MinimumAgeError());
  }
  // ...
}
```

---

### 3. Throwing Exceptions (Should Return Result)

```typescript
// ❌ WRONG: Throwing exception
public async executeBusinessLogic(command: PostCommentCommand) {
  const userId = this.requestContext.getUserId();
  if (!userId) {
    throw new UnauthorizedException(); // ❌ Exception!
  }
  // ...
}

// ✅ CORRECT: Returning Result.fail
public async executeBusinessLogic(command: PostCommentCommand) {
  const userId = this.requestContext.getUserId();
  if (!userId) {
    return Result.fail(EngagementValidationError.authenticationRequired()); // ✅ Result pattern
  }
  // ...
}
```

---

### 4. Direct Cross-Context Imports (Should Use ACL)

```typescript
// ❌ WRONG: Direct import from another context
import { GeographicAuthService } from '@contexts/geographic-auth/application/services';

public async executeBusinessLogic(command: PostCommentCommand) {
  // ❌ Direct dependency on another context!
  const addressComponents = await this.geoAuthService.getAddressComponents(userId);
  // ...
}

// ✅ CORRECT: ACL Registry for cross-context calls
// Define interface locally (no imports from other contexts)
interface IGeographicAuthAPI {
  getAddressComponents(userId: string): Promise<AddressComponents>;
}

public async executeBusinessLogic(command: PostCommentCommand) {
  // ✅ ACL Registry retrieves cross-context service
  const geoAuthACL = this.aclRegistry.getGlobalRequired<IGeographicAuthAPI>('geographic-auth');
  const addressComponents = await geoAuthACL.getAddressComponents(userId);
  // ...
}
```

---

### 5. Manual Transaction Management (Use @Transactional)

```typescript
// ❌ WRONG: Manual transaction management
public async executeBusinessLogic(command: PostCommentCommand) {
  const transaction = await this.db.beginTransaction(); // ❌ Manual!

  try {
    const comment = CommentAggregate.create(...);
    await this.repository.save(comment, transaction);
    await transaction.commit(); // ❌ Manual commit
    return Result.ok(dto);
  } catch (error) {
    await transaction.rollback(); // ❌ Manual rollback
    return Result.fail(error);
  }
}

// ✅ CORRECT: @Transactional inherited from BaseCommandHandler
public async executeBusinessLogic(command: PostCommentCommand) {
  // ✅ Transaction automatically started by BaseCommandHandler
  const commentResult = CommentAggregate.create(...);

  if (commentResult.isFailure) {
    return Result.fail(commentResult.error); // ✅ Auto-rollback
  }

  await this.repository.save(commentResult.value); // ✅ Within transaction
  return Result.ok(dto); // ✅ Auto-commit on success
}
```

---

## 🔧 Module Registration

**CRITICAL**: Command handlers MUST be registered in module's `onModuleInit()` lifecycle hook.

### Registration Pattern

**File**: `src/contexts/neighborhood-economy/neighborhood-economy.module.ts`

```typescript
import type { OnModuleInit } from '@nestjs/common';
import { Inject, Module } from '@nestjs/common';
import { ICommandBus, EnhancedCommandBus } from '@vytches/ddd';

@Module({
  providers: [
    // 1. Add handler to providers array
    CreateJobRequestHandler,
    UpdateJobRequestHandler,
    CompleteJobRequestHandler,
    // ... all command handlers
  ],
  exports: [
    // 2. Export handlers for CQRS bus registration
    CreateJobRequestHandler,
    UpdateJobRequestHandler,
    CompleteJobRequestHandler,
  ],
})
export class NeighborhoodEconomyModule implements OnModuleInit {
  constructor(
    // 3. Inject CommandBus
    @Inject(ICommandBus) private readonly commandBus: EnhancedCommandBus,

    // 4. Inject ALL command handlers
    @Inject(CreateJobRequestHandler)
    private readonly createJobRequestHandler: CreateJobRequestHandler,
    @Inject(UpdateJobRequestHandler)
    private readonly updateJobRequestHandler: UpdateJobRequestHandler,
    @Inject(CompleteJobRequestHandler)
    private readonly completeJobRequestHandler: CompleteJobRequestHandler,
  ) {}

  // 5. Implement onModuleInit
  onModuleInit() {
    this.registerCommandHandlers();
  }

  // 6. Register each command with CommandBus
  private registerCommandHandlers(): void {
    this.commandBus.register(CreateJobRequestCommand, this.createJobRequestHandler);
    this.commandBus.register(UpdateJobRequestCommand, this.updateJobRequestHandler);
    this.commandBus.register(CompleteJobRequestCommand, this.completeJobRequestHandler);
  }
}
```

### Registration Steps

**For EVERY new command handler**:

1. ✅ **Add to `providers`** array in `@Module()` decorator
2. ✅ **Export handler** in `exports` array (for CQRS bus registration)
3. ✅ **Inject handler** in module constructor with `@Inject(HandlerClass)`
4. ✅ **Register in `registerCommandHandlers()`** method:
   ```typescript
   this.commandBus.register(CommandClass, this.handlerInstance);
   ```

### Complete Module Structure

**Typical module with command handlers**:

```typescript
@Module({
  imports: [SharedModule, DatabaseModule],
  providers: [
    // COMMAND HANDLERS - alphabetical order
    ActivateAccountHandler,
    CreateAccountHandler,
    UpdateAccountHandler,
    // ... repositories, services, etc.
  ],
  exports: [
    // Export handlers for CQRS registration
    ActivateAccountHandler,
    CreateAccountHandler,
    UpdateAccountHandler,
  ],
})
export class AccountModule implements OnModuleInit {
  constructor(
    @Inject(ICommandBus) private readonly commandBus: EnhancedCommandBus,
    @Inject(ActivateAccountHandler) private readonly activateAccountHandler: ActivateAccountHandler,
    @Inject(CreateAccountHandler) private readonly createAccountHandler: CreateAccountHandler,
    @Inject(UpdateAccountHandler) private readonly updateAccountHandler: UpdateAccountHandler,
  ) {}

  onModuleInit() {
    this.registerCommandHandlers();
  }

  private registerCommandHandlers(): void {
    this.commandBus.register(ActivateAccountCommand, this.activateAccountHandler);
    this.commandBus.register(CreateAccountCommand, this.createAccountHandler);
    this.commandBus.register(UpdateAccountCommand, this.updateAccountHandler);
  }
}
```

### Registration Rules

**MUST**:
- ✅ Register EVERY command handler in `onModuleInit()`
- ✅ Inject handler in constructor with `@Inject()` decorator
- ✅ Add handler to `providers` and `exports` arrays
- ✅ Use `commandBus.register(CommandClass, handlerInstance)` syntax
- ✅ Implement `OnModuleInit` interface
- ✅ Group registrations in dedicated `registerCommandHandlers()` method

**MUST NOT**:
- ❌ Forget to register handler in CommandBus (runtime error: "No handler found for command")
- ❌ Register command class without handler instance
- ❌ Skip `OnModuleInit` implementation
- ❌ Register handlers in constructor (DI not ready yet)
- ❌ Forget to inject handler in constructor

### Anti-Pattern: Missing Registration

```typescript
// ❌ WRONG: Handler in providers but NOT registered in CommandBus
@Module({
  providers: [CreateJobRequestHandler], // ✅ In providers
  exports: [CreateJobRequestHandler],   // ✅ Exported
})
export class NeighborhoodEconomyModule {
  // ❌ NO OnModuleInit implementation!
  // ❌ NO commandBus.register() call!
}

// Result: Runtime error when executing command
await commandBus.execute(new CreateJobRequestCommand(...));
// Error: No handler found for command "CreateJobRequestCommand"
```

**Fix**: Implement complete registration pattern (see above).

### Testing Registration

**Test**: Verify all commands have registered handlers

```typescript
describe('NeighborhoodEconomyModule - Handler Registration', () => {
  it('should register all command handlers in CommandBus', async () => {
    const module = await Test.createTestingModule({
      imports: [NeighborhoodEconomyModule],
    }).compile();

    const commandBus = module.get<ICommandBus>(ICommandBus);

    // Verify each command has a handler
    const commands = [
      CreateJobRequestCommand,
      UpdateJobRequestCommand,
      CompleteJobRequestCommand,
    ];

    for (const commandClass of commands) {
      const command = new commandClass({ /* test data */ });

      // Should NOT throw "No handler found"
      await expect(commandBus.execute(command)).resolves.toBeDefined();
    }
  });
});
```

---

## 📚 References

### ADRs
- **ADR-0012**: CQRS Structure - Command/Query separation
- **ADR-0013**: Hybrid Error Handling - Result pattern in application layer
- **ADR-0021**: Validation Layer Separation - Format validation at API, business rules in domain

### Implementation Files
- `src/contexts/engagement/application/commands/post-comment/handler.ts` (~250L)
- `src/contexts/auth/application/commands/register-user/handler.ts`
- `src/shared/application/base/base-command-handler.ts` (base class)

### Related Patterns
- **aggregate-pattern.md** - Aggregates handle business rules
- **dual-identity-pattern.md** - userId from RequestContext, NEVER command
- **transactional-pattern.md** - @Transactional for transaction management
- **acl-registry-pattern.md** - Cross-context calls via ACL Registry
- **domain-errors-pattern.md** - LocalHeroErrorCode for errors
- **query-handler-pattern.md** - Read-side CQRS handlers

---

## 🎯 When to Use

### Use Command Handlers When

✅ **Write operations**: Create, update, delete entities
✅ **State changes**: Status transitions, business process steps
✅ **Business workflows**: Multi-step processes requiring orchestration
✅ **Cross-aggregate coordination**: Multiple aggregates involved
✅ **Transaction required**: Multiple database operations must be atomic

### Use Query Handlers Instead When

❌ **Read operations**: Fetching data without state changes
❌ **Reporting**: Analytics, dashboards, metrics
❌ **Search**: Filtering, pagination, sorting

### Use Domain Services Instead When

❌ **Complex business rules**: Validation spanning multiple aggregates
❌ **Policy evaluation**: PolicyBuilder with multiple specifications
❌ **Cross-aggregate business logic**: Logic that doesn't belong to one aggregate

---

**Version**: 1.0
**Created**: 2026-01-04
**Last Updated**: 2026-01-04
**Maintained By**: @localhero-project-orchestrator
**Primary Users**: domain-application-implementer, code-quality-verifier
