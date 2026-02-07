# BullMQ Queue Pattern

## 🎯 Problem

**Inconsistent queue usage leads to runtime errors and type safety issues**:

1. **String literals instead of enums** - typos in queue names cause runtime failures
2. **Untyped Queue instances** - no compile-time validation of job data structure
3. **Missing job data interfaces** - inconsistent job payloads across producers/consumers
4. **Inconsistent error handling** - some handlers throw (breaking business flow), others don't retry
5. **Poor module registration** - queue registration scattered, duplicated, or missing

**Real incident**: `moderate-comment.handler.ts` used `@InjectQueue('content-moderation')` with untyped `Queue`, causing:
- No compile-time validation of job data
- Risk of typos in queue name
- No correlation with `QueueName` enum
- Inconsistent with existing patterns in `base-audit.handler.ts`

## ✅ Solution

**Centralized queue infrastructure with type-safe patterns**:

1. **QueueName Enum** - Single source of truth for all queue names in `queue.types.ts`
2. **Typed Queue Injection** - `Queue<JobDataType>` generic for compile-time safety
3. **BaseJobData Interface** - All job data extends base with `correlationId`, `timestamp`, `userId`
4. **BaseQueueProcessor** - Abstract base class for standardized consumer error handling
5. **Module Registration** - Explicit registration with enum (local or centralized approach)

**Key Benefits**:
- Type safety at compile time
- Consistent error handling (handlers log, processors throw for retry)
- Centralized queue configuration
- Easy to audit all queues (grep for `QueueName`)

## 🔧 Implementation

### Queue Injection Pattern (Producer)

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QueueName, type AuditLogJobData } from '@shared/infrastructure/queues/queue.types';

@Injectable()
export class YourHandler {
  constructor(
    // ✅ CORRECT: Use enum + typed Queue
    @InjectQueue(QueueName.AUDIT_LOGGING)
    protected readonly auditQueue: Queue<AuditLogJobData>,

    @InjectQueue(QueueName.CONTENT_MODERATION)
    private readonly moderationQueue: Queue<ContentModerationJobData>,
  ) {}
}
```

**Reference**: `/src/shared/application/audit/base-audit.handler.ts:42`

### Queue Job Data Pattern

```typescript
// src/shared/infrastructure/queues/queue.types.ts

/**
 * Content Moderation Job Data
 * Part of TS-MOD-003: Unified Async Moderation System
 */
export interface ContentModerationJobData extends BaseJobData {
  /**
   * Content ID to moderate (comment, post, profile, etc.)
   */
  contentId: string;

  /**
   * User ID who created the content
   */
  userId: string;

  /**
   * Content text to analyze
   */
  content: string;

  /**
   * User trust score from geographic-auth context
   */
  trustScore: number;

  /**
   * Target type for moderation
   */
  targetType: 'comment' | 'post' | 'profile' | 'quick-job';

  /**
   * Content language (default: 'pl' for Polish market)
   */
  language: string;

  /**
   * Job priority - based on trust score tier
   */
  priority?: QueuePriority;
}
```

**Reference**: `/src/shared/infrastructure/queues/queue.types.ts:534-592`

### Queue Enqueuing Pattern

```typescript
@Injectable()
export class ModerateCommentHandler {
  constructor(
    @InjectQueue(QueueName.CONTENT_MODERATION)
    private readonly moderationQueue: Queue<ContentModerationJobData>,
  ) {}

  async handle(event: CommentCreatedEvent): Promise<void> {
    try {
      // Enqueue moderation job with typed data
      await this.moderationQueue.add(
        'moderate.comment',  // Job name
        {
          contentId: event.commentId,
          userId: event.userId,
          content: event.content,
          trustScore: event.trustScore || 50,
          targetType: 'comment',
          language: 'pl',
          correlationId: crypto.randomUUID(),
          timestamp: new Date(),
        } satisfies ContentModerationJobData,
        {
          delay: 200,  // MVCC visibility delay
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          priority: QueuePriority.MEDIUM,
        }
      );
    } catch (error) {
      // CRITICAL: Event handlers should NEVER throw
      this.logger.error('Failed to enqueue moderation job', error);
    }
  }
}
```

**Reference**: `/src/contexts/engagement/application/event-handlers/moderate-comment.handler.ts:117-137`

### Queue Consumer Pattern

```typescript
import { Processor } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job } from 'bullmq';

import { BaseQueueProcessor, QueueName } from '@shared/infrastructure/queues';
import type { ContentModerationJobData } from '@shared/infrastructure/queues/queue.types';
import { LOGGER_SERVICE, type ILoggerService } from '@shared/infrastructure/logging';

/**
 * Content Moderation Queue Consumer
 * Processes async moderation jobs for comments, posts, profiles, quick jobs
 */
@Processor(QueueName.CONTENT_MODERATION)
export class ContentModerationConsumer extends BaseQueueProcessor<ContentModerationJobData> {
  constructor(
    @Inject(MODERATION_SERVICE) private readonly moderationService: IModerationService,
    @Inject(LOGGER_SERVICE) protected override readonly logger: ILoggerService
  ) {
    super(logger, QueueName.CONTENT_MODERATION);
  }

  /**
   * Process moderation job
   * Called by BullMQ when job is dequeued
   */
  protected async processJob(job: Job<ContentModerationJobData>): Promise<void> {
    const { contentId, userId, content, trustScore, targetType, language } = job.data;

    this.logger.info('Processing moderation job', {
      contentId,
      userId,
      targetType,
      trustScore,
      jobId: job.id,
    });

    // Perform moderation
    const result = await this.moderationService.moderate({
      contentId,
      userId,
      content,
      trustScore,
      targetType,
      language,
    });

    if (result.isFailure) {
      // Throw to trigger retry
      throw new Error(`Moderation failed: ${result.error.message}`);
    }

    this.logger.info('Moderation completed', {
      contentId,
      status: result.value.status,
      jobId: job.id,
    });
  }
}
```

**Reference**: Example based on `/src/contexts/auth/infrastructure/queues/audit-logging-queue.processor.ts`

### Module Registration Pattern

**Option A: Local Registration (context-specific queue)**

```typescript
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QueueName } from '@shared/infrastructure/queues/queue.types';

@Module({
  imports: [
    // ✅ CORRECT: Register queue with enum
    BullModule.registerQueue({ name: QueueName.CONTENT_MODERATION }),
  ],
  providers: [
    // Producer (enqueues jobs)
    ModerateCommentHandler,

    // Consumer (processes jobs)
    ContentModerationConsumer,
  ],
})
export class EngagementModule {}
```

**Reference**: `/src/contexts/engagement/engagement.module.ts:194`

**Option B: Centralized Registration (shared queues in BullQueueModule)**

```typescript
// src/shared/infrastructure/queues/bull.module.ts
import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigService } from '@shared/config';
import { QueueName } from './queue.types';

@Global()
@Module({})
export class BullQueueModule {
  static register(): DynamicModule {
    return {
      module: BullQueueModule,
      imports: [
        BullModule.registerQueueAsync(
          {
            name: QueueName.CONTENT_MODERATION,
            useFactory: (configService: ConfigService) => {
              const redisConfig = configService.getConfig().redis;
              return {
                connection: {
                  host: redisConfig.host,
                  port: redisConfig.port,
                  db: redisConfig.queueDatabase,
                  lazyConnect: true,
                  maxRetriesPerRequest: null,
                },
                defaultJobOptions: {
                  priority: 5,  // QueuePriority.MEDIUM
                  attempts: 3,
                  backoff: {
                    type: 'exponential',
                    delay: 2000,
                  },
                },
              };
            },
            inject: [ConfigService],
          },
          // ... other queues
        ),
      ],
      exports: [BullModule],
    };
  }
}

// Context module just provides the consumer
@Module({
  providers: [ContentModerationConsumer],
})
export class EngagementModule {}
```

**Reference**: `/src/shared/infrastructure/queues/bull.module.ts`

## 📋 Rules

### MUST (Producer - Event Handler)

1. **ALWAYS use QueueName enum** - Never use string literals for queue names
2. **ALWAYS type Queue<T>** - Specify job data type in generic parameter (`Queue<ContentModerationJobData>`)
3. **Access modifiers** - Use `protected readonly` for base classes, `private readonly` otherwise
4. **NEVER throw from event handlers** - Log errors and continue (graceful degradation)
5. **Job options** - Always specify `attempts`, `backoff`, and `priority`
6. **Type safety** - Use `satisfies` to ensure job data matches interface
7. **MVCC delay** - Use 200ms delay for jobs that depend on FK visibility
8. **Correlation tracking** - Include `correlationId` for distributed tracing
9. **Timestamp** - Include `timestamp` in all job data (from BaseJobData)

### MUST (Consumer - Processor)

10. **@Processor decorator** - Use `@Processor(QueueName.XXX)` with enum, NOT string literal
11. **Extend BaseQueueProcessor** - Inherit standardized error handling and logging
12. **processJob method** - Implement `protected async processJob(job: Job<T>): Promise<void>`
13. **Throw for retry** - Throw errors from `processJob()` to trigger automatic retry
14. **Job data typing** - Use typed `Job<ContentModerationJobData>` parameter

### MUST (Module Registration)

15. **Define JobData interface** - Extend `BaseJobData` for all job data types in `queue.types.ts`
16. **Register queue in module** - Use `BullModule.registerQueue({ name: QueueName.XXX })`
17. **Provider registration** - Register both producer (handler) and consumer in module providers
18. **Choose registration approach** - Local (context-specific) or Centralized (shared queues)
19. **ConfigService for shared** - Use `registerQueueAsync` with ConfigService injection for shared queues
20. **Export BullModule** - Export from centralized module for global queue access

### MUST NOT

1. **NEVER use string literals** - Always use `QueueName` enum for queue names
2. **NEVER use untyped Queue** - Always specify generic type `Queue<T>`
3. **NEVER throw from event handlers** - Breaks business flow, use logging instead
4. **NEVER return from processor errors** - Must throw to trigger BullMQ retry mechanism
5. **NEVER skip BaseJobData** - All job data must extend BaseJobData
6. **NEVER use plain objects** - Always define typed interfaces for job data

## ⚠️ Anti-Patterns

### ❌ WRONG: String Literal Without Type

```typescript
@Injectable()
export class WrongHandler {
  constructor(
    @InjectQueue('audit-logging')  // ❌ No enum
    private readonly auditQueue: Queue,  // ❌ No generic type
  ) {}
}
```

### ✅ CORRECT: Enum + Typed Queue

```typescript
@Injectable()
export class CorrectHandler {
  constructor(
    @InjectQueue(QueueName.AUDIT_LOGGING)  // ✅ Enum
    protected readonly auditQueue: Queue<AuditLogJobData>,  // ✅ Typed
  ) {}
}
```

### ❌ WRONG: Event Handler Throws

```typescript
async handle(event: CommentCreatedEvent): Promise<void> {
  await this.moderationQueue.add('moderate', data);  // ❌ Can throw, breaks flow
}
```

### ✅ CORRECT: Event Handler Catches

```typescript
async handle(event: CommentCreatedEvent): Promise<void> {
  try {
    await this.moderationQueue.add('moderate', data);
  } catch (error) {
    this.logger.error('Failed to enqueue', error);  // ✅ Log + continue
  }
}
```

### ❌ WRONG: Processor Returns Error

```typescript
protected async processJob(job: Job<T>): Promise<void> {
  const result = await this.service.process(job.data);
  if (result.isFailure) {
    this.logger.error('Failed');  // ❌ No retry
    return;
  }
}
```

### ✅ CORRECT: Processor Throws Error

```typescript
protected async processJob(job: Job<T>): Promise<void> {
  const result = await this.service.process(job.data);
  if (result.isFailure) {
    throw new Error(result.error.message);  // ✅ Triggers retry
  }
}
```

### ❌ WRONG: Module Registration with String

```typescript
@Module({
  imports: [
    BullModule.registerQueue({ name: 'content-moderation' }),  // ❌ String
  ],
})
export class EngagementModule {}
```

### ✅ CORRECT: Module Registration with Enum

```typescript
@Module({
  imports: [
    BullModule.registerQueue({ name: QueueName.CONTENT_MODERATION }),  // ✅ Enum
  ],
})
export class EngagementModule {}
```

## 📚 References

### Implementation Files

- **Good Example (Producer)**: `/src/shared/application/audit/base-audit.handler.ts:42`
- **Good Example (Consumer)**: `/src/contexts/auth/infrastructure/queues/audit-logging-queue.processor.ts`
- **Fixed Example**: `/src/contexts/engagement/application/event-handlers/moderate-comment.handler.ts`
- **Queue Types**: `/src/shared/infrastructure/queues/queue.types.ts`
- **Module Registration**: `/src/contexts/engagement/engagement.module.ts:194`
- **Centralized Config**: `/src/shared/infrastructure/queues/bull.module.ts`

### Related Patterns

- **transactional-pattern.md** - @Transactional works with queued events
- **repository-events-pattern.md** - Domain events can trigger queue jobs
- **dual-identity-pattern.md** - userId extraction applies to job data

### ADRs

- None directly, but follows NestJS best practices for BullMQ integration

## 🎯 When to Use

### Always Use BullMQ Queue Pattern When:

1. **Async processing needed** - Job takes >100ms, should not block request
2. **Retry logic required** - Operation may fail and needs automatic retry
3. **Background jobs** - Email sending, notifications, batch processing
4. **Rate limiting** - Process jobs at controlled rate
5. **Distributed processing** - Multiple workers can process same queue
6. **MVCC visibility delay** - 200ms delay for FK constraints (integration events)

### Examples in Project:

- **Audit Logging** - Async audit log writing (QueueName.AUDIT_LOGGING)
- **Content Moderation** - Async moderation with L0/L1/L2 strategy (QueueName.CONTENT_MODERATION)
- **Integration Events** - Cross-context sync with 200ms delay (QueueName.INTEGRATION_EVENTS)

### Registration Approach Decision:

**Use Local Registration (Option A)** when:
- Queue is context-specific (only used in one bounded context)
- Simple configuration (no ConfigService needed)
- Development/MVP phase

**Use Centralized Registration (Option B)** when:
- Queue is shared across multiple contexts
- Complex configuration (Redis connection, job options, etc.)
- Production deployment (centralized monitoring)

---

**Version**: 1.0
**Created**: 2026-01-04
**Status**: PRODUCTION
**Primary Users**: infrastructure-testing-implementer, domain-application-implementer
**Maintained By**: @technical-architecture-lead
