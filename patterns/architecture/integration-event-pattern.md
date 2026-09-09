# Integration Event Pattern

**Tags**: "api:events:integration", "api:events:outbox"

**Layer**: Architecture
**Status**: production
**Level**: exhaustive
**Assumes**: ddd/core   <!-- wzorzec operuje pojęciami modelu domenowego -->

**Purpose**: Cross-bounded-context communication using real Project production patterns
**Audience**: domain-application-implementer, infrastructure-testing-implementer
**Philosophy**: Code + concise rules, NO verbose explanations
**Reference**: ADR-0025 (Hybrid Event System - Tier 2), **ADR-0082 (Outbox Classification
Criteria)**, `transactional-outbox-pattern.md`

> **Revised 2026-08-10 — the outbox is now the ONLY sanctioned transport.**
> What changed: the former "Pattern 1 (RECOMMENDED)" and "Pattern 3 (SIMPLIFIED - MVP)" both
> published via `eventDispatcher.dispatchEvent()`. Both are now documented as anti-patterns.
> This doc previously contradicted ADR-0082 (which mandates the outbox for O-1/O-2) and the
> `integration-event-fan-out-routing-contract` guardian (which treats a missing route as a bug);
> three sources of truth gave three different answers, and that ambiguity is the root cause of
> a 22-handler silent-loss finding (TS-INTEGRATION-EVENT-WIRING-AUDIT-001, 2026-08-09).
>
>
> **2026-09-07**: the long `ContextTrustDeltaIntegrationEvent` worked example (built on the deleted
> `trust` context) was removed rather than left as a live-looking reference — see git history at
> `c4e12c4`.

---

## When to Use

**Use this pattern for:**
- ✅ a fact one bounded context must tell another about — user registered, payment completed, role changed
- ✅ anything that must survive a process restart or reach a consumer living in a different process (API ↔ worker)
- ✅ messages carrying pseudonymised identifiers that still need a declared legal basis and retention period
- ✅ deciding the ADR-0082 tier (O-1..O-4) of a cross-context message, which sets review depth and whether an L2 delivery test is mandatory

**Do NOT use for:**
- ❌ anything inside one bounded context — that is a domain event (`domain-event-pattern.md`); an integration event never fires within its own context
- ❌ background work whose consumer lives in the producing context (moderation, notifications) — plain BullMQ, see `bullmq-queue-pattern.md`
- ❌ the outbox table, poller and CLS transaction mechanics themselves — that is `transactional-outbox-pattern.md`
- ❌ synchronous cross-context reads where the caller needs an answer — that is the ACL registry (`acl-registry-pattern.md`), not an event

---

## 🎯 Problem

Bounded contexts hold independent views of the same subject, and something has to reconcile them —
one context computes a score from location verification, another from content quality, a third
needs the global sum. Doing that by import couples the contexts; doing it by shared table couples
their schemas.

What makes this hard is not the messaging, it is what leaks along with it:

- complex domain types in the payload recreate the coupling the boundary existed to prevent
- personal data crosses a boundary with no declared legal basis or retention
- no correlation id, so a cross-context failure cannot be traced back to its cause
- delivery that is not atomic with the producer's write loses events on crash — invisibly

## ✅ Solution

An integration event is a deliberately impoverished message: primitive-only payload, an explicit
`GDPRIntegrationContext` (containsPII, legalBasis, retention, purpose), a `SecurityIntegrationContext`
(deduplication, encryption, security level), correlation/causation metadata, a static dot-notation
`EVENT_NAME`, and a `fromPayload()` factory so a consumer can rebuild it from job data. It is
written to the outbox in the producer's transaction and delivered by the poller after commit —
never dispatched in-process.

---

> **Removed 2026-09-07**: the long worked example that used to sit here
> (`ContextTrustDeltaIntegrationEvent`, BR-TRUST-DELTA-001) was built on the `trust` bounded
> context, deleted in `TS-TRUST-BC-FULL-REMOVAL-001` and replaced by `reputation` (ADR-0094). Its
> mechanics were correct, but it read as a live reference to code that no longer exists. The full
> 237-line original is in git history at `c4e12c4`.

---

## ProjectIntegrationEvent Base Class

**Location**: `src/shared/domain/integration-events/base/project-integration-event.ts`

```typescript
export abstract class ProjectIntegrationEvent {
  public readonly eventId: string;                              // UUID, per emission
  public readonly eventName: string;                            // dot-notation routing key
  public readonly payload: Record<string, unknown>;             // primitives ONLY
  public readonly sourceContext: string;                        // origin bounded context
  public readonly gdprContext: GDPRIntegrationContext;
  public readonly securityContext: SecurityIntegrationContext;
  public readonly integrationMetadata: IntegrationEventMetadata; // correlation, causation, occurredAt

  protected constructor(
    eventName: string,
    payload: Record<string, unknown>,
    sourceContext: string,
    gdprContext: GDPRIntegrationContext,
    securityContext: SecurityIntegrationContext,
    metadata: { correlationId?: string; causationId?: string; occurredAt?: Date },
  ) {
    this.eventId = randomUUID();
    this.eventName = eventName;
    this.payload = payload;
    this.sourceContext = sourceContext;
    this.gdprContext = gdprContext;
    this.securityContext = securityContext;
    this.integrationMetadata = {
      correlationId: metadata.correlationId ?? randomUUID(),
      causationId: metadata.causationId,
      occurredAt: metadata.occurredAt ?? new Date(),
    };
  }

  /**
   * Integration events carry pseudonymised ids (userId, aggregateId) — never email, phone,
   * name or address. Hash anything sensitive that must travel (ipAddressHash).
   * Declaring `containsPII: true` without `encryptionRequired: true` is a contradiction,
   * so this throws rather than returning false: a silent `false` gets logged and ignored.
   */
  public validateNoPII(): boolean {
    if (!this.gdprContext.containsPII) return true;
    if (this.securityContext.encryptionRequired) return true;
    throw new Error(
      `Integration event ${this.eventName} contains PII but encryption not required. ` +
      `Either remove PII or set encryptionRequired: true.`,
    );
  }
}
```

---
## Integration Event Types

**Location**: `src/shared/domain/integration-events/types/integration-event.types.ts`

```typescript
export interface GDPRIntegrationContext {
  containsPII: boolean;
  legalBasis:                       // GDPR Art. 6
    | 'consent' | 'contract' | 'legal_obligation'
    | 'vital_interests' | 'public_task' | 'legitimate_interest';
  retentionPeriod: number;          // days
  processingPurpose: string;
}

export interface SecurityIntegrationContext {
  issuedBy: string;                 // bounded context that emitted it
  requiresDeduplication: boolean;   // honoured by the outbox, ignored by dispatchEvent
  securityLevel: 'public' | 'internal' | 'confidential' | 'restricted';
  encryptionRequired: boolean;
}

export interface IntegrationEventMetadata {
  correlationId: string;            // traces one request across contexts
  causationId?: string;             // the event that caused this one
  occurredAt: Date;
}
```
```

---

## 🚨 Event Emission Pattern - WHERE to Emit

**CRITICAL**: Integration events are emitted by **HANDLERS or SERVICES**, NEVER by aggregates.

### Pattern 1: Domain Event Handler → Outbox → Integration Event (CANONICAL)

**When to use**: ALWAYS, for every cross-bounded-context integration event.

**Flow**:
```
Aggregate → Domain Event → Domain Event Handler → outbox row (SAME transaction)
   → [COMMIT] → OutboxPoller → IntegrationEventFanOutService.fanOut()
   → per-context queue → @Processor → commandBus
```

**Example**: Job completion fan-out

```typescript
```typescript
// 1. The aggregate emits a DOMAIN event — it never knows about integration events.
//    (shape: aggregate-pattern.md, domain-event-pattern.md)

// 2. A domain event handler writes the OUTBOX row — same transaction, zero external I/O.
@EventHandler(JobCompletedEvent)
export class JobCompletedIntegrationEmitterHandler {
  constructor(@Inject(OUTBOX_SERVICE) private readonly outbox: IOutboxService) {}

  async handle(event: JobCompletedEvent): Promise<void> {
    const jobData: IntegrationEventJobData = {
      eventName: JobCompletedIntegrationEvent.EVENT_NAME, // never a string literal
      payload: {
        jobId: event.getJobId(),
        requesterId: event.getRequesterId(),
        providerId: event.getProviderId(),
      },
      sourceContext: 'neighborhood-economy',
      correlationId: event.metadata?.correlationId ?? event.eventId,
      timestamp: new Date(),
    };

    // ✅ Commits atomically with the aggregate. The poller fans out AFTER commit.
    await this.outbox.saveMessage(JobCompletedIntegrationEvent.EVENT_NAME, jobData);
  }
}
```

The CLS transaction propagation that makes this write atomic, the step-by-step migration of an
existing handler, and the rollback-survival taxonomy live in
[`transactional-outbox-pattern.md`](./transactional-outbox-pattern.md) — that is the outbox's own
pattern; this section only shows where an integration event enters it.

**Real example**: `src/contexts/neighborhood-economy/application/quick-jobs/event-handlers/job-completed-integration-emitter.handler.ts`

**Every integration event published this way MUST have a matching `routingTable` entry
AND a `case` in the target context's processor.** Missing either one is a silent-loss bug,
not a cosmetic gap — see "Silent loss" below. The guardian test
`integration-event-fan-out-routing-contract.spec.ts` enforces both directions.

---

### ❌ ANTI-PATTERN: `eventDispatcher.dispatchEvent()` for an integration event

This was documented as "Pattern 1 RECOMMENDED" until 2026-08-10. It is now an anti-pattern.
Direct in-process dispatch is what the outbox exists to replace.

```typescript
// ❌ WRONG — in-process, synchronous, no atomicity, no retry
@EventHandler(SomeDomainEvent)
export class SomeEmitterHandler {
  constructor(
    @Inject(UNIVERSAL_EVENT_DISPATCHER_TOKEN)
    private readonly eventDispatcher: IEventDispatcher
  ) {}

  async handle(event: SomeDomainEvent): Promise<void> {
    await this.eventDispatcher.dispatchEvent(new SomeIntegrationEvent(/* ... */));
  }
}
```

**Why it is wrong** — the dispatcher resolves to ONE global `UnifiedEventBus` with no
per-context isolation, and it does not distinguish domain from integration events. So the
call *does* reach `@EventHandler`s in other bounded contexts, in-process and synchronously.
It looks like it works. What you actually get:

| | Outbox (Pattern 1) | `dispatchEvent` |
|---|---|---|
| Atomic with producer's write | yes — same transaction | no — shares caller's stack |
| Retry / DLQ | yes (BullMQ) | no — one attempt |
| Survives process restart | yes | no — dies with memory |
| Consumer failure | job FAILED → retry | **swallowed in the producer's try/catch** |
| Honors `requiresDeduplication` | yes | no |
| Crosses process boundary (API ↔ worker) | yes | **no** |

The last two rows are the ones that bite. A consumer that lives only in the worker process
never sees an event dispatched from the API process — and the producer logs success.

**Migrating an existing `dispatchEvent` call to the outbox is ATOMIC**: add the outbox write,
add the `routingTable` entry, add the processor `case`, and DELETE the `dispatchEvent` call —
all in one diff. Doing it in two steps causes **double processing**, because processors call
`commandBus` directly, bypassing the dispatcher entirely. Precedent: TS-ACL-001 (UNIQUE
violation from a duplicated role grant). Introduce consumer idempotency BEFORE the switch.

Adding only the `routingTable` entry and `case` — without touching the producer — is worse
than doing nothing: the guardian goes green, behavior is unchanged, and an armed dead `case`
sits there waiting for whoever adds the outbox write months later.

---

### Pattern 2: Domain Event Handler → BullMQ Job (ASYNC Processing)

**When to use**: background work that stays INSIDE the producing context — moderation, notification
fan-out, thumbnail generation. This is not an integration event at all: nothing crosses a context
boundary, so there is no outbox row and no routing entry.

```
Aggregate → Domain Event → Domain Event Handler → queue.add() → @Processor (same context)
```

The producer/consumer mechanics — typed job data, enum queue names, why the handler must catch and
the processor must throw, module registration — are in
[`bullmq-queue-pattern.md`](./bullmq-queue-pattern.md). The only rule that belongs here: if the
consumer lives in a **different** bounded context, this is the wrong pattern; use Pattern 1.

**Real example**: `src/contexts/engagement/application/event-handlers/moderate-comment.handler.ts`

---
### ❌ ANTI-PATTERN: Command Handler emits the integration event directly

Documented as "Pattern 3 (SIMPLIFIED - MVP)" until 2026-08-10. Removed — it has the dual-write
bug by construction.

```typescript
// ❌ WRONG
@CommandHandler(VerifyEmailCommand)
export class VerifyEmailHandler extends BaseCommandHandler {
  async executeBusinessLogic(command: VerifyEmailCommand): Promise<Result<void, Error>> {
    const user = await this.userRepository.findById(command.userId);
    const verifyResult = user.verifyEmail(command.token);
    if (verifyResult.isFailure) return Result.fail(verifyResult.error);

    await this.userRepository.save(user);

    // ❌ A crash between the COMMIT above and this line loses the event forever.
    await this.eventDispatcher.dispatchEvent(new EmailVerifiedIntegrationEvent(/* ... */));

    return Result.ok(undefined);
  }
}
```

The command handler runs `@Transactional`; publishing after `save()` puts the publish OUTSIDE
the aggregate's atomicity. That is precisely the dual-write problem. The integration event
belongs in a **domain event handler writing to the outbox** (Pattern 1) — the domain event is
already emitted by the aggregate inside the transaction, so the outbox row commits with it.

See `transactional-outbox-pattern.md` rules OB1–OB5.

---

### ❌ ANTI-PATTERN: Aggregate Emits Integration Event

```typescript
// ❌ WRONG: Aggregate emits integration event directly
export class UserAggregate extends AggregateRoot<string> {
  public register(email: Email): Result<void, Error> {
    // ... business logic ...

    // ❌ Integration event from aggregate - VIOLATES DDD!
    this.apply(new UserRegisteredIntegrationEvent({
      userId: this.id.value,
      email: email.toString(),
      occurredAt: new Date(),
    }));

    return Result.ok(undefined);
  }
}
```

**Why wrong**:
- Aggregates are **domain core** (business concepts)
- Integration events are **infrastructure** (cross-context communication)
- Violates **bounded context isolation**
- Makes aggregate dependent on infrastructure concerns

**Correct approach**: Use Pattern 1, 2, or 3 above.

---

## Emission and Consumption — where the code lives

Emission never happens in an aggregate and never happens through the dispatcher. A domain event
handler writes the outbox row (Pattern 1 above); the poller fans out after commit. Consumption
happens in the target context's `@Processor`, which switches on `eventName` and calls
`commandBus.execute()` — see "BullMQ Per-Context Consumer Pattern" below for both halves.

> The worked emitter/consumer pair that used to sit here (`TrustDeltaEmitterService` and an
> `@EventsHandler(ContextTrustDeltaIntegrationEvent)` consumer) was built on the deleted `trust`
> bounded context, and its consumer shape — an `@EventsHandler` on an integration event — is the
> pre-TS-INFRA-002 mechanism this pattern replaced. Removed 2026-09-07; read it in git history at
`c4e12c4` if you need the original wording.


## BullMQ Per-Context Consumer Pattern (TS-INFRA-002)

> **STATUS**: This is the CANONICAL pattern for integration event consumption as of TS-INFRA-002.
> The old `IntegrationEventsQueueProcessor` (single shared processor + eventDispatcher) has been
> REPLACED by per-context processors calling commandBus directly.

### Problem with the old pattern

A single shared `IntegrationEventsQueueProcessor` dispatched through `eventDispatcher`, which only
reaches `@EventHandler`-decorated classes — four contexts had none and were never called at all.
One retry also retried every context, so no context could fail independently. Both faults are
structural, which is why the replacement is per-context queues rather than a bug fix.

### New pattern: IntegrationEventFanOutService + Per-Context Processors

**Step 1 — Fan-out at emission point**

```typescript
// src/shared/infrastructure/queues/services/integration-event-fan-out.service.ts
@Injectable()
export class IntegrationEventFanOutService {
  constructor(
    @InjectQueue(QueueName.INTEGRATION_AUTHORIZATION) private readonly authQueue: Queue,
    @InjectQueue(QueueName.INTEGRATION_TRUST) private readonly trustQueue: Queue,
    @InjectQueue(QueueName.INTEGRATION_USER_PROFILE) private readonly userProfileQueue: Queue,
    @InjectQueue(QueueName.INTEGRATION_COMMUNITY_COMMUNICATION) private readonly ccQueue: Queue,
    @InjectQueue(QueueName.INTEGRATION_NEIGHBORHOOD_ECONOMY) private readonly neQueue: Queue,
    @InjectQueue(QueueName.INTEGRATION_ENGAGEMENT) private readonly engQueue: Queue,
    @InjectQueue(QueueName.INTEGRATION_GEOGRAPHIC_AUTH) private readonly geoQueue: Queue,
  ) {}

  async fanOut(jobData: IntegrationEventJobData): Promise<void> {
    const { eventName, correlationId } = jobData;
    const jobOpts = {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnFail: 200,
    };

    // ⚠️ KRYTYCZNE: klucze MUSZĄ używać ClassName.EVENT_NAME (dot-notation)
    // NIE 'ClassName' jako string — to powoduje routingTable[undefined] = [] (cicha utrata eventu)
    // Patrz incydent 2026-06-04 + TS-INFRA-EVENT-NAMES-001
    const routingTable: Record<string, Queue[]> = {
      [UserRegisteredIntegrationEvent.EVENT_NAME]: [this.trustQueue, this.userProfileQueue, this.ccQueue, this.neQueue, this.engQueue, this.geoQueue],
      [EmailVerifiedIntegrationEvent.EVENT_NAME]: [this.authQueue],
      [UserDisplayNameUpdatedIntegrationEvent.EVENT_NAME]: [this.ccQueue, this.neQueue, this.engQueue, this.geoQueue],
      [UserProfileUpdatedIntegrationEvent.EVENT_NAME]: [this.ccQueue, this.neQueue, this.engQueue, this.geoQueue],
      [UserRoleChangedIntegrationEvent.EVENT_NAME]: [this.ccQueue, this.neQueue, this.engQueue, this.geoQueue],
      [UserTrustScoreUpdatedIntegrationEvent.EVENT_NAME]: [this.authQueue, this.userProfileQueue],
      [TrustScoreUpdateRequestedIntegrationEvent.EVENT_NAME]: [this.trustQueue],
      [ModerationSuspensionRequestedIntegrationEvent.EVENT_NAME]: [this.trustQueue],
      [PaymentCompletedIntegrationEvent.EVENT_NAME]: [this.ccQueue, this.neQueue, this.engQueue],
      [ClubSubscriptionActivatedIntegrationEvent.EVENT_NAME]: [this.ccQueue, this.neQueue],
      [ClubSubscriptionExpiredIntegrationEvent.EVENT_NAME]: [this.ccQueue],
      [ClubSubscriptionFinallyExpiredIntegrationEvent.EVENT_NAME]: [this.ccQueue],
    } satisfies Partial<Record<IntegrationEventRoutingKey, Queue[]>>;

    const targetQueues = routingTable[eventName] ?? [];
    for (const queue of targetQueues) {
      const contextName = queue.name.replace('integration-', '');
      await queue.add(eventName, jobData, {
        ...jobOpts,
        jobId: `${eventName}:${correlationId}:${contextName}`, // idempotency
      });
    }
  }
}
```

**Step 2 — Per-context processor (switch on eventName)**

```typescript
// src/contexts/geographic-auth/infrastructure/queues/geo-auth-integration.processor.ts
@Injectable()
@Processor(QueueName.INTEGRATION_GEOGRAPHIC_AUTH)
export class GeoAuthIntegrationProcessor extends WorkerHost {
  constructor(private readonly commandBus: CommandBus) { super(); }

  async process(job: Job<IntegrationEventJobData>): Promise<void> {
    const { eventName, payload } = job.data;
    // ⚠️ KRYTYCZNE: case musi używać ClassName.EVENT_NAME, nigdy 'ClassName' jako string
    switch (eventName) {
      case UserRegisteredIntegrationEvent.EVENT_NAME:
        await this.commandBus.execute(new CreateUserReadModelCommand(
          payload.userId as string, payload.displayName as string | undefined,
          payload.email as string, payload.registrationMethod as string,
        ));
        break;
      case UserDisplayNameUpdatedIntegrationEvent.EVENT_NAME:
        await this.commandBus.execute(new UpdateUserDisplayNameCommand(
          payload.userId as string, payload.displayName as string, payload.avatarUrl as string | null,
        ));
        break;
      case UserProfileUpdatedIntegrationEvent.EVENT_NAME:
        await this.commandBus.execute(new SyncUserProfileCommand(payload.userId as string, payload.profileChanges));
        break;
      case UserRoleChangedIntegrationEvent.EVENT_NAME:
        await this.commandBus.execute(new SyncUserRoleCommand(payload.userId as string, payload.newRole as string));
        break;
      default:
        // Unknown event for this context — log and skip (do NOT throw)
        break;
    }
  }
}
```

**Step 3 — Register the processor in the context module**

`BullModule.registerQueue({ name: QueueName.INTEGRATION_<CONTEXT> })` in `imports`, the processor
class in `providers`. The registration rules (global vs local `registerQueue()`, enum instead of
string literal, what breaks when a globally-registered queue is re-registered locally) are in
[`bullmq-queue-pattern.md`](./bullmq-queue-pattern.md) — they are the same for every queue, not
specific to integration events.

**Step 4 — Emitters call `fanOutService.fanOut(jobData)`**, never `queue.add()` directly.


### Key rules for per-context processors

1. **NEVER use `eventDispatcher`** — call `commandBus.execute()` directly
2. **Switch on `eventName`** — each processor handles all events for its context
3. **`default:` case must NOT throw** — unknown events logged and skipped
4. **JobId = `{outboxMessageId}_{contextName}`** (fallback `{eventName}_{correlationId}_{contextName}`)
   — idempotency via BullMQ deduplication. Separator is `_`, **not** `:` — BullMQ ≥5 rejects
   `:` in custom job IDs (reserved for internal Redis keys).
5. **Retry config**: `attempts: 5`, `backoff: { type: 'exponential', delay: 2000 }`, `removeOnFail: 200`
6. **Consumers must be idempotent** — the outbox is at-least-once (OB4). Never assume exactly-once.

> **The `500ms`/`200ms` commit-wait delay is obsolete.** It was a timing workaround for the
> dual-write race, not atomicity. The outbox poller only reads rows that already committed,
> so the race it papered over cannot occur. Do not add it to new processors.

### Silent loss — the failure mode this pattern exists to prevent

`fanOut()` resolves `this.routingTable[eventName] ?? []`. For an event with **no routing entry**
that is an empty array: `Promise.allSettled([])` resolves, `failureCount === 0`, the
"all queues failed" throw condition is false, and the poller marks the outbox row `PROCESSED`.

**No queue, no error, no trace — and an audit trail that claims delivery.** For an O-1 event
(ADR-0082: loss = irreversible GDPR violation) that outbox row is worse than no record at all,
because it misleads anyone answering a regulator.

Two consequences for anyone touching this pattern:

- Publishing an integration event is a **three-part change**: producer writes to outbox,
  `routingTable` gains an entry, target processor gains a `case`. One without the others is dead code.
- A queue with routing entries but **no `@Processor`** is the same bug one layer out — jobs pile
  up in Redis in `waiting` forever. BullMQ retention (`removeOnComplete`/`removeOnFail`) does
  **not** touch `waiting` jobs, so any PII in those payloads is retained indefinitely. Deleting a
  bounded context means deleting its routing entries and queue registration in the same change.

### Routing Table (canonical — TS-INFRA-002)

See `project-orchestration/tasks/TS-INFRA-002-bullmq-integration-events-fan-out.md` for
the complete event→context routing matrix. The `IntegrationEventFanOutService` is the
SINGLE source of truth for routing — `targetContexts` field in job data is deprecated.

---

## Decision Tree: When to Use Integration Events

### Step 1 — Is an integration event the right construct?

```
Is this event crossing a bounded-context boundary?
├─ YES → Do I need a RESULT synchronously to continue?
│         ├─ YES → NOT an event. Use the ACL Registry (see acl-vs-domain-events.md).
│         └─ NO  → Integration event. Continue to Step 2.
│
└─ NO → Is this a domain state change?
         ├─ YES → Domain Event (Aggregate.apply()) — see domain-event-pattern.md
         └─ NO  → System Event (technical, not business)
```

**A context consuming its OWN integration event is a modeling error.** Integration events pay
the cost of primitive-only payloads and GDPR/security metadata precisely because they cross
context boundaries. Same-context reaction belongs in a domain event.

### Step 2 — Transport: there is only one

```
Publishing a cross-context integration event?
└─ ALWAYS: domain event handler → outbox.saveMessage() → poller → fanOut → queue → processor

   eventDispatcher.dispatchEvent()  → ❌ anti-pattern (see above)
   fanOut() straight from a handler → ❌ crash window, no atomicity
   command handler publishes         → ❌ dual-write, publish sits outside the transaction
```

Delivery criticality still matters for **review depth and alerting**, not for choosing a
transport. ADR-0082 tiers:

| Tier | Meaning | Example |
|---|---|---|
| **O-1** | Loss = GDPR/legal/irreversible violation | `UserDeleted`, `UserAnonymizationCompleted` |
| **O-2** | Loss = observable revenue/feature degradation | `PaymentCompleted` |
| **O-3** | Loss visible but self-healing | `EmailChanged`, `RoleChanged` |
| **O-4** | Loss invisible or auto-corrected | feed rebuild triggers |

O-1/O-2 additionally require an L2 test proving delivery along the **real** path
(outbox → poller → fanOut → processor). A test that mocks the repository or hand-builds
`job.data` proves nothing — three independent silent-loss bugs shipped past fully green
mocked suites before this rule existed.

### Step 3 — Shape of the event

```
Does the payload carry PII or need a documented legal basis?
├─ YES → Subclass ProjectIntegrationEvent with full GDPR + security context
│         - containsPII, legalBasis, retentionPeriod, processingPurpose
│         - primitive types ONLY (no shared domain objects across contexts)
└─ NO  → Subclass ProjectIntegrationEvent, minimal metadata, still primitives only
```

---

## ⚠️ Critical: dot-notation as single source of truth (TS-INFRA-EVENT-NAMES-001)

**Incydent produkcyjny 2026-06-04**: `routingTable['UserRegisteredIntegrationEvent']` zwracało
`undefined` gdy emitter wysyłał `eventName: 'integration.auth.user.registered'` (dot-notation).
Wynik: `routingTable[undefined] = []` → event trafiał do 0 kolejek. Cicha utrata zdarzenia.

### Zasada: zawsze `ClassName.EVENT_NAME`, nigdy string literal

Każda klasa integracyjna MUSI mieć:
```typescript
export class UserRegisteredIntegrationEvent extends ProjectIntegrationEvent {
  public static readonly EVENT_NAME = 'integration.auth.user.registered';
  public override readonly eventName = UserRegisteredIntegrationEvent.EVENT_NAME;
}
```

Używaj `ClassName.EVENT_NAME` wszędzie — routing table, switch case, emitter, priority sets:

```typescript
// ✅ ROUTING TABLE — klucz musi być wartością EVENT_NAME
const routingTable = {
  [UserRegisteredIntegrationEvent.EVENT_NAME]: [this.trustQueue, this.userProfileQueue],
  [EmailVerifiedIntegrationEvent.EVENT_NAME]: [this.authQueue],
} satisfies Partial<Record<IntegrationEventRoutingKey, Queue[]>>;

// ✅ PROCESSOR switch case
switch (eventName) {
  case UserRegisteredIntegrationEvent.EVENT_NAME: { /* ... */ break; }
  case EmailVerifiedIntegrationEvent.EVENT_NAME: { /* ... */ break; }
}

// ✅ EMITTER handler
await this.fanOutService.fanOut({
  eventName: UserRegisteredIntegrationEvent.EVENT_NAME,
  // ...
});

// ✅ PRIORITY SETS
export const CRITICAL_PRIORITY_EVENTS = new Set([
  UserDeletedIntegrationEvent.EVENT_NAME,
  PaymentCompletedIntegrationEvent.EVENT_NAME,
]);
```

### Dla eventów bez klasy (cross-context)

Jeśli event pochodzi z kontekstu, którego nie możesz importować do `@shared/infrastructure`
(naruszenie izolacji), utwórz enum-style constants w `@shared/domain/integration-events/`:

```typescript
// src/shared/domain/integration-events/geo-auth-integration-event-names.enum.ts
export const GeoAuthIntegrationEventNames = {
  USER_RESIDENCE_VERIFIED: 'integration.geo.user-residence-verified',
  CITY_MILESTONE_REACHED: 'geographic-auth.geo.city-milestone-reached',
} as const;

// Użycie w routing table:
[GeoAuthIntegrationEventNames.USER_RESIDENCE_VERIFIED]: [this.userProfileQueue],
```

### CI grep gate — zero tolerancji dla class-name literals

Dodaj do CI/pre-commit:
```bash
grep -rn "case '[A-Z].*IntegrationEvent'" src/ | grep -v spec | grep -v '\.yaml'
# Musi zwrócić 0 wyników — każdy match to regresja
```

---

## Core Rules

1. **Primitive Types Only**: NEVER use complex domain objects (Value Objects, Entities)
   - ✅ string, number, boolean, Date, Record<string, unknown>
   - ❌ UserId, TrustScore, GeographicPoint (domain types)

2. **GDPR Context Required**: Every integration event MUST declare GDPR context
   - containsPII: boolean
   - legalBasis: Art. 6(1) GDPR legal basis
   - retentionPeriod: days (align with business needs)
   - processingPurpose: human-readable description

3. **Security Context Required**: Every integration event MUST declare security context
   - issuedBy: source bounded context
   - requiresDeduplication: prevent duplicate processing
   - securityLevel: public | internal | confidential | restricted
   - encryptionRequired: encrypt payload if PII present

4. **Factory Method**: Provide static fromPayload() for reconstruction
   - Used by outbox processor
   - Used by queue consumers
   - Consistent test fixture creation

5. **Business Logic Methods**: Encapsulate business rules in event class
   - Example: meetsPointThreshold(), meetsTimeThreshold()
   - NOT in handler - business logic belongs in event

6. **Correlation and Causation**: Track event chains for debugging
   - correlationId: request ID across contexts
   - causationId: parent event ID (optional)
   - occurredAt: when the change happened (NOT when event emitted)

7. **Flexible Metadata**: Use Record<string, unknown> for context-specific extensions
   - Allows bounded contexts to add custom data
   - No type coupling between contexts
   - Validate in consumer, NOT in event

---

## Anti-Patterns

### ❌ Complex Domain Types in Payload

```typescript
// ❌ WRONG: Complex domain objects create type coupling
export interface TrustDeltaPayload {
  userId: UserId; // ❌ Domain type from shared kernel
  score: TrustScore; // ❌ Value Object
  location: GeographicPoint; // ❌ Complex type
}

// ✅ CORRECT: Primitive types only
export interface TrustDeltaPayload {
  userId: string; // ✅ Primitive
  previousScore: number; // ✅ Primitive
  newScore: number; // ✅ Primitive
  delta: number; // ✅ Primitive
}
```

### ❌ Missing GDPR Context

```typescript
// ❌ WRONG: No GDPR context
export class MyIntegrationEvent extends ProjectIntegrationEvent {
  constructor(userId: string) {
    super(
      'my.event',
      { userId },
      'my-context',
      // ❌ Missing GDPR context
      // ❌ Missing security context
      // ❌ Missing metadata
    );
  }
}

// ✅ CORRECT: Complete GDPR and security contexts
export class MyIntegrationEvent extends ProjectIntegrationEvent {
  private static readonly GDPR_CONTEXT: GDPRIntegrationContext = {
    containsPII: false,
    legalBasis: 'legitimate_interest',
    retentionPeriod: 90,
    processingPurpose: 'Clear purpose description',
  };

  private static readonly SECURITY_CONTEXT: SecurityIntegrationContext = {
    issuedBy: 'my-context',
    requiresDeduplication: true,
    securityLevel: 'internal',
    encryptionRequired: false,
  };

  constructor(userId: string, correlationId?: string) {
    super(
      'my.event',
      { userId },
      'my-context',
      MyIntegrationEvent.GDPR_CONTEXT,
      MyIntegrationEvent.SECURITY_CONTEXT,
      { correlationId, occurredAt: new Date() }
    );
  }
}
```

### ❌ Filtering Logic in the Consumer

```typescript
// ❌ WRONG: the consumer decides whether the event mattered
case UserTrustScoreUpdatedIntegrationEvent.EVENT_NAME:
  if (Math.abs(payload.delta as number) < 10) return;   // ❌ threshold lives here
  await this.commandBus.execute(new ApplyScoreDeltaCommand(/* ... */));
  break;

// ✅ CORRECT: the producer decides whether to emit at all; the consumer applies
case UserTrustScoreUpdatedIntegrationEvent.EVENT_NAME:
  await this.commandBus.execute(new ApplyScoreDeltaCommand(
    payload.userId as string,
    payload.sourceContext as string,
    payload.delta as number,
  ));
  break;
```

A threshold in the consumer is invisible to the producer and to every other consumer of the same
event — two contexts silently disagree about which events "count", and the emission rate you see
in metrics stops matching what was actually processed. Decide at emission, or make the threshold
part of the payload so every consumer reads the same number.

### ❌ Class-name string jako klucz routingu lub switch case (INCYDENT PRODUKCYJNY)

```typescript
// ❌ WRONG: string literal class name — nie pasuje do eventName (dot-notation)
// routingTable['UserRegisteredIntegrationEvent'] = undefined gdy event ma eventName = 'integration.auth.user.registered'
const routingTable = {
  'UserRegisteredIntegrationEvent': [this.trustQueue],  // ❌ routing table key
};

switch (eventName) {
  case 'UserRegisteredIntegrationEvent': { break; }     // ❌ switch case
}

await this.fanOutService.fanOut({
  eventName: 'UserRegisteredIntegrationEvent',          // ❌ emitter
});

// ✅ CORRECT: używaj ClassName.EVENT_NAME wszędzie
const routingTable = {
  [UserRegisteredIntegrationEvent.EVENT_NAME]: [this.trustQueue],
};

switch (eventName) {
  case UserRegisteredIntegrationEvent.EVENT_NAME: { break; }
}

await this.fanOutService.fanOut({
  eventName: UserRegisteredIntegrationEvent.EVENT_NAME,
});
```

**Dlaczego to krytyczne**: event klasy ma `eventName = 'integration.auth.user.registered'`
(dot-notation). Routing table z kluczem `'UserRegisteredIntegrationEvent'` zwróci `undefined`,
więc `targetQueues = []` — event znika bez śladu, bez błędu. Incydent 2026-06-04.

---

### ❌ Missing Factory Method

```typescript
// ❌ WRONG: No factory method for reconstruction
export class MyIntegrationEvent extends ProjectIntegrationEvent {
  // ❌ Cannot reconstruct from payload
}

// ✅ CORRECT: Factory method for reconstruction
export class MyIntegrationEvent extends ProjectIntegrationEvent {
  static fromPayload(
    payload: MyPayload,
    metadata?: { correlationId?: string }
  ): MyIntegrationEvent {
    return new MyIntegrationEvent(
      payload.userId,
      payload.data,
      metadata?.correlationId
    );
  }
}

// Usage in outbox processor
const event = MyIntegrationEvent.fromPayload(
  JSON.parse(row.payload),
  { correlationId: row.correlation_id }
);
```

---

## Checklist

- [ ] Event extends `ProjectIntegrationEvent`
- [ ] Payload uses PRIMITIVE TYPES only (no complex domain objects)
- [ ] `public static readonly EVENT_NAME = 'integration.<context>.<verb>'` (dot-notation)
- [ ] `public override readonly eventName = ClassName.EVENT_NAME` (not a string literal)
- [ ] Static `VERSION` field (schema evolution)
- [ ] GDPR context defined with all 4 fields
- [ ] Security context defined with all 4 fields
- [ ] Factory method `fromPayload()` implemented
- [ ] Business logic methods in event class (NOT handler)
- [ ] Flexible metadata using Record<string, unknown>
- [ ] correlationId and causationId support
- [ ] Event registered in handler with @EventsHandler decorator
- [ ] GDPR compliance validated (containsPII vs encryptionRequired)
- [ ] Routing table key = `[ClassName.EVENT_NAME]` (NOT `'ClassName'`)
- [ ] Switch case = `case ClassName.EVENT_NAME:` (NOT `case 'ClassName':`)
- [ ] `IntegrationEventRoutingKey` union type updated if new event added to routing table

---

## Integration Event vs Domain Event

| Concern | Integration Event | Domain Event |
|---------|------------------|--------------|
| **Purpose** | Cross-context communication | Domain state change |
| **Base Class** | ProjectIntegrationEvent | DomainEvent (@vytches/ddd) |
| **Payload Types** | Primitive types ONLY | Domain types allowed (VOs, Entities) |
| **GDPR Context** | Required (4 fields) | GDPR segregation (piiData) |
| **Security Context** | Required (4 fields) | Not applicable |
| **Metadata** | correlationId, causationId | aggregateId, version |
| **Storage** | integration_events_outbox | domain_events |
| **Retention** | Per GDPR context (e.g., 90 days) | 7 years (Polish law) |
| **Processing** | Async via queue/outbox | Sync/Async via EventDispatcher |
| **Examples** | `UserRegisteredIntegrationEvent` | `UserResidenceVerifiedEvent` |

---

**References**
- ADR-0025 (Hybrid Event System, Tier 2), ADR-0082 (Outbox Classification Criteria), ADR-0094 (`trust` → `reputation`)
- [`transactional-outbox-pattern.md`](./transactional-outbox-pattern.md) — outbox table, poller, CLS transaction
- [`bullmq-queue-pattern.md`](./bullmq-queue-pattern.md) — queue producer/consumer mechanics
- [`domain-event-pattern.md`](../domain/domain-event-pattern.md) — the in-context counterpart
- `TS-INFRA-002` (per-context fan-out), `TS-INFRA-EVENT-NAMES-001` (dot-notation), `TS-INTEGRATION-EVENT-WIRING-AUDIT-001` (22-handler silent loss)
