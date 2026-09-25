# BullMQ Queue Pattern

**Tags**: "api:events:queue"

**Layer**: Architecture

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
6. **Registry Dispatch (Faza 2)** - for a physical queue shared by MANY job kinds
   (`events.critical`, `events.default`, `events.external-io`, `work.serial`), a single
   `@Processor` dispatches to the right `IJobHandler` via `JobHandlerRegistryService`,
   keyed by `job.name` — see "Registry Dispatch Pattern" below. This is the canonical
   choice for any NEW queue expected to carry more than one job kind; single-purpose
   dedicated queues (Option A/B below) remain correct for a genuinely 1:1 producer→consumer
   relationship (e.g. `GDPR_ERASURE`, `WORK_HEAVY`).

**Key Benefits**:
- Type safety at compile time
- Consistent error handling (handlers log, processors throw for retry)
- Centralized queue configuration
- Easy to audit all queues (grep for `QueueName`)
- Registry dispatch: N job kinds share ONE physical queue's connection/worker-pool cost
  without forcing a single processor class to import across every bounded context

## 🔧 Implementation

### Queue Injection Pattern (Producer, single-purpose dedicated queue)

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QueueName, type GdprErasureJobData } from '@shared/infrastructure/queues/queue.types';

@Injectable()
export class YourHandler {
  constructor(
    // ✅ CORRECT: Use enum + typed Queue — GDPR_ERASURE is a genuinely single-purpose
    // dedicated queue (1:1 producer→consumer), the right fit for Option A/B below.
    @InjectQueue(QueueName.GDPR_ERASURE)
    protected readonly erasureQueue: Queue<GdprErasureJobData>,
  ) {}
}
```

**Reference**: `/src/shared/infrastructure/queues/processors/gdpr-erasure.processor.ts`

### Module Registration Pattern (single-purpose dedicated queue)

**Option A: Local Registration (context-specific queue)** — use only when the queue is
consumed by a single processor in a single context, `registerQueue()` in that context's
own module. **Option B: Centralized Registration (shared queues in `BullQueueModule`)** —
the actual convention in this codebase: every queue (dedicated or class-of-work) is
registered once, centrally, in `src/shared/infrastructure/queues/bull.module.ts`, and
consuming modules provide only their processor/handler class. See that file for the current
list of registered queues and their `defaultJobOptions`.

---

### Registry Dispatch Pattern (Faza 2 — shared "class of work" queues)

**TS-ARCH-BULLMQ-QUEUE-CONSOLIDATION-001 (2026-09-14).** Before this task, every job kind got
its own dedicated `QueueName` + `@Processor` (41 queues at peak — see "Problem" below). That
does not scale: each queue carries a fixed Redis cost (stalled-check polling, lock renewal,
idle long-poll) independent of its actual traffic. The fix is NOT one shared processor with a
giant `switch` (that would force it to import every bounded context, violating the project's
hard "never import across contexts" rule) — it is a **runtime registry**, the same shape
already proven by `acl-registry-pattern.md` for synchronous cross-context calls, applied here
to asynchronous job dispatch.

**Mechanism**:
1. A physical queue (`events.critical` / `events.default` / `events.external-io` /
   `work.serial`) has exactly ONE `@Processor` — a thin "dispatch processor" that does nothing
   but `registry.getRequired(job.name).process(job)`.
2. Every job KIND that used to have its own dedicated `@Processor` becomes a plain
   `@Injectable()` implementing `IJobHandler` — same class, same `process()` BODY (business
   logic untouched), just without the `@Processor`/`extends WorkerHost` shell.
3. Each handler registers itself under a stable routing key in its own `onModuleInit()` — no
   module needs to know about any other module's handlers.

**Routing key convention** (BullMQ `job.name`, the registry lookup key):
- Integration-event fan-out targets: `` `int:${contextName}` `` (e.g. `'int:geographic-auth'`)
  — set by `IntegrationEventFanOutService.fanOut()`, never by the handler itself. The
  per-context handler still switches internally on `job.data.eventName` — unchanged from
  before this refactor.
- Every other job producer: the PRE-consolidation `QueueName` string value it already had
  (e.g. `'mod-thread'`, `'cache-invalidation'`, `'vouch-review-timeout'`) — already unique by
  construction (it was an enum), so reusing it costs nothing and keeps old dashboards/log
  greps for that string working unchanged. Where ONE physical producer already had multiple
  job names for the same handler (e.g. `'email-verification'` / `'welcome-email'` / … all
  routing to `EmailNotificationsQueueProcessor`), register the SAME handler under EVERY name
  it needs — `JobHandlerRegistryService.register()` accepts any number of calls, one per key.

```typescript
// src/shared/infrastructure/queues/job-handler-registry/job-handler.interface.ts
export interface IJobHandler<T = unknown> {
  process(job: Job<T>): Promise<void>;
  /** OPTIONAL — forwarded from the dispatch processor's own onFailed() override. */
  onFailed?(job: Job<T>, error: Error): void | Promise<void>;
}

// src/shared/infrastructure/queues/job-handler-registry/job-handler-registry.service.ts
@Injectable()
export class JobHandlerRegistryService {
  private readonly handlers = new Map<string, IJobHandler>();

  register(routingKey: string, handler: IJobHandler): void {
    if (this.handlers.has(routingKey)) throw JobHandlerRegistryError.duplicateRegistration(routingKey);
    this.handlers.set(routingKey, handler);
  }

  // Fail-fast, mirrors aclRegistry.getGlobalRequired() — never a silent undefined.
  // Used by processJob() — an unknown job.name here SHOULD surface as a thrown
  // error (BullMQ's normal retry/DLQ path is designed to catch it).
  getRequired(routingKey: string): IJobHandler {
    const handler = this.handlers.get(routingKey);
    if (!handler) throw JobHandlerRegistryError.handlerNotFound(routingKey);
    return handler;
  }

  // Non-throwing variant — MANDATORY inside a @OnWorkerEvent('failed') listener
  // (see onFailed() below). That listener has no retry/DLQ path of its own to
  // catch a throw; onFailed is inherently best-effort (the job already
  // exhausted its real retry budget by the time this fires), so a missing
  // handler must degrade to "log and continue", never crash the listener.
  get(routingKey: string): IJobHandler | undefined {
    return this.handlers.get(routingKey);
  }
}

// src/shared/infrastructure/queues/processors/events-default.processor.ts — the ONLY
// @Processor for this physical queue.
@Processor(QueueName.EVENTS_DEFAULT, { concurrency: 20 })
export class EventsDefaultProcessor extends BaseQueueProcessor<unknown> {
  constructor(
    @Inject(JobHandlerRegistryService) private readonly registry: JobHandlerRegistryService,
    @Inject(LOGGER_SERVICE) logger: ILoggerService
  ) {
    super(logger, QueueName.EVENTS_DEFAULT);
  }
  protected async processJob(job: Job<unknown>): Promise<void> {
    await this.registry.getRequired(job.name).process(job);
  }
  // ⚠️ @OnWorkerEvent('failed') IS MANDATORY here, not optional decoration.
  // @nestjs/bullmq's BullExplorer wires Worker listeners ONLY off this
  // decorator's metadata (see node_modules/@nestjs/bullmq/dist/bull.explorer.js)
  // — an `override async onFailed()` with no decorator compiles fine, correctly
  // overrides the base class method, and is simply NEVER CALLED by BullMQ. This
  // is exactly how TokenEconomyIntegrationProcessor's FINANCIAL_RECONCILIATION_REQUIRED
  // alert (BR-TOKEN-RECONCILE-001) went silently dark during this pattern's
  // first rollout (2026-09-14 final-gate VETO, DREAD 13) — caught by review, not
  // by any test, because the method still "looks" wired from reading the code.
  //
  // BullMQ 'failed' fires per-queue (per Worker), not per-handler — this is why
  // forwarding to the specific handler's own onFailed() (e.g. a
  // financial-reconciliation alert) is necessary at all: BullMQ has no way to
  // call a specific IJobHandler's onFailed directly.
  @OnWorkerEvent('failed')
  override async onFailed(job: Job<unknown>, error: Error): Promise<void> {
    await super.onFailed(job, error);
    // registry.get() (non-throwing) — NEVER getRequired() here, see get()'s own
    // doc comment above for why.
    try {
      await this.registry.get(job.name)?.onFailed?.(job, error);
    } catch (forwardError) {
      this.logger.warn('Handler onFailed() threw — swallowed, Worker listener must not crash', {
        jobName: job.name,
        error: forwardError instanceof Error ? forwardError.message : String(forwardError),
      });
    }
  }
}

// A former dedicated-queue consumer, converted — business logic below is UNCHANGED,
// only the shell (no more @Processor/extends WorkerHost) and self-registration are new.
@Injectable()
export class JobRequestModerationConsumer implements IJobHandler<ContentModerationJobData>, OnModuleInit {
  constructor(
    @Inject(JobHandlerRegistryService) private readonly registry: JobHandlerRegistryService,
    // ...existing dependencies, unchanged
  ) {}

  onModuleInit(): void {
    this.registry.register('mod-job-req', this); // pre-consolidation QueueName value
  }

  async process(job: Job<ContentModerationJobData>): Promise<void> {
    // ...existing moderation logic, byte-for-byte unchanged from the old processJob()
  }
}
```

**MUST (registry dispatch)**:
- **RD1** — every `@Inject()`-eligible constructor parameter, INCLUDING `JobHandlerRegistryService`,
  gets an explicit `@Inject(JobHandlerRegistryService)` — omitting it is a real DI-wiring failure
  in this codebase, not a style nit (confirmed regression during this task's own rollout: 41
  converted files initially missing it).
- **RD2** — registration happens in `onModuleInit()`, never in the constructor (module
  initialization order is not guaranteed at construction time — same rule ACL registry
  registration already follows).
- **RD3** — routing-key collisions must throw at registration time (`JobHandlerRegistryError
  .duplicateRegistration`), never silently overwrite — a silent overwrite means one handler's
  jobs silently start routing to a different handler.
- **RD4** — a missing handler for a dequeued `job.name` must throw (`JobHandlerRegistryError
  .handlerNotFound`), letting BullMQ's normal retry/DLQ machinery surface the wiring bug,
  never resolve silently.
- **RD5** — the dispatch processor (`EventsDefaultProcessor` etc.) NEVER imports a converted
  handler class directly — that would defeat the entire purpose (no cross-context imports).
  It only depends on `JobHandlerRegistryService`.
- **RD6** — every dispatch processor's `onFailed()` override MUST carry an explicit
  `@OnWorkerEvent('failed')` decorator — `@nestjs/bullmq` wires Worker listeners off that
  decorator's metadata exclusively, so a plain `override async onFailed()` compiles, "looks"
  correct on review, and is simply never invoked. Inside it, use `registry.get()` (non-throwing),
  never `getRequired()` — a `'failed'` listener has no retry/DLQ path to catch a throw, unlike
  `processJob()`. Confirmed regression class (2026-09-14 final-gate VETO, DREAD 13): converting
  `TokenEconomyIntegrationProcessor` from its own `@OnWorkerEvent('failed')`-decorated method to
  an `IJobHandler.onFailed()` forwarded through an undecorated dispatch-processor override
  silently dropped its `FINANCIAL_RECONCILIATION_REQUIRED` alert.

**When to use registry dispatch vs. a dedicated queue**: if a NEW job kind can reasonably
share retry/concurrency semantics with an existing class of work (see `queue.types.ts`'s
5-class taxonomy), register it there. Reach for a brand-new dedicated `QueueName` only when
retention/compliance semantics are genuinely unique (e.g. `GDPR_ERASURE`'s `removeOnFail:
false` legal-audit retention) — see `queue.types.ts`'s own enum-level doc comment for the
current list of deliberately-unconsolidated queues and why.

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

### MUST (Consumer-Helper Handler — called from Processor)

> **Definition**: A handler class called from within `processor.process()` (not a processor itself,
> not a domain event producer). Examples: `UserDisplayNameUpdatedHandler`, `UserRegisteredHandler`
> invoked from `EngagementIntegrationProcessor.process()`.

15. **ALWAYS throw on `result.isFailure`** — the processor wraps every handler call in
    `try/catch` + `throw error` (see `engagement-integration.processor.ts:182`). If the handler
    swallows `Result.fail()` with `return`, the processor sees a resolved Promise → BullMQ marks
    the job as **completed** → **no retry**. The user sees stale data with no explanation.

16. **ALWAYS throw on infrastructure errors** — wrap `commandBus.execute()` in `try/catch` and
    re-throw. Infrastructure errors (DB timeout, connection lost) are transient; retry WILL help.

17. **ONLY return (no throw) for explicitly expected absence** — the one valid exception is when
    a `Result.fail()` error code signals an intentional no-op (e.g.
    `D_ORG_USER_READ_MODEL_NOT_FOUND` = user is not an org member, not an error). This MUST be
    documented inline.

**Correct pattern for Consumer-Helper Handler:**

```typescript
async handle(event: SomeIntegrationEvent): Promise<void> {
  const command = new SomeCommand(event.userId, ...);

  let result: Result<void>;
  try {
    result = await this.commandBus.execute<SomeCommand, Result<void>>(command);
  } catch (err) {
    // Infrastructure error (DB, network) — processor will re-throw → BullMQ retry
    this.logger.error('Infrastructure error syncing projection', {
      userId: event.userId,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  if (result.isFailure) {
    // OPTIONAL EXCEPTION: explicitly expected absence (document inline)
    // if ((result.error as any)?.code === 'D_CONTEXT_NOT_FOUND') { return; }

    this.logger.error('Projection sync failed', {
      userId: event.userId,
      errorCode: (result.error as any)?.code ?? result.error.constructor.name,
    });
    throw result.error; // processor re-throws → BullMQ retry
  }
}
```

**Why this matters**: a Producer handler (rule 4 above) is called in-process during a user
request — throwing crashes the user's operation. A Consumer-Helper is called from a BullMQ
worker process — throwing is the *only* signal BullMQ has that the job failed.

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
7. **NEVER wrap `commandBus.execute()` in `safeRun()`** — `safeRun` only catches thrown exceptions. `BaseCommandHandler.execute()` returns `Result.fail()` on error (does NOT throw). Using `safeRun` means a DB failure returns `Result.fail` silently — BullMQ never retries → silent GDPR Art.17 erasure failure (confirmed bug TS-GDPR-004). Always check `result.isFailure` explicitly.

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

### ❌ WRONG: safeRun wrapping commandBus.execute() — silent GDPR failure

```typescript
// safeRun only catches THROWN exceptions.
// BaseCommandHandler.execute() returns Result.fail() — it does NOT throw.
// error is always undefined → BullMQ never retries → Art.17 erasure silently fails.
const [error] = await safeRun(() => this.commandBus.execute(command));
if (error) {
  throw error; // ← never reached on Result.fail
}
```

### ✅ CORRECT: Check result.isFailure after commandBus.execute()

```typescript
// ICommandBus.execute() returns Result<void> by default → specify generic explicitly.
const result = await this.commandBus.execute<MyCommand, Result<void>>(command);
if (result.isFailure) {
  this.logger.error('Handler failed', { userId, error: result.error.message });
  throw result.error; // BullMQ retry
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
    BullModule.registerQueue({ name: QueueName.GDPR_ERASURE }),  // ✅ Enum
  ],
})
export class EngagementModule {}
```

### ❌ WRONG: Local `registerQueue()` for a globally-registered queue

```typescript
// WRONG — queue is already in BullQueueModule with registerQueueAsync + Redis connection
@Module({
  imports: [
    BullModule.registerQueue({ name: QueueName.DISCORD_NOTIFICATIONS }),  // ❌ No connection!
  ],
})
export class DiscordModule {}
```

**Why this crashes**: `BullModule.registerQueueAsync()` in `BullQueueModule` registers the queue with a Redis connection. When a module later calls `BullModule.registerQueue()` for the same name without connection options, NestJS's `BullExplorer.getQueueOptions()` uses `moduleRef.get(token, { strict: false })` globally — **last registration wins**. The local registration without a connection overrides the global one. Result: BullMQ Worker starts with `opts.connection = undefined` → throws `"Worker requires a connection"` on startup.

### ✅ CORRECT: Bare `BullModule` import for globally-registered queues

```typescript
// CORRECT — bare import lets @InjectQueue() work without re-registering
@Module({
  imports: [
    BullModule,  // ✅ Just bare BullModule — no registerQueue()
  ],
})
export class DiscordModule {}
```

**Rule**: If the queue is registered in the global `BullQueueModule` (via `registerQueueAsync`), consuming modules MUST import bare `BullModule` only. Never call `registerQueue()` or `registerQueueAsync()` for that queue again.

## 📚 References

### Implementation Files

- **Good Example (Producer, dedicated queue)**: `/src/shared/infrastructure/queues/processors/gdpr-erasure.processor.ts`
- **Good Example (Registry dispatch)**: `/src/shared/infrastructure/queues/processors/events-default.processor.ts` +
  `/src/contexts/neighborhood-economy/infrastructure/quick-jobs/consumers/job-request-moderation.consumer.ts`
- **Registry**: `/src/shared/infrastructure/queues/job-handler-registry/job-handler-registry.service.ts`
- **Queue Types**: `/src/shared/infrastructure/queues/queue.types.ts`
- **Centralized Config**: `/src/shared/infrastructure/queues/bull.module.ts`

### Related Patterns

- **transactional-pattern.md** - @Transactional works with queued events
- **repository-events-pattern.md** - Domain events can trigger queue jobs
- **dual-identity-pattern.md** - userId extraction applies to job data

### ADRs

- None directly, but follows NestJS best practices for BullMQ integration

## When to Use 🎯

### Always Use BullMQ Queue Pattern When:

1. **Async processing needed** - Job takes >100ms, should not block request
2. **Retry logic required** - Operation may fail and needs automatic retry
3. **Background jobs** - Email sending, notifications, batch processing
4. **Rate limiting** - Process jobs at controlled rate
5. **Distributed processing** - Multiple workers can process same queue
6. **MVCC visibility delay** - 200ms delay for FK constraints (integration events)

### Examples in Project:

- **Audit Logging** - Async audit log writing, routing key `'auth-audit'` on `QueueName.WORK_SERIAL`
  (concurrency: 1, see `WorkSerialProcessor`)
- **Content Moderation** - Async moderation with L0/L1/L2 strategy, 8 routing keys (`'mod-job-req'`,
  `'mod-thread'`, ...) on `QueueName.EVENTS_DEFAULT` — registry dispatch (Faza 2)
- **Integration Events** - Cross-context fan-out, routing keys `` `int:${contextName}` `` split across
  `QueueName.EVENTS_CRITICAL` (6 Tier O-1/O-2 events) and `QueueName.EVENTS_DEFAULT` (everything else)
  — see `IntegrationEventFanOutService` and "Registry Dispatch Pattern" above

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

**Version**: 2.0 — Registry Dispatch Pattern added (TS-ARCH-BULLMQ-QUEUE-CONSOLIDATION-001 Faza 2), dead `QueueName.CONTENT_MODERATION`/`INTEGRATION_EVENTS` references removed
**Created**: 2026-01-04
**Status**: PRODUCTION
**Primary Users**: infrastructure-implementer, test-implementer, domain-application-implementer
**Maintained By**: @backend-technology-expert
