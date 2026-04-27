# Entity Event Emission Pattern

**Purpose**: Emit domain events from Entities (non-Aggregates) that cannot use `this.apply()`
**Audience**: domain-application-implementer, infrastructure-testing-implementer
**Philosophy**: Production code + concise rules
**Reference**: ResolveInstitutionalAnnouncementHandler (production example)

---

## 🎯 Problem

**Challenge**: Entities cannot emit domain events directly

**Why**:
- Entities extend `BaseEntity` (NO `apply()` method)
- Only Aggregates extend `BaseAggregateRoot` (HAS `apply()` method)
- Domain events = state changes that need audit trail
- Trust BC needs notification of moderation decisions

**Real-world example from Project**:
- InstitutionalAnnouncement is **Entity** (simple CRUD lifecycle)
- When moderator approves/rejects → Trust score needs update
- Cannot use `this.apply(new InstitutionalAnnouncementModeratedEvent(...))` ❌
- **Solution**: Command handler manually emits domain event ✅

---

## ✅ Solution

**Manual Event Emission Pattern**:

```
Command Handler
    ↓
1. Entity domain method (applyModerationDecision)
2. Persist entity (updateModerationStatus)
3. Create domain event (new *ModeratedEvent)
4. eventPersistenceHandler.handleEvent() → Saves to domain_events table
5. eventDispatcher.dispatchEvent() → Routes to event handlers
    ↓
Domain Event Handler
    ↓
6. Create integration event (ContextTrustDeltaIntegrationEvent)
7. eventDispatcher.dispatchEvent() → Trust BC receives event
```

**Critical Rules**:
1. ✅ Command handler takes responsibility for event emission
2. ✅ MUST inject `IEventPersistenceHandler` - saves to `domain_events` table
3. ✅ MUST inject `IEventDispatcher` - routes to event handlers
4. ✅ Call persistence BEFORE dispatch (audit trail first)
5. ❌ EventDispatcher does NOT save events automatically

---

## 🔧 Real Production Example: ResolveInstitutionalAnnouncementHandler

### File: `/src/contexts/community-communication/application/commands/resolve-institutional-announcement/handler.ts`

**Use Case**: InstitutionalAnnouncement (Entity) resolved by municipality

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, Result } from '@vytches/ddd';
import type { IEventDispatcher, IEventPersistenceHandler } from '@vytches/ddd';

import { BaseCommandHandler } from '@shared/application/base';
import {
  EVENT_PERSISTENCE_HANDLER_TOKEN,
  UNIVERSAL_EVENT_DISPATCHER_TOKEN,
} from '@shared/infrastructure/vytches-ddd/constants';

import { AnnouncementResolvedEvent } from '../../domain/events/announcement-resolved.event';

@Injectable()
@CommandHandler(ResolveInstitutionalAnnouncementCommand)
export class ResolveInstitutionalAnnouncementHandler extends BaseCommandHandler<
  ResolveInstitutionalAnnouncementCommand,
  Result<void, Error>
> {
  constructor(
    @Inject(INSTITUTIONAL_ANNOUNCEMENT_REPOSITORY)
    private readonly announcementRepository: IInstitutionalAnnouncementRepository,

    // ✅ REQUIRED: EventPersistenceHandler for domain_events table
    @Inject(EVENT_PERSISTENCE_HANDLER_TOKEN)
    private readonly eventPersistenceHandler: IEventPersistenceHandler,

    // ✅ REQUIRED: EventDispatcher for routing to handlers
    @Inject(UNIVERSAL_EVENT_DISPATCHER_TOKEN)
    private readonly eventDispatcher: IEventDispatcher,

    @Inject(LOGGER_SERVICE) logger: ILoggerService,
    @Inject(RequestContextService) requestContext: RequestContextService,
    @Inject(REDACTION_SERVICE) redactionService: RedactionService
  ) {
    super(logger, requestContext, redactionService);
  }

  protected async executeBusinessLogic(
    command: ResolveInstitutionalAnnouncementCommand
  ): Promise<Result<void, Error>> {
    // 1. Fetch entity
    const announcementResult = await this.announcementRepository.findByIdIncludingInactive(
      command.institutionalAnnouncementId
    );

    if (announcementResult.isFailure || !announcementResult.value) {
      return Result.fail(
        new InstitutionalAnnouncementNotFoundError(command.institutionalAnnouncementId)
      );
    }

    const announcement = announcementResult.value;

    // 2. Entity domain logic (validates state transition)
    const userIdVO = new UserId(command.userId);
    const resolveResult = announcement.resolve(userIdVO, command.reason);

    if (resolveResult.isFailure) {
      return Result.fail(resolveResult.error);
    }

    // 3. Persist entity state change
    const updateResult = await this.announcementRepository.updateStatus(
      announcement,
      InstitutionalAnnouncementStatus.RESOLVED,
      userIdVO,
      command.reason
    );

    if (updateResult.isFailure) {
      return Result.fail(updateResult.error);
    }

    // 4. ✅ CREATE DOMAIN EVENT (manually since Entity cannot emit)
    const resolvedEvent = new AnnouncementResolvedEvent({
      piiData: {},
      anonymizedData: {
        previousStatus: announcement.status.toString(),
        newStatus: InstitutionalAnnouncementStatus.RESOLVED,
        sourceType: announcement.source.toString(),
        severityLevel: announcement.severity.toString(),
        hourOfDay: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        wasVerifiedSource:
          announcement.source === 'MUNICIPALITY' ||
          announcement.source === 'EMERGENCY_SERVICE',
      },
      businessData: {
        announcementId: command.institutionalAnnouncementId,
        authorId: announcement.authorId.toString(),
        resolvedBy: command.userId,
        previousStatus: announcement.status.toString(),
        newStatus: InstitutionalAnnouncementStatus.RESOLVED,
        reason: command.reason,
        sourceType: announcement.source.toString(),
        severityLevel: announcement.severity.toString(),
        resolvedAt: new Date(),
        correlationId: this.requestContext.getCorrelationId(),
      },
      cryptoShredding: {
        piiFields: [],
        retentionPeriod: 2555, // 7 years
        isShredded: false,
      },
    });

    // 5. ✅ PERSIST EVENT TO domain_events TABLE
    // CRITICAL: Call BEFORE dispatch to ensure audit trail
    await this.eventPersistenceHandler.handleEvent(resolvedEvent);

    // 6. ✅ DISPATCH EVENT TO EVENT HANDLERS
    await this.eventDispatcher.dispatchEvent(resolvedEvent);

    return Result.empty();
  }
}
```

---

## 📋 Event Handler Pattern (Same as Aggregate Events)

**File**: `/src/contexts/community-communication/application/event-handlers/announcement-resolved-activity-feed.handler.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { EventHandler, IEventDispatcher, IEventHandler } from '@vytches/ddd';

import { ILoggerService, LOGGER_SERVICE } from '@shared/infrastructure/logging';
import { UNIVERSAL_EVENT_DISPATCHER_TOKEN } from '@shared/infrastructure/vytches-ddd/constants';

import { AnnouncementResolvedEvent } from '../../domain/events/announcement-resolved.event';
import { AnnouncementActivityIntegrationEvent } from '../../domain/integration-events/announcement-activity.integration-event';

@Injectable()
@EventHandler(AnnouncementResolvedEvent)
export class AnnouncementResolvedActivityFeedHandler
  implements IEventHandler<AnnouncementResolvedEvent>
{
  constructor(
    @Inject(LOGGER_SERVICE) private readonly logger: ILoggerService,
    @Inject(UNIVERSAL_EVENT_DISPATCHER_TOKEN)
    private readonly eventDispatcher: IEventDispatcher
  ) {}

  async handle(event: AnnouncementResolvedEvent): Promise<void> {
    try {
      const businessData = event.getBusinessData();
      if (!businessData) {
        this.logger.warn('AnnouncementResolvedActivityFeedHandler: No business data');
        return;
      }

      // Create integration event for Activity Feed BC
      const integrationEvent = new AnnouncementActivityIntegrationEvent({
        activityType: 'announcement_resolved',
        announcementId: businessData.announcementId,
        userId: businessData.resolvedBy,
        sourceType: businessData.sourceType,
        severityLevel: businessData.severityLevel,
        metadata: {
          previousStatus: businessData.previousStatus,
          newStatus: businessData.newStatus,
          reason: businessData.reason,
        },
        occurredAt: businessData.resolvedAt,
        correlationId: businessData.correlationId,
      });

      // Emit integration event
      await this.eventDispatcher.dispatchEvent(integrationEvent);

      this.logger.info(
        'AnnouncementResolvedActivityFeedHandler: Integration event published',
        {
          announcementId: businessData.announcementId,
          correlationId: businessData.correlationId,
        }
      );
    } catch (error) {
      this.logger.error(
        'AnnouncementResolvedActivityFeedHandler: Failed to handle event',
        {
          error: error instanceof Error ? error.message : String(error),
          announcementId: event.getAnnouncementId(),
        }
      );
    }
  }
}
```

---

## 🔍 When to Use This Pattern

| Scenario | Use Manual Emission? | Reason |
|----------|---------------------|--------|
| **Aggregate state change** | ❌ NO | Use `this.apply()` in aggregate |
| **Entity state change (needs domain event)** | ✅ YES | Entity has no `apply()` method |
| **Simple CRUD (no cross-context notification)** | ❌ NO | No domain event needed |
| **Integration event ONLY (no domain event)** | ⚠️ MAYBE | Use if simplified pattern justified (ADR required) |

---

## ⚙️ Implementation Checklist

### Command Handler (Entity Event Emission)

- [ ] Inject `IEventPersistenceHandler` from `@vytches/ddd`
- [ ] Inject `IEventDispatcher` from `@vytches/ddd`
- [ ] Use tokens: `EVENT_PERSISTENCE_HANDLER_TOKEN`, `UNIVERSAL_EVENT_DISPATCHER_TOKEN`
- [ ] Create domain event instance with full GDPR context
- [ ] Call `eventPersistenceHandler.handleEvent(event)` FIRST
- [ ] Call `eventDispatcher.dispatchEvent(event)` SECOND
- [ ] Both calls INSIDE transaction boundary (BaseCommandHandler handles)

### Domain Event Handler (Same as Aggregate Pattern)

- [ ] Use `@EventHandler(DomainEvent)` decorator
- [ ] Implement `IEventHandler<DomainEvent>` interface
- [ ] Inject `IEventDispatcher` for integration events
- [ ] Create integration event from domain event data
- [ ] Call `eventDispatcher.dispatchEvent(integrationEvent)`
- [ ] Add error handling with structured logging

### Module Registration

- [ ] Add handler to module `providers` array
- [ ] Add handler to module `exports` array (if used cross-module)
- [ ] NO bus registration (auto-discovered via `@EventHandler`)

---

## 🚫 Anti-Patterns

### ❌ WRONG: Emit integration event directly (bypass domain layer)

```typescript
// Command handler
const integrationEvent = new ContextTrustDeltaIntegrationEvent({...});
await this.eventDispatcher.dispatchEvent(integrationEvent);
// ❌ NO domain event = NO audit trail in domain_events table
```

### ❌ WRONG: Forget to persist domain event

```typescript
const domainEvent = new AnnouncementResolvedEvent({...});
// ❌ MISSING: await this.eventPersistenceHandler.handleEvent(domainEvent);
await this.eventDispatcher.dispatchEvent(domainEvent);
// Result: Event routed to handlers but NOT saved to domain_events table
```

### ❌ WRONG: Dispatch before persist

```typescript
await this.eventDispatcher.dispatchEvent(domainEvent); // ❌ WRONG ORDER
await this.eventPersistenceHandler.handleEvent(domainEvent); // ❌ TOO LATE
// If dispatch fails, event is saved but never processed (orphaned)
```

### ❌ WRONG: Try to use `apply()` in Entity

```typescript
export class InstitutionalAnnouncement extends BaseEntity<InstitutionalAnnouncementProps> {
  applyModerationDecision() {
    this.apply(new InstitutionalAnnouncementModeratedEvent({...})); // ❌ NO apply() METHOD
  }
}
// Error: Property 'apply' does not exist on type 'InstitutionalAnnouncement'
```

---

## 📚 Related Patterns

- **aggregate-pattern.md** - Aggregates use `this.apply()` instead
- **integration-event-pattern.md** - Cross-context communication
- **repository-pattern.md** - BaseKyselyRepository auto-handles aggregate events
- **command-handler-pattern.md** - Transaction boundary and Result pattern

---

**Version**: 1.0
**Created**: 2026-01-06
**Production Reference**: `resolve-institutional-announcement/handler.ts` (lines 137-180)
**Status**: Production-proven pattern for 2+ implementations
