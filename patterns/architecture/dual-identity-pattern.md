# Dual Identity Pattern

## 🎯 Problem

**User ID hijacking: Malicious clients can impersonate other users by sending fake userId in request body.**

In REST APIs accepting user IDs from clients:
- Attackers can modify request body to include arbitrary `userId`
- Business logic trusts client-provided `userId` without verification
- One user can perform actions as another user (privilege escalation)
- Audit trails show wrong user (compliance violation)

**Real Attack Vector**:
```json
POST /api/actions
{
  "actionType": "LIKE",
  "targetId": "event-123",
  "userId": "victim-user-id"  // ← Attacker changes this!
}
```

**Why This is CRITICAL**: User impersonation defeats ALL authorization checks.

## ✅ Solution

**Dual Identity Pattern** uses TWO sources for user identity:
1. **JWT Token** (trusted) - Extracted from HTTP Authorization header by auth guard
2. **Request Body** (untrusted) - NEVER used for authentication

**Only the JWT userId is used for business operations.** Request body userId is IGNORED or validated against JWT userId.

**Implementation**:
- Controller layer uses `@CurrentUserId()` decorator to extract JWT userId
- Command/Handler layer receives userId as parameter from controller
- Request body NEVER includes userId field

## 🔧 Implementation

### Step 1: Controller Layer (Extract userId from JWT)

**✅ CORRECT**: JWT userId via decorator

```typescript
// Real Project Code: community-communication/api/controllers/actions.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { Auth } from '@shared/infrastructure/auth/decorators/auth.decorator';
import { CurrentUserId } from '@shared/infrastructure/auth/decorators/current-user.decorator';

@Controller('actions')
export class ActionsController {
  constructor(
    @Inject(ICommandBus) private readonly commandBus: ICommandBus
  ) {}

  /**
   * Create engagement action
   *
   * SECURITY: userId extracted from JWT token (@CurrentUserId decorator)
   * NOT from request body. Client CANNOT spoof userId.
   */
  @Auth() // Validates JWT token, populates request.user
  @Post()
  async createAction(
    @CurrentUserId() userId: string, // ← From JWT (trusted source)
    @Body() dto: CreateActionRequestDto // ← From body (untrusted source)
  ) {
    // Validate DTO with Zod schema (NO userId in schema!)
    const validationResult = createActionRequestSchema.safeParse(dto);
    if (!validationResult.success) {
      throw new BadRequestException(validationResult.error.errors);
    }

    // Create command with JWT userId (NOT body userId)
    const command = new CreateActionCommand(
      userId, // ← From JWT, CANNOT be spoofed
      validationResult.data.actionType,
      validationResult.data.targetId
    );

    const result = await this.commandBus.execute(command);

    if (result.isFailure) {
      throw new BadRequestException(result.error.message);
    }

    return {
      success: true,
      actionId: result.value,
    };
  }
}
```

**❌ WRONG**: userId from request body

```typescript
// ❌ NEVER DO THIS: Client controls userId!
@Post()
async createAction(@Body() dto: CreateActionRequestDto) {
  const command = new CreateActionCommand(
    dto.userId, // ← From body, ATTACKER CAN CHANGE THIS!
    dto.actionType,
    dto.targetId
  );
  // ...
}
```

### Step 2: Zod Schema (NO userId field)

**✅ CORRECT**: Schema WITHOUT userId

```typescript
// Real Project Code: community-communication/api/schemas/create-action.schema.ts
import { z } from 'zod';

/**
 * Schema for create action request
 *
 * SECURITY: NO userId field - userId comes from JWT (@CurrentUserId decorator)
 */
export const createActionRequestSchema = z.object({
  actionType: z.enum(['LIKE', 'SHARE', 'BOOKMARK', 'REPORT']),
  targetId: z.string().uuid(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateActionRequestDto = z.infer<typeof createActionRequestSchema>;
```

**❌ WRONG**: Schema WITH userId

```typescript
// ❌ NEVER DO THIS: Allows client to send userId!
export const createActionRequestSchema = z.object({
  userId: z.string().uuid(), // ← SECURITY VULNERABILITY!
  actionType: z.enum(['LIKE', 'SHARE', 'BOOKMARK', 'REPORT']),
  targetId: z.string().uuid(),
});
```

### Step 3: Command Definition (userId as parameter)

**✅ CORRECT**: Command receives userId from controller

```typescript
// Real Project Code: engagement/application/commands/create-action/command.ts
import { Command } from '@vytches/ddd';

/**
 * Command to create engagement action
 *
 * SECURITY: userId parameter populated by controller from JWT (@CurrentUserId)
 * NOT from request body. Client cannot manipulate this value.
 *
 * @param userId - Authenticated user ID from JWT token (trusted)
 * @param actionType - Type of action (LIKE, SHARE, etc.)
 * @param targetId - Target entity ID (event, alert, etc.)
 */
export class CreateActionCommand extends Command {
  constructor(
    public readonly userId: string, // ← From JWT (controller passes this)
    public readonly actionType: string,
    public readonly targetId: string
  ) {
    super();
  }
}
```

### Step 4: Handler Layer (Trust userId parameter)

**✅ CORRECT**: Handler uses userId from command (already validated)

```typescript
// Real Project Code: engagement/application/commands/create-action/handler.ts
import { Inject, Injectable } from '@nestjs/common';
import { BaseCommandHandler, Result } from '@vytches/ddd';

@Injectable()
export class CreateActionHandler extends BaseCommandHandler<CreateActionCommand, string> {
  constructor(
    @Inject(USER_READ_MODEL_REPOSITORY)
    private readonly userRepo: IUserReadModelRepository,
    @Inject(ACTION_COMMAND_REPOSITORY)
    private readonly actionRepo: IActionCommandRepository
  ) {
    super();
  }

  /**
   * Execute action creation
   *
   * SECURITY: command.userId comes from JWT via controller
   * NO need to validate - already authenticated by @Auth() guard
   */
  async execute(command: CreateActionCommand): Promise<Result<string, Error>> {
    // Verify user exists in local projection
    const userExists = await this.userRepo.exists(command.userId);
    if (!userExists) {
      return Result.fail(new Error('User not found'));
    }

    // Create action with TRUSTED userId
    const action = EngagementActionAggregate.create(
      command.userId, // ← Trusted userId from JWT
      command.actionType,
      command.targetId
    );

    if (action.isFailure) {
      return Result.fail(action.error);
    }

    await this.actionRepo.save(action.value);
    return Result.ok(action.value.id.value);
  }
}
```

### Step 5: Alternative - RequestContextService

For handlers needing userId without command parameter:

```typescript
import { RequestContextService } from '@shared/infrastructure/request-context';

@Injectable()
export class SomeHandler extends BaseCommandHandler<SomeCommand, string> {
  constructor(
    @Inject(RequestContextService)
    private readonly requestContext: RequestContextService
  ) {
    super();
  }

  async execute(command: SomeCommand): Promise<Result<string, Error>> {
    // Extract userId from request context (set by auth middleware)
    const userId = this.requestContext.getUserId();

    if (!userId) {
      return Result.fail(new Error('User not authenticated'));
    }

    // Use trusted userId for business logic
    // ...
  }
}
```

## 📋 Rules

### MUST

- ✅ **MUST** use `@CurrentUserId()` decorator in controllers to extract JWT userId
- ✅ **MUST** pass userId as command constructor parameter (from controller)
- ✅ **MUST** exclude userId from Zod request schemas
- ✅ **MUST** protect endpoints with `@Auth()` guard (validates JWT)
- ✅ **MUST** use RequestContextService for userId in non-controller contexts
- ✅ **MUST** document in command JSDoc that userId comes from JWT

### MUST NOT

- ❌ **MUST NOT** accept userId from request body
- ❌ **MUST NOT** include userId in Zod schemas for POST/PUT/PATCH endpoints
- ❌ **MUST NOT** trust userId from query parameters (use JWT only)
- ❌ **MUST NOT** trust userId from URL path parameters for current user operations
- ❌ **MUST NOT** use userId from cookies (except JWT cookie with HttpOnly flag)

## ⚠️ Anti-Patterns

### Anti-Pattern 1: userId in Request Body

```typescript
// ❌ WRONG: Client can send fake userId
export const createActionRequestSchema = z.object({
  userId: z.string().uuid(), // SECURITY VULNERABILITY!
  actionType: z.enum(['LIKE', 'SHARE']),
});

@Post()
async createAction(@Body() dto: CreateActionRequestDto) {
  const command = new CreateActionCommand(dto.userId, dto.actionType);
  // ← Attacker changes dto.userId to impersonate victim!
}
```

**Attack Scenario**:
1. Attacker logs in as `attacker-user-id`
2. Attacker sends POST with `userId: "victim-user-id"` in body
3. System creates action as victim user
4. Victim gets blamed for attacker's action

**Fix**: Remove userId from schema, use `@CurrentUserId()` decorator.

### Anti-Pattern 2: Missing @Auth() Guard

```typescript
// ❌ WRONG: No authentication check
@Post()
async createAction(
  @CurrentUserId() userId: string, // ← Returns null (no auth!)
  @Body() dto: CreateActionRequestDto
) {
  // userId is null - command fails silently or uses default
}
```

**Why Bad**: `@CurrentUserId()` returns `null` if no JWT token, causing silent failures.

**Fix**: Add `@Auth()` guard to validate JWT BEFORE decorator execution.

### Anti-Pattern 3: Mixing Trusted and Untrusted Sources

```typescript
// ❌ WRONG: Using body userId for some operations, JWT userId for others
@Post()
async createAction(
  @CurrentUserId() jwtUserId: string,
  @Body() dto: CreateActionRequestDto
) {
  // Inconsistent - which userId to trust?
  if (dto.userId !== jwtUserId) {
    throw new ForbiddenException('User mismatch');
  }
  // ... Why validate if you won't trust body userId anyway?
}
```

**Why Bad**: Adds complexity, client confusion, and still vulnerable to attacks.

**Fix**: Use ONLY JWT userId, remove userId from body entirely.

### Anti-Pattern 4: Query Parameter userId

```typescript
// ❌ WRONG: userId from query string
@Get('my-actions')
async getMyActions(
  @Query('userId') userId: string // ← URL can be modified!
) {
  // Attacker changes URL: ?userId=victim-user-id
}
```

**Why Bad**: Query parameters are easily modified in browser/proxy tools.

**Fix**: Use `@CurrentUserId()` for "my" operations, ignore query userId.

## 📚 References

### ADRs
- **ADR-0021**: Validation Layer Separation (API validates format, domain validates business rules)
- **ADR-0013**: Hybrid Error Handling (Result pattern in domain/application)

### Related Patterns
- **User Projection Pattern**: Local user tables prevent cross-context user ID abuse
- **ACL Registry Pattern**: Cross-context operations still use JWT userId (not request body)

### Implementation Files
- `src/shared/infrastructure/auth/decorators/current-user.decorator.ts` - @CurrentUserId decorator
- `src/shared/infrastructure/auth/guards/authenticated.guard.ts` - JWT validation
- `src/shared/infrastructure/request-context/request-context.service.ts` - RequestContext with userId

### Real Examples
1. **Engagement Actions** (`engagement/api/controllers/actions.controller.ts`)
2. **Community Events** (`community-communication/api/controllers/events.controller.ts`)
3. **Event Feedback** (`community-communication/application/commands/submit-event-feedback/command.ts`)

## 🎯 When to Use

**Use Dual Identity Pattern for:**

1. ✅ **User-Owned Resources** - Creating/updating resources owned by current user
2. ✅ **User Actions** - Likes, shares, bookmarks, reports
3. ✅ **User Profile Operations** - Updating own profile, preferences
4. ✅ **Audit Logging** - Recording who performed action (compliance)

**Do NOT use for:**

1. ❌ **Admin Operations** - Admins acting on behalf of other users (use separate adminId + targetUserId)
2. ❌ **Public Endpoints** - No authentication required (userId is null)
3. ❌ **System Operations** - Background jobs, cron tasks (userId is null)

### Decision Tree

```
Does endpoint require authentication?
├─ NO → @Public() decorator, userId not needed
└─ YES → @Auth() guard + @CurrentUserId()
         └─ Does user act on THEIR OWN resources?
            ├─ YES → Use @CurrentUserId() ONLY (Dual Identity Pattern)
            └─ NO → Admin operation
                    └─ Use @CurrentUserId() for admin + targetUserId from body/params
```

### Testing Strategy

**Unit Tests**: Mock RequestContextService or pass userId directly

```typescript
describe('CreateActionHandler', () => {
  it('should create action with authenticated user ID', async () => {
    const command = new CreateActionCommand(
      'authenticated-user-id', // ← From JWT in real scenario
      'LIKE',
      'target-123'
    );

    const result = await handler.execute(command);

    expect(result.isSuccess).toBe(true);
    expect(mockRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'authenticated-user-id', // Verify correct userId used
      })
    );
  });
});
```

**E2E Tests**: Send real JWT token, verify userId extraction

```typescript
describe('POST /api/actions (E2E)', () => {
  it('should use JWT userId, NOT body userId', async () => {
    const jwtToken = await loginUser('user-1@example.com');

    const response = await request(app.getHttpServer())
      .post('/api/actions')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        actionType: 'LIKE',
        targetId: 'event-123',
        // NOTE: No userId in body!
      })
      .expect(201);

    const action = await db
      .selectFrom('engagement_actions')
      .where('id', '=', response.body.actionId)
      .selectAll()
      .executeTakeFirst();

    expect(action.user_id).toBe('user-1-id'); // From JWT, not body
  });

  it('should reject unauthenticated requests', async () => {
    await request(app.getHttpServer())
      .post('/api/actions')
      .send({
        actionType: 'LIKE',
        targetId: 'event-123',
      })
      .expect(401); // Unauthorized
  });
});
```

**Security Test**: Verify body userId is IGNORED

```typescript
it('should IGNORE userId in body even if sent', async () => {
  const attackerToken = await loginUser('attacker@example.com'); // attacker-id

  const response = await request(app.getHttpServer())
    .post('/api/actions')
    .set('Authorization', `Bearer ${attackerToken}`)
    .send({
      userId: 'victim-user-id', // ← Attacker tries to spoof!
      actionType: 'LIKE',
      targetId: 'event-123',
    })
    .expect(201);

  const action = await db
    .selectFrom('engagement_actions')
    .where('id', '=', response.body.actionId)
    .selectAll()
    .executeTakeFirst();

  // Verify JWT userId used, NOT body userId
  expect(action.user_id).toBe('attacker-id'); // From JWT
  expect(action.user_id).not.toBe('victim-user-id'); // Body ignored!
});
```

---

**Pattern Type**: Security-Critical (MANDATORY for all user operations)
**Status**: Production-enforced (all contexts)
**Lines**: 297
