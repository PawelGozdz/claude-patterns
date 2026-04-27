# Transactional Pattern

## 🎯 Problem

**Command handlers need automatic transaction management with Result pattern integration.**

In CQRS command handlers:
- Multiple database operations must succeed/fail atomically (ACID)
- Manual transaction management is error-prone (forget begin/commit/rollback)
- `Result.fail()` doesn't automatically trigger rollback (no exceptions thrown)
- Nested transactions cause isolation issues (savepoints, uncommitted data)
- Transaction context must propagate through service calls (CLS required)

**Real Challenge**: Handlers return `Result<T, E>` (functional pattern) but transactions need exceptions for rollback.

## ✅ Solution

**@Transactional Pattern** uses single decorator on `BaseCommandHandler.execute()` with automatic `Result.fail()` → exception conversion for rollback.

**Key Components**:
1. **Single Location**: `@Transactional()` ONLY on `BaseCommandHandler.execute()`
2. **Auto-Conversion**: `Result.fail()` → `BusinessLogicFailureException` → rollback
3. **CLS Propagation**: Transaction context propagates through all nested calls
4. **No Nesting**: Handlers DO NOT have `@Transactional()` (inherit from base)

## 🔧 Implementation

### Step 1: BaseCommandHandler with @Transactional

**Real Project Code** from `src/shared/application/base/base-command-handler.ts`:

```typescript
import { Transactional } from '@nestjs-cls/transactional';
import { ICommand, ICommandHandler, Result } from '@vytches/ddd';
import { BusinessLogicFailureException } from './business-logic-failure.exception';

export abstract class BaseCommandHandler<TCommand extends ICommand, TResult>
  implements ICommandHandler<TCommand, TResult>
{
  /**
   * Main execution method with transaction management
   *
   * @Transactional() ensures all database operations commit/rollback together.
   * Result.fail() is automatically converted to exception to trigger rollback.
   */
  @Transactional()
  async execute(command: TCommand): Promise<TResult> {
    const startTime = Date.now();

    try {
      // Execute business logic - handlers return Result normally
      const result = await this.executeBusinessLogic(command);

      // Auto-convert Result.fail() → exception for transaction rollback
      if (this.isResult(result) && result.isFailure) {
        throw new BusinessLogicFailureException(result.error);
      }

      // Result.ok(value) / Result.empty() → transaction commits automatically
      return result;
    } catch (error) {
      // Check if this is BusinessLogicFailure (Result.fail() converted)
      if (BusinessLogicFailureException.isBusinessLogicFailure(error)) {
        // Business failure - already rolled back by @Transactional()
        // Convert back to Result for caller
        return Result.fail(error.originalError) as TResult;
      }

      // Unexpected error - transaction rolled back, re-throw
      throw error;
    }
  }

  /**
   * ⚠️ **TRANSACTIONAL METHOD**
   *
   * This method executes within a database transaction managed by execute().
   * Returning Result.fail() triggers automatic rollback.
   *
   * Pattern:
   * - Return Result.ok(value) for success with payload → transaction commits
   * - Return Result.empty() for success without payload (void) → transaction commits
   * - Return Result.fail(error) for failure → automatic rollback
   * - Throwing exceptions → rollback + error logged
   *
   * NOTE: `Result.ok()` (no argument) was removed in @vytches/ddd upgrade.
   * Use `Result.ok(value)` for payloads or `Result.empty()` for void results.
   */
  protected abstract executeBusinessLogic(command: TCommand): Promise<TResult>;
}
```

**Key Mechanisms**:
- `@Transactional()` decorator from `@nestjs-cls/transactional`
- Automatic `Result.fail()` detection
- Conversion to `BusinessLogicFailureException` for rollback
- Conversion back to `Result` for caller

### Step 2: Handler WITHOUT @Transactional

**✅ CORRECT**: Handler inherits transaction from base class

**Real Project Code** from `auth/application/commands/login-user/handler.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { CommandHandler } from '@nestjs/cqrs';
import { Result } from '@vytches/ddd';
import { BaseCommandHandler } from '@shared/application/base/base-command-handler';

@Injectable()
@CommandHandler(LoginUserCommand)
export class LoginUserHandler extends BaseCommandHandler<
  LoginUserCommand,
  Result<AuthenticationResultDto, UserNotFoundError | InvalidCredentialsError>
> {
  constructor(
    @Inject(LOGGER_SERVICE) logger: ILoggerService,
    @Inject(RequestContextService) requestContext: RequestContextService,
    @Inject(REDACTION_SERVICE) redactionService: RedactionService,
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository
  ) {
    super(logger, requestContext, redactionService);
  }

  /**
   * ⚠️ **TRANSACTIONAL METHOD**
   *
   * This method executes within a database transaction managed by BaseCommandHandler.execute().
   * Returning Result.fail() triggers automatic rollback.
   *
   * NO @Transactional() decorator needed - inherits from base class
   */
  protected async executeBusinessLogic(
    command: LoginUserCommand
  ): Promise<Result<AuthenticationResultDto, UserNotFoundError | InvalidCredentialsError>> {
    // All operations use transaction from BaseCommandHandler.execute()

    // 1. Find user (reads from transaction)
    const userResult = await this.userRepository.findByEmail(command.email);
    if (userResult.isFailure) {
      return Result.fail(new UserNotFoundError()); // → Triggers ROLLBACK
    }

    // 2. Verify password
    const isValid = await this.passwordService.verify(
      command.password,
      userResult.value.passwordHash
    );
    if (!isValid) {
      return Result.fail(new InvalidCredentialsError()); // → Triggers ROLLBACK
    }

    // 3. Create session (writes to transaction)
    const session = await this.sessionService.createSession(userResult.value.id);

    // 4. Generate tokens
    const tokens = await this.authService.generateTokens(session.id);

    return Result.ok(tokens); // → Triggers COMMIT
  }
}
```

**Note**: NO `@Transactional()` decorator on handler - inherits from base class.

**❌ WRONG**: Duplicate @Transactional on handler

```typescript
// ❌ DON'T DO THIS - Creates nested transaction!
@Injectable()
@CommandHandler(LoginUserCommand)
export class LoginUserHandler extends BaseCommandHandler<...> {
  @Transactional() // ← REMOVED - Causes nested transaction issues
  protected async executeBusinessLogic(command: LoginUserCommand) {
    // This creates NESTED transaction with BaseCommandHandler.execute()
    // Causes: isolation issues, savepoint problems, data not visible
  }
}
```

**Why Bad**: Creates nested transaction, inner commits before outer, rollback doesn't work correctly.

### Step 3: Service Orchestration (Optional)

**Use Case**: Service orchestrates multiple commands in single transaction

```typescript
import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { ICommandBus } from '@vytches/ddd';

@Injectable()
export class UserRegistrationService {
  constructor(@Inject(ICommandBus) private readonly commandBus: ICommandBus) {}

  /**
   * Orchestrates user registration with multiple commands
   *
   * @Transactional ensures ALL commands succeed or ALL fail
   */
  @Transactional() // TX1 START (outer-most transaction)
  async registerWithDefaults(userData: UserData) {
    // All commands reuse TX1 (no new transactions)

    const user = await this.commandBus.execute(
      new RegisterUserCommand(userData)
    ); // Reuses TX1

    if (user.isFailure) throw new Error(user.error);

    await this.commandBus.execute(
      new AssignDefaultRoleCommand(user.value.id)
    ); // Reuses TX1

    await this.commandBus.execute(
      new CreateWelcomeNotificationCommand(user.value.id)
    ); // Reuses TX1

    // TX1 COMMIT (only if all succeed)
    return user.value;
  }
}
```

**CLS Magic**: Each handler's `@Transactional()` detects existing TX1, reuses it instead of creating new transaction.

## 📋 Rules

### MUST

- ✅ **MUST** use `@Transactional()` on `BaseCommandHandler.execute()` ONLY
- ✅ **MUST** return `Result.ok(value)` or `Result.empty()` for success (commits transaction)
- ✅ **MUST** return `Result.fail(error)` for business failures (triggers rollback)
- ✅ **MUST** document handlers with `@transactional` JSDoc tag
- ✅ **MUST** let base class convert `Result.fail()` to exception

### MUST NOT

- ❌ **MUST NOT** add `@Transactional()` to individual handlers (causes nesting)
- ❌ **MUST NOT** throw exceptions from business logic (return `Result.fail()`)
- ❌ **MUST NOT** manually begin/commit/rollback transactions
- ❌ **MUST NOT** add `@Transactional()` to repository methods (use CLS)
- ❌ **MUST NOT** add `@Transactional()` to domain entities/aggregates

## ⚠️ Anti-Patterns

### Anti-Pattern 1: Nested @Transactional Decorators

```typescript
// ❌ WRONG: Duplicate decorator causes nested transaction
export class LoginUserHandler extends BaseCommandHandler<...> {
  @Transactional() // ← Causes nested transaction with base class
  protected async executeBusinessLogic(command: LoginUserCommand) {
    // Inner transaction commits before outer
    // Rollback doesn't work correctly
  }
}
```

**Why Bad**: Inner transaction commits as savepoint, outer rollback doesn't undo inner commits.

**Fix**: Remove decorator from handler, inherit from base class.

### Anti-Pattern 2: Throwing Exceptions Instead of Result.fail()

```typescript
// ❌ WRONG: Throwing exceptions breaks Result pattern
protected async executeBusinessLogic(command: MyCommand): Promise<Result<T, E>> {
  if (invalid) {
    throw new Error('Invalid input'); // ← Breaks pattern!
  }
  // ...
}
```

**Why Bad**: Bypasses Result pattern, makes error handling inconsistent.

**Fix**: Return `Result.fail()`, let base class convert to exception for rollback.

### Anti-Pattern 3: Manual Transaction Management

```typescript
// ❌ WRONG: Manual transaction management
protected async executeBusinessLogic(command: MyCommand) {
  const tx = await this.db.transaction();
  try {
    await tx.query('INSERT ...');
    await tx.commit();
  } catch (error) {
    await tx.rollback();
  }
}
```

**Why Bad**: Bypasses CLS, duplicates transaction management, error-prone.

**Fix**: Use `@Transactional()` on base class, let CLS handle transactions.

### Anti-Pattern 4: @Transactional on Repository Methods

```typescript
// ❌ WRONG: Adding decorator to repository methods
@Injectable()
export class UserRepository {
  @Transactional() // ← Unnecessary, CLS handles this
  async save(user: User) {
    await this.db.insert(...);
  }
}
```

**Why Bad**: Creates unnecessary nested transaction, CLS already propagates transaction.

**Fix**: Remove decorator, repository methods automatically use CLS transaction.

## 📚 References

### ADRs
- **ADR-0013**: Hybrid Error Handling (Result pattern in domain/application)
- **ADR-0014**: Structured Logging (BaseCommandHandler logging)

### Related Patterns
- **Result Pattern**: Functional error handling (no exceptions in business logic)
- **CQRS Pattern**: Command/Query separation

### Implementation Files
- `src/shared/application/base/base-command-handler.ts` - Base class with @Transactional
- `src/shared/application/base/business-logic-failure.exception.ts` - Exception for rollback
- `src/contexts/auth/application/commands/login-user/handler.ts` - Example handler

### Real Examples
1. **Login User** (`auth/application/commands/login-user/handler.ts`)
2. **Create Event** (`community-communication/application/commands/create-event/handler.ts`)
3. **Perform Action** (`engagement/application/commands/create-action/handler.ts`)

## 🎯 When to Use

**Use @Transactional Pattern for:**

1. ✅ **ALL command handlers** (write operations)
2. ✅ **Services orchestrating multiple commands** (atomic workflows)
3. ✅ **Domain services with database writes** (cross-aggregate operations)

**Do NOT use for:**

1. ❌ **Query handlers** (read-only, no transactions needed)
2. ❌ **Domain entities/aggregates** (pure logic, no database)
3. ❌ **Repository methods** (use CLS automatically)
4. ❌ **Controllers** (delegate to handlers)

### Transaction Lifecycle

**Single Command Flow**:
```
1. Controller → CommandBus → BaseCommandHandler.execute() [@Transactional START]
2.   → executeBusinessLogic() [uses TX from step 1]
3.     → repository.save() [uses TX from step 1]
4.     → return Result.ok(value) | Result.empty() [TX COMMIT]
5.   ← Result returned to controller
```

**Multi-Command Flow (Service Orchestration)**:
```
1. Service.orchestrate() [@Transactional START - TX1]
2.   → commandBus.execute(cmd1) [@Transactional REUSES TX1]
3.     → handler1.executeBusinessLogic() [uses TX1]
4.   ← Result.ok(value) | Result.empty()
5.   → commandBus.execute(cmd2) [@Transactional REUSES TX1]
6.     → handler2.executeBusinessLogic() [uses TX1]
7.   ← Result.ok(value) | Result.empty()
8.   → return [TX1 COMMIT - ALL commands succeed or ALL fail]
```

### Testing Strategy

**E2E Tests**: Verify rollback behavior

```typescript
describe('Transaction Rollback (E2E)', () => {
  it('should rollback on Result.fail()', async () => {
    // Setup: Create user
    const user = await createUser({ email: 'test@example.com' });

    // Execute: Update with invalid data (triggers Result.fail())
    const result = await request(app)
      .patch(`/users/${user.id}`)
      .send({ email: 'invalid-email' }); // Validation fails

    // Verify: Changes rolled back
    expect(result.status).toBe(422);

    const dbUser = await queryUser(user.id);
    expect(dbUser.email).toBe('test@example.com'); // Unchanged (rollback worked)
  });

  it('should commit on Result.ok(value) / Result.empty()', async () => {
    const user = await createUser({ email: 'test@example.com' });

    const result = await request(app)
      .patch(`/users/${user.id}`)
      .send({ email: 'updated@example.com' });

    expect(result.status).toBe(200);

    const dbUser = await queryUser(user.id);
    expect(dbUser.email).toBe('updated@example.com'); // Changed (commit worked)
  });
});
```

---

**Pattern Type**: Infrastructure (MANDATORY for all command handlers)
**Status**: Production-enforced
**Lines**: 246
