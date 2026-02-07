# Logger Pattern (DI-Based Logger via LOGGER_SERVICE Token)

**Version**: 1.0
**Last Updated**: 2026-01-04
**Status**: PRODUCTION
**Priority**: HIGH
**Primary Users**: domain-application-implementer, infrastructure-testing-implementer

---

## 🎯 Problem

**TypeScript Interface Erasure in Dependency Injection**

Project uses NestJS's dependency injection system, but TypeScript interfaces are **erased at runtime** after compilation:

```typescript
// ❌ This interface doesn't exist at runtime
interface ILoggerService {
  log(message: any): void;
}

// After TypeScript compilation, NestJS reflection sees:
constructor(logger: undefined) {}  // Interface = undefined!

// Result: NestJS cannot inject the correct logger instance
```

**Additional Problems with Direct Instantiation (`new Logger()`)**:

1. **No Test Isolation**: Cannot inject mock loggers in tests
2. **No Centralized Configuration**: Each logger has independent configuration
3. **Missing Enhanced Features**: No PII redaction, no request correlation, no audit trails
4. **Performance Overhead**: Multiple logger instances instead of shared singleton
5. **Tight Coupling**: Direct dependency on NestJS Logger class

**Real-World Impact**:
- **95% of Project codebase** uses LOGGER_SERVICE token (correct DI pattern)
- **5% legacy code** uses `new Logger()` (mostly AI providers, module-level logging)
- Recent features (TS-MOD-003 moderation) still use `new Logger()` → **tech debt**

---

## ✅ Solution

**Symbol Token + Abstract Class Pattern**

Project uses a **Symbol token** (`LOGGER_SERVICE`) that exists at **runtime** to enable proper dependency injection:

```typescript
// src/shared/infrastructure/logging/tokens.ts

// Symbol exists at runtime (not erased by TypeScript)
export const LOGGER_SERVICE = Symbol('LOGGER_SERVICE');

// Abstract class for type safety
export abstract class ILoggerService {
  abstract log(message: any, context?: string): void;
  abstract error(message: any, trace?: string | Error, context?: string): void;
  abstract warn(message: any, context?: string): void;
  abstract debug(message: any, context?: string): void;
  abstract verbose(message: any, context?: string): void;

  // Enhanced features
  abstract createChildLogger(name: string): ILoggerService;
  abstract setContext(context: string): void;
}
```

**Global Module Registration**:

```typescript
// src/shared/infrastructure/logging/logger.module.ts

@Global()
@Module({})
export class LoggerModule {
  static register(options: LoggerModuleOptions = {}): DynamicModule {
    return {
      module: LoggerModule,
      global: true,  // Available to all modules
      providers: [
        {
          provide: LOGGER_SERVICE,
          useFactory: (pinoLogger, systemLog, requestContext) => {
            return new EnhancedLoggerService(pinoLogger, systemLog, requestContext);
          },
          inject: ['PINO_LOGGER', SystemLogService, RequestContextService],
        },
      ],
      exports: [LOGGER_SERVICE, REDACTION_SERVICE],
    };
  }
}
```

**Enhanced Logger Features** (EnhancedLoggerService):
- **Pino-based structured logging** (high performance)
- **Automatic PII redaction** (emails, DOB, phone numbers via REDACTION_SERVICE)
- **Request correlation IDs** (cross-service tracing via RequestContextService)
- **Audit trail persistence** (critical logs saved to database via SystemLogService)
- **Performance metrics** (log processing time tracking)
- **Security event logging** (auth failures, suspicious activity)
- **GDPR-compliant logging** (automatic PII masking)

---

## 🔧 Implementation

### Pattern 1: Event Handler with DI Logger

**File**: `src/contexts/engagement/application/event-handlers/user-profile-updated.handler.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { LOGGER_SERVICE, type ILoggerService } from '@shared/infrastructure/logging';

@Injectable()
export class UserProfileUpdatedHandler {
  constructor(
    @Inject(LOGGER_SERVICE) private readonly logger: ILoggerService,
    @Inject(ICommandBus) private readonly commandBus: ICommandBus
  ) {}

  async handle(event: UserProfileUpdatedIntegrationEvent): Promise<void> {
    try {
      // Structured logging with context metadata
      this.logger.debug(
        'Skipping UserProfileUpdated event - no action needed in Engagement context',
        `UserId: ${event.userId}, Email: ${event.email}`
      );

      this.logger.info('Processing UserProfileUpdated event', {
        userId: event.userId,
        email: event.email,
        eventName: 'UserProfileUpdated',
      });
    } catch (error) {
      // Error logging with stack trace
      this.logger.error('Failed to process UserProfileUpdated event', error);
    }
  }
}
```

**Why This Works**:
- ✅ `@Inject(LOGGER_SERVICE)` uses runtime Symbol token
- ✅ Structured logging with metadata objects
- ✅ Automatic PII redaction (email masked in production)
- ✅ Request correlation ID automatically attached
- ✅ Testable (inject mock logger in tests)

---

### Pattern 2: Query Handler with Base Class Logger Inheritance

**File**: `src/contexts/engagement/application/queries/get-user-actions-on-target/handler.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { QueryHandler } from '@vytches/ddd';
import { LOGGER_SERVICE, type ILoggerService } from '@shared/infrastructure/logging';
import { REDACTION_SERVICE } from '@shared/infrastructure/logging';

@Injectable()
@QueryHandler(GetUserActionsOnTargetQuery)
export class GetUserActionsOnTargetHandler extends BaseQueryHandler<
  GetUserActionsOnTargetQuery,
  GetUserActionsOnTargetResult
> {
  constructor(
    @Inject(USER_ACTION_QUERY_REPOSITORY)
    private readonly actionQueryRepository: IUserActionQueryRepository,
    @Inject(LOGGER_SERVICE) logger: ILoggerService,
    @Inject(RequestContextService) requestContext: RequestContextService,
    @Inject(REDACTION_SERVICE) redactionService: RedactionService
  ) {
    // Pass logger to BaseQueryHandler
    super(logger, requestContext, redactionService);
  }

  protected async executeQuery(
    query: GetUserActionsOnTargetQuery
  ): Promise<Result<GetUserActionsOnTargetResult>> {
    // logger is inherited from base class
    this.logger.debug('Fetching user actions on target', {
      userId: query.userId,
      targetId: query.targetId,
      targetType: query.targetType,
    });

    // Business logic...
  }
}
```

**Why This Works**:
- ✅ Logger passed to BaseQueryHandler via `super(logger, ...)`
- ✅ All query handlers inherit logging configuration
- ✅ Consistent logging across all CQRS query handlers
- ✅ Automatic redaction and request context integration

---

### Pattern 3: Application Service with Child Logger

**File**: `src/contexts/community-communication/application/services/notification.service.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { ILoggerService, LOGGER_SERVICE } from '@shared/infrastructure/logging';

@Injectable()
export class NotificationService {
  private readonly logger: ILoggerService;

  constructor(@Inject(LOGGER_SERVICE) logger: ILoggerService) {
    // Create child logger with service-specific context
    this.logger = logger.createChildLogger(NotificationService.name);
  }

  async sendUrgentAlertNotification(payload: AlertNotificationPayload): Promise<void> {
    // All logs automatically tagged with "NotificationService" context
    this.logger.info('📢 [MOCK] URGENT Alert Notification', {
      alertId: payload.alertId,
      recipientIds: payload.recipientIds,
      priority: 'URGENT',
      type: 'alert',
    });

    // Error logging with automatic context
    this.logger.error('Failed to send notification', new Error('SMTP server unreachable'));
  }
}
```

**Why This Works**:
- ✅ `createChildLogger()` creates scoped logger with service name
- ✅ All logs automatically tagged with service context
- ✅ Hierarchical logging organization (parent → child)
- ✅ Service-specific log filtering enabled

---

### Pattern 4: Error Mapper with DI Logger

**File**: `src/contexts/engagement/infrastructure/mappers/engagement-error.mapper.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { LOGGER_SERVICE, type ILoggerService } from '@shared/infrastructure/logging';

@Injectable()
export class EngagementErrorMapper {
  constructor(@Inject(LOGGER_SERVICE) private readonly logger: ILoggerService) {}

  mapToHttpResponse(error: Error): HttpErrorResponse {
    if (error instanceof BaseError) {
      this.logger.debug('Mapping domain error to HTTP response', {
        errorCode: error.code,
        message: error.message,
      });
      return {
        statusCode: ERROR_HTTP_STATUS[error.code] || 500,
        message: error.message,
        code: error.code,
      };
    }

    this.logger.error('Unexpected error in engagement context', error);
    return {
      statusCode: 500,
      message: 'Internal Server Error',
      code: ProjectErrorCode.DEFAULT,
    };
  }
}
```

**Why This Works**:
- ✅ Infrastructure layer uses same DI pattern
- ✅ Error mapping logged for debugging
- ✅ Unexpected errors logged with full stack trace

---

### Pattern 5: Module-Level Logger (NestJS Lifecycle)

**File**: `src/app/api/uploads/uploads.module.ts`

```typescript
import { Module, Logger } from '@nestjs/common';

@Module({
  imports: [MulterModule.register({ /* ... */ })],
  controllers: [UploadsController],
})
export class UploadsModule {
  // Static logger for module lifecycle (before DI available)
  private static readonly logger = new Logger(UploadsModule.name);

  constructor() {
    UploadsModule.logger.log('UploadsModule initialized');
  }

  onModuleInit() {
    UploadsModule.logger.log('UploadsModule ready - file uploads enabled');
  }
}
```

**Why This Is Acceptable**:
- ✅ Module lifecycle happens **before DI is available**
- ✅ Static logger is only used for module initialization/destruction
- ✅ Application-level services still use LOGGER_SERVICE token
- ✅ Limited scope: only module lifecycle events

---

## 📋 Rules

### MUST

1. **MUST use LOGGER_SERVICE token** for all application, domain, and infrastructure classes (handlers, services, repositories, mappers)
2. **MUST inject via constructor** using `@Inject(LOGGER_SERVICE) private readonly logger: ILoggerService`
3. **MUST import from shared logging module**: `import { LOGGER_SERVICE, type ILoggerService } from '@shared/infrastructure/logging'`
4. **MUST use structured logging** with metadata objects for complex data (not string concatenation)
5. **MUST create child loggers** for service-specific context: `logger.createChildLogger(ServiceName.name)`
6. **MUST pass logger to base classes** (BaseCommandHandler, BaseQueryHandler) via `super(logger, ...)`

### MUST NOT

1. **MUST NOT use `new Logger()`** in application/domain/infrastructure layers (use LOGGER_SERVICE token)
2. **MUST NOT inject interface directly** (`@Inject(ILoggerService)` - interfaces are erased at runtime)
3. **MUST NOT create multiple logger instances** in the same class (use singleton from DI)
4. **MUST NOT log PII without redaction** (LOGGER_SERVICE automatically redacts via REDACTION_SERVICE)
5. **MUST NOT use console.log()** for production logging (not structured, not persistent, not redacted)

### MAY (Acceptable Use Cases for `new Logger()`)

1. **MAY use `new Logger()` in module-level static initialization** (before DI is available)
2. **MAY use `new Logger()` in standalone external clients** (AI providers, third-party integrations without Project context)
3. **MAY use `new Logger()` in bootstrap/main.ts** (application startup before modules load)

---

## ⚠️ Anti-Patterns

### Anti-Pattern 1: Direct Logger Instantiation in Handlers

**❌ WRONG** (Tech Debt - Needs Migration):

```typescript
// src/contexts/engagement/application/event-handlers/moderate-comment.handler.ts
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ModerateCommentHandler {
  private readonly logger = new Logger(ModerateCommentHandler.name);

  constructor(
    @InjectQueue(QueueName.CONTENT_MODERATION)
    private readonly moderationQueue: Queue<ContentModerationJobData>
  ) {}

  async handle(event: CommentCreatedEvent): Promise<void> {
    this.logger.error('CommentCreatedEvent missing businessData - cannot queue moderation');
  }
}
```

**Problems**:
- ❌ No test isolation (cannot inject mock logger)
- ❌ No PII redaction (email/phone logged in plaintext)
- ❌ No request correlation ID
- ❌ No audit trail persistence
- ❌ Tightly coupled to NestJS Logger implementation

**✅ CORRECT**:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { LOGGER_SERVICE, type ILoggerService } from '@shared/infrastructure/logging';

@Injectable()
export class ModerateCommentHandler {
  constructor(
    @InjectQueue(QueueName.CONTENT_MODERATION)
    private readonly moderationQueue: Queue<ContentModerationJobData>,
    @Inject(LOGGER_SERVICE) private readonly logger: ILoggerService
  ) {}

  async handle(event: CommentCreatedEvent): Promise<void> {
    // Structured logging with automatic PII redaction
    this.logger.error('CommentCreatedEvent missing businessData - cannot queue moderation', {
      eventId: event.eventId,
      correlationId: event.correlationId,
    });
  }
}
```

---

### Anti-Pattern 2: Injecting Interface Directly (TypeScript Erasure)

**❌ WRONG**:

```typescript
import { ILoggerService } from '@shared/infrastructure/logging';

@Injectable()
export class MyService {
  constructor(
    // ❌ Interface erased at runtime - NestJS cannot inject!
    private readonly logger: ILoggerService
  ) {}
}
```

**Error at Runtime**:
```
Error: Nest can't resolve dependencies of the MyService (?).
Please make sure that the argument dependency at index [0] is available in the MyModule context.
```

**Why It Fails**: TypeScript interfaces don't exist at runtime after compilation. NestJS reflection cannot determine what to inject.

**✅ CORRECT**:

```typescript
import { Inject } from '@nestjs/common';
import { LOGGER_SERVICE, type ILoggerService } from '@shared/infrastructure/logging';

@Injectable()
export class MyService {
  constructor(
    @Inject(LOGGER_SERVICE) private readonly logger: ILoggerService
  ) {}
}
```

**Why It Works**: Symbol token (`LOGGER_SERVICE`) exists at runtime. NestJS uses this token to look up the registered logger provider.

---

### Anti-Pattern 3: String Concatenation Instead of Structured Logging

**❌ WRONG**:

```typescript
this.logger.log(
  `User ${userId} created comment ${commentId} on post ${postId} at ${new Date()}`
);
```

**Problems**:
- ❌ Not machine-parseable (string parsing required)
- ❌ No automatic PII redaction (userId exposed)
- ❌ Cannot filter/aggregate by field
- ❌ Poor performance in log aggregation systems

**✅ CORRECT**:

```typescript
this.logger.log('User created comment', {
  userId,        // Automatically redacted in production
  commentId,
  postId,
  timestamp: new Date(),
  action: 'comment.created',
});
```

**Benefits**:
- ✅ Structured JSON logging (Pino format)
- ✅ Automatic PII redaction (userId masked)
- ✅ Filterable by any field
- ✅ High performance in ELK/Datadog/CloudWatch

---

### Anti-Pattern 4: Multiple Logger Instances in Same Class

**❌ WRONG**:

```typescript
@Injectable()
export class MyService {
  private readonly generalLogger = new Logger(MyService.name);
  private readonly errorLogger = new Logger(`${MyService.name}:errors`);
  private readonly debugLogger = new Logger(`${MyService.name}:debug`);

  async doWork() {
    this.generalLogger.log('Starting work');
    this.debugLogger.debug('Detailed debug info');
    this.errorLogger.error('Something failed');
  }
}
```

**Problems**:
- ❌ Memory waste (3 logger instances)
- ❌ Inconsistent configuration
- ❌ Harder to test (3 mocks needed)

**✅ CORRECT**:

```typescript
@Injectable()
export class MyService {
  constructor(@Inject(LOGGER_SERVICE) private readonly logger: ILoggerService) {}

  async doWork() {
    this.logger.log('Starting work');
    this.logger.debug('Detailed debug info');
    this.logger.error('Something failed');
  }
}
```

**Benefits**:
- ✅ Single logger instance (memory efficient)
- ✅ Consistent configuration
- ✅ Easy to test (one mock)
- ✅ Log level filtering handled centrally

---

### Anti-Pattern 5: console.log() in Production Code

**❌ WRONG**:

```typescript
async handle(command: CreateCommentCommand) {
  console.log('Creating comment:', command);
  console.error('Failed to create comment:', error);
}
```

**Problems**:
- ❌ Not structured (plain text)
- ❌ Not persistent (lost on restart)
- ❌ No PII redaction (security risk)
- ❌ No request correlation
- ❌ Cannot be filtered or aggregated

**✅ CORRECT**:

```typescript
async handle(command: CreateCommentCommand) {
  this.logger.debug('Creating comment', {
    commandType: command.constructor.name,
    userId: command.userId,
    targetId: command.targetId,
  });

  this.logger.error('Failed to create comment', error);
}
```

---

### Anti-Pattern 6: Not Using Child Loggers for Service Context

**❌ WRONG**:

```typescript
@Injectable()
export class NotificationService {
  constructor(@Inject(LOGGER_SERVICE) private readonly logger: ILoggerService) {}

  async sendEmail() {
    // All logs have generic context, hard to filter
    this.logger.log('Sending email');
  }
}

@Injectable()
export class AlertService {
  constructor(@Inject(LOGGER_SERVICE) private readonly logger: ILoggerService) {}

  async sendAlert() {
    // Same generic context as NotificationService
    this.logger.log('Sending alert');
  }
}
```

**Problems**:
- ❌ Cannot filter logs by service
- ❌ All services share same context
- ❌ Debugging harder (which service logged?)

**✅ CORRECT**:

```typescript
@Injectable()
export class NotificationService {
  private readonly logger: ILoggerService;

  constructor(@Inject(LOGGER_SERVICE) logger: ILoggerService) {
    this.logger = logger.createChildLogger(NotificationService.name);
  }

  async sendEmail() {
    // Logs tagged with "NotificationService" context
    this.logger.log('Sending email');
  }
}

@Injectable()
export class AlertService {
  private readonly logger: ILoggerService;

  constructor(@Inject(LOGGER_SERVICE) logger: ILoggerService) {
    this.logger = logger.createChildLogger(AlertService.name);
  }

  async sendAlert() {
    // Logs tagged with "AlertService" context
    this.logger.log('Sending alert');
  }
}
```

**Benefits**:
- ✅ Service-specific log filtering
- ✅ Hierarchical context (parent → child)
- ✅ Easier debugging (context shows source)

---

## 📚 References

### ADRs
- **ADR-0027**: Audit Event Selection Strategy (System Log persistence via LOGGER_SERVICE)

### Implementation Files
**Core Logger Infrastructure**:
- `src/shared/infrastructure/logging/tokens.ts` - LOGGER_SERVICE Symbol token, ILoggerService abstract class
- `src/shared/infrastructure/logging/enhanced-logger.service.ts` - EnhancedLoggerService implementation (Pino + SystemLog + RequestContext)
- `src/shared/infrastructure/logging/logger.module.ts` - Global logger module registration
- `src/shared/infrastructure/logging/redaction.service.ts` - PII redaction (emails, DOB, phone numbers)

**Example Usages (CORRECT Pattern)**:
- `src/contexts/engagement/application/event-handlers/user-profile-updated.handler.ts` - Event handler with DI logger
- `src/contexts/engagement/application/queries/get-user-actions-on-target/handler.ts` - Query handler with base class logger
- `src/contexts/community-communication/application/services/notification.service.ts` - Service with child logger
- `src/contexts/engagement/infrastructure/mappers/engagement-error.mapper.ts` - Error mapper with DI logger

**Legacy Code (INCORRECT Pattern - Needs Migration)**:
- `src/contexts/engagement/application/event-handlers/moderate-comment.handler.ts` - Event handler with `new Logger()` (tech debt)
- `src/contexts/engagement/infrastructure/repositories/visitor-comment-limit-redis.repository.ts` - Repository with `new Logger()`
- `src/shared/infrastructure/ai/clients/openai.client.ts` - AI client with `new Logger()` (acceptable for external integrations)
- `src/shared/infrastructure/ai/budget/budget-tracker.service.ts` - Budget tracker with `new Logger()`

**Acceptable `new Logger()` Usages**:
- `src/app/api/uploads/uploads.module.ts` - Module-level static logger (before DI available)
- `src/shared/infrastructure/media/media.module.ts` - Module-level static logger

### Related Patterns
- **domain-errors-pattern.md** - Error logging uses LOGGER_SERVICE for structured error tracking
- **transactional-pattern.md** - Transaction failures logged via LOGGER_SERVICE
- **bullmq-queue-pattern.md** - Queue job failures logged via LOGGER_SERVICE

### TypeScript Documentation
- [TypeScript Type Erasure](https://www.typescriptlang.org/docs/handbook/2/classes.html#type-only-field-declarations)
- [NestJS Custom Providers](https://docs.nestjs.com/fundamentals/custom-providers#non-class-based-provider-tokens)

---

## 🎯 When to Use

### ✅ Use LOGGER_SERVICE Token (95% of Cases)

| Use Case | Example |
|----------|---------|
| **Command Handlers** | `CreateCommentHandler`, `UpdateUserProfileHandler` |
| **Query Handlers** | `GetUserActionsHandler`, `GetCommentsForTargetHandler` |
| **Event Handlers** | `UserProfileUpdatedHandler`, `CommentCreatedHandler` |
| **Domain Services** | `UserTrustService`, `GeocodingService` |
| **Application Services** | `NotificationService`, `AlertService` |
| **Repositories** | `CommentRepository`, `UserActionRepository` |
| **Infrastructure Clients** | `PostgresClient`, `RedisClient` (Project-specific) |
| **Error Mappers** | `EngagementErrorMapper`, `AuthErrorMapper` |
| **Policies/Specifications** | `PolicyBuilder`, `CanCreateCommentSpec` |

**Rationale**: These classes benefit from:
- Test isolation (mock logger in tests)
- PII redaction (GDPR compliance)
- Request correlation (cross-service tracing)
- Audit trail persistence (security events)
- Centralized configuration

---

### ⚠️ Acceptable Use of `new Logger()` (5% of Cases)

| Use Case | Example | Rationale |
|----------|---------|-----------|
| **Module-Level Lifecycle** | `UploadsModule.onModuleInit()` | Before DI container is ready |
| **Bootstrap/Main** | `main.ts` application startup | Before NestJS app created |
| **External Client Wrappers** | `OpenAIClient`, `GeminiClient` | Third-party integrations without Project context |
| **Standalone Scripts** | Database migrations, CLI tools | Outside NestJS DI container |

**Decision Tree**:

```
Is this class managed by NestJS DI?
├─ YES → Use LOGGER_SERVICE token (@Inject)
│
└─ NO → Is this before DI container is ready?
    ├─ YES (Module lifecycle) → Use new Logger() (static)
    │
    └─ NO → Is this a standalone script?
        ├─ YES → Use new Logger()
        │
        └─ NO → Refactor to use NestJS DI with LOGGER_SERVICE
```

---

### 🚀 Migration Checklist (Legacy `new Logger()` → LOGGER_SERVICE)

**For handlers, services, repositories, mappers**:

1. **Add LOGGER_SERVICE import**:
   ```typescript
   import { Inject } from '@nestjs/common';
   import { LOGGER_SERVICE, type ILoggerService } from '@shared/infrastructure/logging';
   ```

2. **Remove Logger import**:
   ```typescript
   // DELETE: import { Logger } from '@nestjs/common';
   ```

3. **Remove `new Logger()` instantiation**:
   ```typescript
   // DELETE: private readonly logger = new Logger(MyService.name);
   ```

4. **Add constructor injection**:
   ```typescript
   constructor(
     @Inject(LOGGER_SERVICE) private readonly logger: ILoggerService,
     // ... other dependencies
   ) {}
   ```

5. **Optional: Create child logger for service context**:
   ```typescript
   constructor(@Inject(LOGGER_SERVICE) logger: ILoggerService) {
     this.logger = logger.createChildLogger(MyService.name);
   }
   ```

6. **Update tests**:
   ```typescript
   const mockLogger = {
     log: jest.fn(),
     error: jest.fn(),
     warn: jest.fn(),
     debug: jest.fn(),
   };

   const module = await Test.createTestingModule({
     providers: [
       MyService,
       {
         provide: LOGGER_SERVICE,
         useValue: mockLogger,
       },
     ],
   }).compile();
   ```

---

## 📊 Statistics

**Project Logger Usage** (as of 2026-01-04):

| Pattern | Usage % | Count | Status |
|---------|---------|-------|--------|
| LOGGER_SERVICE token (DI) | ~95% | 200+ files | ✅ Production standard |
| `new Logger()` | ~5% | 15-20 files | ⚠️ Legacy tech debt |
| Total logger usage | 100% | 220+ files | - |

**Files by Category**:

| Category | LOGGER_SERVICE | `new Logger()` | Migration Priority |
|----------|----------------|----------------|-------------------|
| Command/Query Handlers | 95% | 5% | 🔴 HIGH (TS-MOD-003 moderation handlers) |
| Event Handlers | 90% | 10% | 🔴 HIGH |
| Repositories | 85% | 15% | 🟡 MEDIUM (Redis repositories) |
| Application Services | 100% | 0% | ✅ COMPLETE |
| Infrastructure Clients | 70% | 30% | 🟢 LOW (AI providers acceptable) |
| Module Lifecycle | 0% | 100% | ✅ ACCEPTABLE (before DI ready) |

**Tech Debt**: 15-20 files need migration from `new Logger()` to LOGGER_SERVICE token (estimated 1-2 hours per file, 20-40 hours total).

---

## 🔍 Testing with LOGGER_SERVICE

### Unit Test Example

```typescript
describe('ModerateCommentHandler', () => {
  let handler: ModerateCommentHandler;
  let mockLogger: jest.Mocked<ILoggerService>;

  beforeEach(async () => {
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      verbose: jest.fn(),
      createChildLogger: jest.fn(),
      setContext: jest.fn(),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        ModerateCommentHandler,
        {
          provide: LOGGER_SERVICE,
          useValue: mockLogger,
        },
        // ... other dependencies
      ],
    }).compile();

    handler = module.get(ModerateCommentHandler);
  });

  it('should log error when event missing businessData', async () => {
    const event = new CommentCreatedEvent({ businessData: null } as any);

    await handler.handle(event);

    expect(mockLogger.error).toHaveBeenCalledWith(
      'CommentCreatedEvent missing businessData - cannot queue moderation',
      expect.any(Object)
    );
  });
});
```

---

**Version**: 1.0
**Created**: 2026-01-04
**Primary Users**: domain-application-implementer, infrastructure-testing-implementer
**Migration Priority**: HIGH (15-20 files need migration)
**Tech Debt Tracking**: TS-MOD-003 moderation handlers, Redis repositories, AI clients

---

**Maintained By**: @project-project-orchestrator
**Approved By**: Business owner (2026-01-04)
