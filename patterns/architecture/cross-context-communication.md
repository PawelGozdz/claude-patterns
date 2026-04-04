# Cross-Context Communication Pattern

**Purpose**: Decision guide — when to use ACL, Integration Events, or dedicated queues
**Audience**: All implementers
**Status**: Production-proven (derived from ULS + juz-ide-api patterns)

---

## Decision Tree

```
Need to communicate across bounded context boundaries?
│
├─ Is the result needed NOW to serve the current HTTP request?
│  ├─ YES → Is the target operation fast (<500ms, no LLM, no heavy I/O)?
│  │         ├─ YES → ACL Registry (sync)
│  │         └─ NO  → ❌ WRONG TOOL — redesign as async
│  │
│  └─ NO (eventual consistency is acceptable)
│     │
│     ├─ Multiple contexts may react to this fact?
│     │  └─ YES → Integration Event (INTEGRATION_EVENTS queue)
│     │
│     ├─ One specific context does the work, result comes back?
│     │  └─ YES → Dedicated BullMQ queue + completion integration event
│     │
│     └─ Fire-and-forget, no result needed?
│        └─ YES → Integration Event (INTEGRATION_EVENTS queue)
```

---

## Pattern 1: ACL Registry (Synchronous Cross-Context Query)

### When to use
- Result needed **immediately** to serve current request (login, JWT generation, permission check)
- Target operation is **fast**: database read, cache lookup, pure computation (<500ms)
- **No LLM calls, no document processing, no external HTTP in the target**

### When NOT to use
- ❌ LLM/AI calls (2–30s) — use dedicated queue
- ❌ Document processing — use dedicated queue
- ❌ Notifications — use integration events
- ❌ Fire-and-forget updates — use integration events

### Examples in this codebase
| Caller | Target | Operation | Correct? |
|--------|--------|-----------|----------|
| Auth | Authorization | getUserPermissions | ✅ |
| Auth | Authorization | createDefaultPermissions | ✅ |
| Academic Org | Auth | getUserProfiles (batch) | ✅ |
| Authorization | Auth | getAllUsers (migration) | ✅ |
| Pricing | QueryBus | calculatePrice | ✅ |
| Academic Knowledge | pgvector | semanticSearch | ✅ (fast) |
| Study Session | AI Personalization | generateFlashcards | ❌ USE QUEUE |

### Implementation
See `acl-registry-pattern.md` for full implementation guide.

```typescript
// ✅ Consumer defines interface inline — NO cross-context imports
interface IAuthorizationAdapter {
  getUserPermissions(userId: string): Promise<Result<{ role: string }, Error>>;
}
const adapter = this.aclRegistry.getGlobalRequired<IAuthorizationAdapter>('authorization');
const result = await adapter.getUserPermissions(userId);
```

---

## Pattern 2: Integration Events (Async, Fire-and-Forget)

### When to use
- **Multiple contexts** may react to the same fact (fan-out)
- The publishing context does **not care who reacts** or how many
- Eventual consistency is acceptable
- Examples: UserRegistered, MilestoneReached, ParentalConsentRequested

### Flow
```
DomainEvent (aggregate) → PublisherHandler (application layer)
    → INTEGRATION_EVENTS queue (BullMQ)
    → [200ms delay — transaction commit safety]
    → IntegrationEventsProcessor (switch on eventName)
    → eventDispatcher.dispatchEvent(event)
    → N handlers in N contexts
```

### Implementation
See `integration-event-pattern.md` for full implementation guide.

**Mandatory structure**: Publisher handler lives in **application layer** of publishing context.
Domain events are NEVER consumed directly by external contexts.

```typescript
// ✅ CORRECT: domain event → integration event in application layer
@EventHandler(StudySessionCompletedDomainEvent)
export class StudySessionCompletedPublisherHandler {
  async handle(event: StudySessionCompletedDomainEvent): Promise<void> {
    const integrationEvent = new StudySessionCompletedIntegrationEvent({ ... });
    await this.queue.add(QueueName.INTEGRATION_EVENTS, integrationEvent.toJobData());
  }
}

// ❌ WRONG: external context subscribing to domain event directly
@EventHandler(StudySessionCompletedDomainEvent) // in learning-analytics context
export class SomeHandler { ... } // domain events are PRIVATE to their context
```

### Known issue: 200ms delay fragility
The 200ms delay assumes transaction commits before job is processed.
Under high load this can fail. **Current mitigation**: BullMQ retry with exp. backoff (3 attempts, 5s).
**Future (post-MVP)**: Transactional Outbox pattern.

---

## Pattern 3: Dedicated BullMQ Queue (Async Workload)

### When to use
- **One specific context** does the work (1:1 producer→consumer relationship)
- Long-running operations: LLM calls (2–30s), document processing, embedding generation
- Result is delivered asynchronously back to requesting context via integration event
- Retry semantics must be granular (transient vs permanent errors)

### When NOT to use
- ❌ Multiple consumers need the same message — use integration events instead
- ❌ Simple read queries — use ACL
- ❌ Sub-100ms operations — overhead not worth it

### Examples in this codebase
| Queue | Producer | Consumer | Result delivery |
|-------|----------|----------|-----------------|
| AI_SUMMARY_GENERATION | collaborative-learning | ai-personalization | AISummaryGeneratedIntegrationEvent |
| FLASHCARD_GENERATION | study-session | **ai-personalization** ← (not study-session!) | FlashcardGenerationCompletedIntegrationEvent (TODO) |
| DOCUMENT_PROCESSING | academic-knowledge | academic-knowledge | internal → DOCUMENT_INDEXING |
| PUSH_NOTIFICATIONS | notifications delivery | notifications | n/a (final delivery) |

### ⚠️ FLASHCARD_GENERATION — current status

**Current**: `FlashcardGenerationProcessor` lives in `study-session` context with TODO for ACL call.
**Correct**: Consumer should live in `ai-personalization` context (same as AI Summary pattern).

```
WRONG (current TODO):
  study-session: FlashcardGenerationProcessor → aclRegistry.get('ai-personalization').generateCards()

CORRECT (to implement):
  study-session: FlashcardGenerationPublisher → enqueue FLASHCARD_GENERATION
  ai-personalization: FlashcardGenerationConsumer → LLM call → creates AIEnhancementSession(FLASHCARD)
  ai-personalization: publishes FlashcardGenerationCompletedIntegrationEvent
  study-session: FlashcardGenerationCompletedHandler → deck.addCards(cards)
```

This is identical to the AI Summary flow. Use `AiSummaryGenerationConsumer` as template.

### Implementation template

```typescript
// Producer (study-session context)
@CommandHandler(TriggerFlashcardGenerationCommand)
export class TriggerFlashcardGenerationHandler {
  constructor(@InjectQueue(QueueName.FLASHCARD_GENERATION) private queue: Queue<FlashcardGenerationJobData>) {}

  async execute(command: TriggerFlashcardGenerationCommand): Promise<Result<void>> {
    await this.queue.add('flashcard-generation', {
      jobId: command.jobId,
      deckId: command.deckId,
      userId: command.userId,
      sourceType: command.sourceType,
      sourceId: command.sourceId,
      totalCardsRequested: command.totalCardsRequested,
      correlationId: command.correlationId,
      timestamp: new Date(),
    });
    return Result.ok();
  }
}

// Consumer (ai-personalization context) — mirrors AiSummaryGenerationConsumer
@Processor(QueueName.FLASHCARD_GENERATION)
export class FlashcardGenerationConsumer extends BaseQueueProcessor<FlashcardGenerationJobData> {
  protected async processJob(job: Job<FlashcardGenerationJobData>): Promise<void> {
    // 1. Create AIEnhancementSession(type: FLASHCARD)
    // 2. Call LLM with personality-adapted prompt
    // 3. On success: publish FlashcardGenerationCompletedIntegrationEvent
    // 4. On transient failure: throw (BullMQ retries)
    // 5. On permanent failure (retryCount >= 3): publish FlashcardGenerationFailedIntegrationEvent
  }
}
```

---

## Pattern 4: Future — Per-Context Queues (juz-ide-api TS-INFRA-002)

**Not yet implemented in ULS.** juz-ide-api has migrated to this.

Instead of one `INTEGRATION_EVENTS` queue with central switch processor, each context has:
- Its own queue: `INTEGRATION_AUTHORIZATION`, `INTEGRATION_TRUST`, etc.
- Its own processor extending `BaseQueueProcessor`
- A **fan-out service** routes events to target context queues

**Benefits**: No switch statement, independent scaling, per-context retry settings.
**Migration path**: When ULS grows beyond 6 active contexts, follow juz-ide-api TS-INFRA-002 pattern.

---

## Summary Matrix

| Mechanism | Sync/Async | Consumers | Latency OK | Use case |
|-----------|-----------|-----------|------------|----------|
| ACL Registry | Sync | 1 | <500ms | Permission checks, profile reads, price calculation |
| Integration Events | Async | N | Seconds | UserRegistered, MilestoneReached, notifications |
| Dedicated Queue | Async | 1 | Minutes | LLM generation, document processing, embedding |

---

## Integration Events in Shared Kernel — Directory Convention

All integration events defined in `/src/shared/domain/integration-events/`.
**Convention**: Subdirectory per publishing context (enforces ownership visibility).

```
src/shared/domain/integration-events/
├── auth/                    # Published by auth context
│   ├── user-registered.integration-event.ts
│   └── email-verified.integration-event.ts
├── analytics/               # Published by learning-analytics context
│   ├── milestone-reached.integration-event.ts
│   └── at-risk-status-changed.integration-event.ts
├── collab/                  # Published by collaborative-learning context
│   └── ai-summary-generated.integration-event.ts
├── study-session/           # TODO: add when wiring Learning Analytics
│   ├── session-completed.integration-event.ts
│   └── knowledge-gap-detected.integration-event.ts
└── ...
```

**Current state**: Flat structure (mixed). Target: per-context subdirectories.

---

*Derived from ULS production code + juz-ide-api TS-INFRA-002 migration*
*Last updated: 2026-04-02*
