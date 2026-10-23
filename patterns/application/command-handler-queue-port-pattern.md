# Pattern: Command Handler Queue Port

**Tags**: "api:events:queue", "api:app"
**Layer**: Application
**Level**: core
**Status**: experimental

## What This Is

A command or query handler never touches BullMQ. It depends on a small port (a `Symbol` plus an
interface declared next to the handler in `application/`), and the module or `infrastructure/`
binds that port to a BullMQ queue — or to the outbox when the job depends on this transaction.
Queue naming, typed job data and processors stay as in `bullmq-queue-pattern.md`.

## When to Use

**Use this pattern for:**
- ✅ A `*.handler.ts` under `application/commands|queries/` has to enqueue a job (SMS, e-mail, projection chunk, delayed review).
- ✅ You are about to write `@InjectQueue(...)`, `import ... from 'bullmq'` or `'@nestjs/bullmq'` in a command/query handler — declare a port instead.
- ✅ The handler must stay constructible in a unit test without a Redis-backed queue.

**Do NOT use for:**
- ❌ Event handlers and services that produce jobs — they follow `bullmq-queue-pattern.md` (typed `Queue<T>` + `QueueName`). A handler of an in-process DOMAIN event additionally writes to the outbox instead of calling `queue.add` (`transactional-outbox-pattern`, OB1/N1).
- ❌ BullMQ processors / consumers in `infrastructure/` — they live next to the queue; a rethrow there is how BullMQ retries (BQ9).

## Implementation

### 1. Port — next to the handler, in `application/`

```typescript
// application/commands/recompute-facet-projection/queue.port.ts
export const FACET_PROJECTION_RECOMPUTE_QUEUE = Symbol('FACET_PROJECTION_RECOMPUTE_QUEUE');

export interface FacetProjectionRecomputeJobData {
  userIds: string[];
  mode: ProjectionRecomputeMode;
}

export interface IFacetProjectionRecomputeQueue {
  add(
    jobName: string,
    data: FacetProjectionRecomputeJobData,
    opts?: { jobId?: string }
  ): Promise<unknown>;
}
```

The port speaks the language of the use case (job name + typed payload). It exposes no `Queue`,
`JobsOptions` or `Job` — otherwise it cannot be bound to the outbox later.

### 2. Handler — depends on the port only

```typescript
constructor(
  @Inject(LOGGER_SERVICE) logger: ILoggerService,
  @Inject(RequestContextService) requestContext: RequestContextService,
  @Inject(REDACTION_SERVICE) redactionService: RedactionService,
  @Inject(BEHAVIOR_SIGNAL_REPOSITORY)
  private readonly behaviorSignalRepository: IBehaviorSignalRepository,
  @Inject(FACET_PROJECTION_RECOMPUTE_QUEUE)
  private readonly recomputeQueue: IFacetProjectionRecomputeQueue
) {
  super(logger, requestContext, redactionService);
}
```

`executeBusinessLogic()` still returns `Result` and never throws (CH5). A failed `add()` is
handled explicitly: `Result.fail(...)`, or best-effort with a log line when the job is
idempotent and the next scheduled run heals the gap (the reputation handler does the latter).

### 3. Binding — module / infrastructure, the only place that knows BullMQ

```typescript
// reputation.module.ts
{
  provide: FACET_PROJECTION_RECOMPUTE_QUEUE,
  useFactory: (queue: IFacetProjectionRecomputeQueue) => queue,
  inject: [getQueueToken(QueueName.WORK_HEAVY)],
},
```

### 4. When the job depends on this transaction — bind the port to the outbox

A command handler runs inside `@Transactional` (CH8). `queue.add` inside it is not atomic with
the commit: the job survives a rollback, and a fast worker can run before the commit and read
state that is not there yet. If the job reads what this handler just wrote, or must not exist
when the command fails, the adapter behind the port writes an outbox row instead:

```typescript
// infrastructure/queues/sms-otp-delivery-queue.adapter.ts
@Injectable()
export class SmsOtpDeliveryOutboxAdapter implements ISmsOtpDeliveryQueue {
  constructor(@Inject(OUTBOX_SERVICE) private readonly outbox: IOutboxService) {}

  async add(jobName: string, data: SmsOtpDeliveryJobData): Promise<void> {
    // Same transaction as the handler's writes; the outbox poller enqueues AFTER commit.
    await this.outbox.saveMessage(jobName, data);
  }
}
```

The handler code does not change; only the binding does. Choose the adapter with one question:
"does the job need what this transaction writes, or must it vanish on rollback?" Yes → outbox.
No (a coordinator scheduling independent work) → direct BullMQ binding.

### 5. Check the write before enqueueing

```typescript
const saved = await this.repository.save(aggregate);
if (saved.isFailure) return Result.fail(saved.error);
await this.otpQueue.add('deliver-otp', { /* ... */ }); // only after a successful save
```

## Anti-Patterns

- **`@InjectQueue(QueueName.X)` in a command/query handler constructor.** The application layer now depends on BullMQ and Redis, the handler cannot be unit-tested without them, and the shape gets copied into the next handler. Note: `cross-context-communication.md` used to show exactly this in its producer template.
- **`queue.add` in `executeBusinessLogic` for a job that reads this handler's own write.** The worker can win the race against the commit, or the job outlives a rollback. In TS-SEC-D0-BETA-HARDENING-001 (api-1) `register-with-phone` enqueued the SMS before the commit and ignored the `Result` of `save`, while the delivery processor deleted a Redis key that `verify-phone-registration` still read.
- **Enqueue first, `save` second, `Result` of `save` ignored.** The job is already out when the write fails.
- **A justification in a comment instead of the rule.** "The handler does not write to the database, so enqueueing here is fine" is a claim to verify in the code, not a reason to skip the port. The analysis for that task carried this sentence while the handler saved a user.
- **Leaking BullMQ types through the port** (`Queue`, `JobsOptions`, `Job`): the port can no longer be bound to the outbox.
