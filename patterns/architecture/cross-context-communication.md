# Cross-Context Communication Pattern

**Tags**: "api:app:cross-context", "api:events"

**Layer**: Architecture
**Assumes**: ddd/core   <!-- wzorzec operuje pojęciami modelu domenowego -->

**Purpose**: Decision guide — when to use ACL, Integration Events, or dedicated queues
**Audience**: All implementers
**Status**: Production-proven (derived from ULS + juz-ide-api patterns)

---

## Decision Tree

```
Need to communicate across bounded context boundaries?
│
├─ Is this a REPEATED READ of another context's data (discovery, list, display),
│  not a one-off request-response?
│  ├─ YES → Will THIS read's value be persisted as a content anchor, or feed an
│  │         authz/guardrail decision?
│  │         ├─ YES → ACL Registry (sync) — staleness here is a permanent error
│  │         │        or an access-control gap, not a UX nuance (see Pattern 1)
│  │         └─ NO  → Per-Context Read Projection (see Pattern 4) — eventual
│  │                  consistency is the correct trade-off; querying ACL on every
│  │                  list/discovery read is an unjustified N+1
│  │
│  └─ NO (this is a one-off action, not a standing read need) ↓ continue below
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

The first branch is deliberately asked before the request/response branch below: a repeated
read (discovery feed, list, "who's near me") is a standing data-shape question, not a
per-request action, and answering it with "is this fast enough for sync" alone misses the
real trade-off — see `infrastructure/geo-spatial-query-pattern.md` Rule 11 (`ADR-0114`) for
the concrete incident (`TS-GEO-TRIGGER-CROSS-CONTEXT-001`) that surfaced this gap: three
CREATE handlers already called ACL correctly, and three discovery-query repositories already
read a local projection correctly — the pattern existed in code before it existed in this
document.

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
    return Result.empty();
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

## Pattern 4: Per-Context Read Projection (Materialized Cross-Context View)

### When to use
- The read is **repeated**, not a one-off (discovery feed, list filtering, "near me" search)
- The value being read will **not** be persisted as a new anchor and does **not** gate an
  authz/guardrail decision for THIS read
- Eventual consistency (bounded by the sync handler's own event lag) is an acceptable
  trade-off — the failure mode of a stale read is tolerable (a list item briefly
  under/over-inclusive), not a permanent data error or an access-control gap

### When NOT to use
- ❌ Anchoring newly-created content (CREATE-time geometry, address snapshot) — use ACL
  (Pattern 1); a stale anchor is written once and never self-corrects
- ❌ Authorization or guardrail checks (e.g. residence-boundary validation) — use ACL; a stale
  "allow" is a live access-control gap, not a UX nuance
- ❌ As a substitute for ACL "because it's cheaper" when the read is actually one of the two
  cases above — cost is not the deciding factor, staleness tolerance is

### How it differs from the other three patterns
It is not a request-response (Pattern 1), not a fan-out notification (Pattern 2), and not an
async unit of work with a result (Pattern 3). It is a **standing, consumer-owned read model**:
the owning context subscribes to the source context's integration events and maintains its own
local copy, indefinitely, for its own reads — closer to CQRS's "read model" than to any of the
sync/async messaging patterns above, which is why it needs its own category rather than being
squeezed into "Integration Events".

### Reference implementation (juz-ide-api)
Every consuming context maintains its own `<context>_users` projection table (`economy_users`,
`community_communication_users`, `discussions_users`, `engagement_users`), kept in sync by
three event handlers per context subscribing to `geographic-auth`'s
`ResidenceRegisteredIntegrationEvent` / `ActiveResidenceSwitchedIntegrationEvent` /
`ResidenceDeletedIntegrationEvent`. Three CREATE handlers in `neighborhood-economy`
(`create-job-request`, `create-local-share`, `create-service-offering`) correctly bypass this
projection and call ACL directly (Pattern 1) because they anchor new content. Three discovery
query repositories in the same context correctly read the projection instead of calling ACL
per row.

```typescript
// ✅ Consumer-owned projection, synced by dedicated event handlers — not a live call
@EventHandler(ResidenceRegisteredIntegrationEvent)
export class ResidenceRegisteredHandler {
  async handle(event: ResidenceRegisteredIntegrationEvent): Promise<void> {
    // appends to economy_users.residences JSONB (or a native indexed column — see caveat)
  }
}

// ✅ Discovery read — projection, not ACL (repeated, eventual-consistency-tolerant)
const nearby = await this.queryRepository.findByProximity(residencesProjectionColumn, ...);

// ❌ WRONG — CREATE-time anchor read from the projection instead of ACL
const coords = await this.userProjectionRepository.getResidence(userId); // stale-risk on anchor
```

### Caveat — shape matters as much as source
Choosing this pattern only answers "may I read a local copy at all". If that copy will feed a
**spatial predicate** (`ST_DWithin`, `ST_Intersects`, KNN), the column itself must independently
satisfy `infrastructure/geo-spatial-query-pattern.md` Rule 12 (GEO19): native
`geography`/`geometry` with a matching GiST index, never a JSONB array requiring
`jsonb_array_elements` (unindexable by construction). `economy_users.residences` today is
JSONB and has already drifted from its source once in production (migration
`259_backfill_terc_economy_users_residences.ts`) — a live example of getting the *source*
decision right (Pattern 4 is the correct mechanism here) while the *shape* was wrong (fixed
under `TS-GEO-TRIGGER-CROSS-CONTEXT-001`, PR-GIST).

### Consistency risk this pattern accepts
Each consuming context implements its own copy of the same three-handler sync logic
independently — a real, observed risk (the migration-259 drift), not hypothetical. Do not
centralize storage across contexts to fix this (that reintroduces the coupling this pattern
exists to avoid); instead keep the handler trio's *shape* consistent (a shared base
handler/mixin per event type) and add a periodic consistency-check job comparing projection
row counts/checksums against the source context.

---

## Pattern 5: Future — Per-Context Queues (juz-ide-api TS-INFRA-002)

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
| ACL Registry | Sync | 1 | <500ms | Permission checks, profile reads, price calculation, CREATE-time anchors |
| Integration Events | Async | N | Seconds | UserRegistered, MilestoneReached, notifications |
| Dedicated Queue | Async | 1 | Minutes | LLM generation, document processing, embedding |
| Per-Context Read Projection | Async (standing) | 1 (self) | Sync-lag bound | Discovery/list reads, display — never CREATE anchors or authz |

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
