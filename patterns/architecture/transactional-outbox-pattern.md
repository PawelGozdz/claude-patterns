# Transactional Outbox Pattern

**Purpose**: Atomic delivery of integration events — eliminates the crash window between DB commit and BullMQ dispatch.
**Audience**: domain-application-implementer, infrastructure-testing-implementer
**Philosophy**: Code + concise rules. Reference: TS-DR-003, ADR-0027 (Tier 1 events)

---

## 🎯 Problem

**Current broken flow** (fanOut called outside transaction):

```
BaseCommandHandler.execute() [@Transactional]
  → repository.save(aggregate)        ← DB COMMIT
  → EventDispatcher.dispatch(events)  ← synchronous, within CLS transaction
     → SomeHandler.handle()           ← still in CLS transaction
        → fanOutService.fanOut()      ← BullMQ/Redis push OUTSIDE DB atomicity
                                       ← CRASH HERE = event lost forever
```

The `delay: 500ms` in `IntegrationEventFanOutService` was a timing workaround, NOT atomicity.

**Fixed flow** (outbox within transaction):

```
BaseCommandHandler.execute() [@Transactional]
  → repository.save(aggregate)                   ← inside transaction
  → EventDispatcher.dispatch(events)             ← synchronous, inside CLS transaction
     → SomeHandler.handle()                      ← inside CLS transaction ✓
        → outboxService.saveMessage(type, data)  ← writes outbox row (same TX) ✓
                                                  ← COMMIT: aggregate + outbox = atomic ✓

OutboxPollerService (setInterval every 2s)
  → outboxRepository.getUnprocessedMessages(50)  ← reads PENDING rows
  → fanOutService.fanOut(message.payload)        ← pushes to BullMQ
  → outboxRepository.updateStatus(PROCESSED)    ← marks done
```

---

## ✅ Solution

`@vytches/ddd-messaging` provides `OutboxService` + `IOutboxRepository`.
`KyselyOutboxRepository` uses `TransactionHost.tx` (CLS) for writes — joins the active transaction automatically.

---

## 🔧 Implementation

### Key files

| File | Role |
|------|------|
| `src/shared/infrastructure/messaging/outbox/kysely-outbox.repository.ts` | `IOutboxRepository` impl, CLS-aware |
| `src/shared/infrastructure/messaging/outbox/outbox-poller.service.ts` | setInterval, reads PENDING, calls fanOut |
| `src/shared/infrastructure/messaging/outbox/outbox.module.ts` | `@Global()` NestJS module |
| `src/shared/infrastructure/messaging/outbox/tokens.ts` | `OUTBOX_SERVICE`, `OUTBOX_REPOSITORY` |
| `src/shared/database/migrations/091_create_outbox_table.ts` | `outbox_messages` table + indexes |

### CLS transaction propagation

`KyselyOutboxRepository` uses **two connections**:
- **`txHost.tx`** for `saveMessage()` / `saveBatch()` / `scheduleMessage()` — joins active `@Transactional` context
- **`db`** (raw `DATABASE_TOKEN`) for `getUnprocessedMessages()`, `updateStatus()`, etc. — poller runs outside transactions

```typescript
// Write path (inside CLS transaction from BaseCommandHandler)
async saveMessage<T>(message: IOutboxMessage<T>): Promise<string> {
  const conn = this.txHost.tx ?? this.db;  // falls back if no active TX
  await conn.insertInto('outbox_messages').values(...).execute();
  return message.id;
}

// Read path (poller, outside transaction)
async getUnprocessedMessages(limit = 50): Promise<IOutboxMessage[]> {
  return this.db.selectFrom('outbox_messages')
    .where('status', '=', MessageStatus.PENDING)
    .limit(limit)
    .execute();
}
```

### How to migrate a handler

**Before** (direct BullMQ — BROKEN):
```typescript
@Injectable()
@EventHandler(SomeDomainEvent)
export class SomeIntegrationEventPublisherHandler {
  constructor(
    @Inject(IntegrationEventFanOutService)
    private readonly fanOutService: IntegrationEventFanOutService,
  ) {}

  async handle(event: SomeDomainEvent): Promise<void> {
    const jobData: IntegrationEventJobData = {
      eventName: 'SomeIntegrationEvent',
      payload: { ... },
      sourceContext: 'SomeContext',
      targetContexts: [...],
      correlationId: event.eventId,
      timestamp: new Date(),
    };
    await this.fanOutService.fanOut(jobData);  // ← CRASH WINDOW
  }
}
```

**After** (outbox — ATOMIC):
```typescript
import { OutboxService } from '@vytches/ddd-messaging';
import { OUTBOX_SERVICE } from '@shared/infrastructure/messaging/outbox';

@Injectable()
@EventHandler(SomeDomainEvent)
export class SomeIntegrationEventPublisherHandler {
  constructor(
    @Inject(OUTBOX_SERVICE)
    private readonly outboxService: OutboxService,
  ) {}

  async handle(event: SomeDomainEvent): Promise<void> {
    const jobData: IntegrationEventJobData = {
      eventName: 'SomeIntegrationEvent',
      payload: { ... },
      sourceContext: 'SomeContext',
      targetContexts: [...],
      correlationId: event.eventId,
      timestamp: new Date(),
    };
    // TS-DR-003: Write to outbox — same CLS transaction as aggregate save.
    await this.outboxService.saveMessage(jobData.eventName, jobData);
  }
}
```

**Module wiring** — add `OutboxModule` to context module imports:
```typescript
// OutboxModule is @Global() — no import needed in context modules.
// Just inject OUTBOX_SERVICE in the handler.
```

---

## 📋 Rules

### MUST

- ✅ **MUST** write to outbox in domain event handlers (NOT command handlers directly)
- ✅ **MUST** use `outboxService.saveMessage(eventName, jobData)` inside event handlers
- ✅ **MUST** keep the same `IntegrationEventJobData` shape (fanOut service reads it from outbox payload)
- ✅ **MUST** inject `@Inject(OUTBOX_SERVICE)` — NOT the concrete `KyselyOutboxRepository`
- ✅ **MUST** add `OutboxModule` import to any context module whose handlers use `OUTBOX_SERVICE`
  (Note: `@Global()` means this is usually already available)

### MUST NOT

- ❌ **MUST NOT** call `fanOutService.fanOut()` directly from domain event handlers (crash window)
- ❌ **MUST NOT** add `@Transactional()` to `KyselyOutboxRepository` methods (CLS handles this)
- ❌ **MUST NOT** call `outboxService.saveMessage()` from command handlers (too early — after save)
- ❌ **MUST NOT** use the outbox for synchronous request/response flows

---

## ⚠️ Anti-Patterns

### 1. Enqueueing outside the CLS transaction

```typescript
// ❌ WRONG: called from command handler executeBusinessLogic()
// At this point aggregate is saved BUT transaction may not have committed
protected async executeBusinessLogic(command: MyCommand): Promise<Result<...>> {
  await this.repository.save(myAggregate);
  await this.outboxService.saveMessage(...); // ← too late! save() already dispatched events
}

// ✅ CORRECT: from domain event handler (called synchronously by EventDispatcher inside save())
@EventHandler(MyDomainEvent)
export class MyHandler {
  async handle(event: MyDomainEvent): Promise<void> {
    await this.outboxService.saveMessage(...); // ← inside transaction ✓
  }
}
```

### 2. Still calling fanOut directly after migrating

```typescript
// ❌ WRONG: double-dispatch (outbox + direct fanOut)
await this.outboxService.saveMessage(jobData.eventName, jobData);
await this.fanOutService.fanOut(jobData);  // ← remove this line
```

### 3. Skipping outbox for Tier 1 events

Tier 1 events (GDPR Art.32 compliance) MUST use outbox:
- `UserRegisteredIntegrationEvent`
- `EmailVerifiedIntegrationEvent`
- `EmailChangedIntegrationEvent`
- `PaymentCompletedIntegrationEvent`
- `UserAnonymizationCompletedIntegrationEvent`
- `UserTrustScoreUpdatedIntegrationEvent`
- `UserRoleChangedIntegrationEvent`

---

## 📊 Migration status (as of 2026-05-09)

| Handler | Status |
|---------|--------|
| `auth/user-registered.handler.ts` | ✅ migrated |
| `auth/email-verified.handler.ts` | ✅ migrated |
| `auth/email-changed-integration-event-publisher.handler.ts` | ✅ migrated |
| `payment/payment-completed.handler.ts` | ✅ migrated |
| `trust/trust-score-integration-event-publisher.handler.ts` | ✅ migrated |
| `authorization/publish-role-changed-integration-event.handler.ts` | ✅ migrated |
| All other ~24 handlers using `fanOutService.fanOut()` | ⏳ pending (TS-DR-003 follow-up) |

---

## 📚 References

- ADR-0027: Audit Event Selection (3-tier GDPR-compliant logging)
- ADR-0025: Hybrid Event System (domain vs integration events)
- `src/shared/infrastructure/messaging/outbox/` — implementation
- `src/shared/database/migrations/091_create_outbox_table.ts` — schema
- `transactional-pattern.md` — CLS transaction mechanics
- `integration-event-pattern.md` — integration event structure

---

**Pattern Type**: Architecture (MANDATORY for Tier 1 integration event handlers)
**Status**: Partially adopted (6 of ~30 handlers migrated)
**Lines**: ~180
