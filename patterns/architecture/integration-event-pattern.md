# Integration Event Pattern

**Purpose**: Cross-bounded-context communication using real Project production patterns
**Audience**: domain-application-implementer, infrastructure-testing-implementer
**Philosophy**: Code + concise rules, NO verbose explanations
**Reference**: ADR-0025 (Hybrid Event System - Tier 2), Real production code

---

## 🎯 Problem

**Challenges with cross-context communication**:
- Context isolation → Trust scores calculated in one context need global aggregation
- No shared state → Each context has independent view of user trust
- Event spam → Small trust changes (±1 point) would flood system
- Stale global scores → Without periodic updates, global view becomes outdated
- GDPR compliance → Must track data processing legal basis and retention
- Type coupling → Cross-context events with complex types create dependencies
- Missing audit trail → Cannot trace which context emitted trust delta

**Real-world example from Project**:
- **Geographic-Auth context** calculates trust from location verification (+15 points)
- **Engagement context** calculates trust from comment quality (-5 points)
- **Authorization context** needs GLOBAL trust score (sum of all context scores)
- **Challenge**: How to communicate trust deltas WITHOUT coupling contexts?

---

## ✅ Solution

**Integration Event pattern with Project-specific features**:
- **Primitive types only**: NO complex objects → prevents type coupling
- **GDPR context**: containsPII, legalBasis, retentionPeriod, processingPurpose
- **Security context**: issuedBy, requiresDeduplication, securityLevel, encryptionRequired
- **Integration metadata**: correlationId, causationId, occurredAt
- **Dual Threshold Pattern**: Emit if |delta| >= 10 points OR daysSinceLastEmit >= 7 days
- **Flexible metadata**: Record<string, unknown> for context-specific data
- **Factory method**: fromPayload() for reconstruction from storage
- **Business logic methods**: meetsPointThreshold(), meetsTimeThreshold()

---

## 🔧 Real Production Example: ContextTrustDeltaIntegrationEvent

### File Structure

**Location**: `src/shared/domain/integration-events/context-trust-delta.integration-event.ts`

**Use Case**: Geographic-Auth context emits trust score change, Authorization context updates global score

**Business Rule**: BR-TRUST-DELTA-001 (Dual Threshold Pattern)

### Complete Implementation

```typescript
import { ProjectIntegrationEvent } from './base/project-integration-event';
import {
  GDPRIntegrationContext,
  IntegrationEventMetadata,
  SecurityIntegrationContext,
} from './types/integration-event.types';

/**
 * Integration event published when a context-specific trust score changes
 *
 * DUAL THRESHOLD PATTERN (BR-TRUST-DELTA-001):
 * Events are emitted when EITHER condition is met:
 * - Score delta >= 10 points (prevents event spam for small changes)
 * - Time since last emission >= 7 days (prevents stale global scores)
 *
 * GDPR Context:
 * - containsPII: false (userId is pseudonymized identifier)
 * - legalBasis: legitimate_interest (trust score calculation)
 * - retentionPeriod: 90 days
 *
 * Cross-Context Autonomy:
 * - Uses PRIMITIVE TYPES only (no shared domain objects)
 * - sourceContext as string (not enum) for bounded context independence
 * - Flexible metadata for context-specific extensions
 *
 * Example Flow:
 * 1. Geographic-Auth: User verifies home address → +15 trust points
 * 2. Geographic-Auth: Emits ContextTrustDeltaIntegrationEvent (delta: +15)
 * 3. Authorization: Receives event, updates global trust score
 * 4. Authorization: Re-evaluates verification level if threshold crossed
 */
export interface ContextTrustDeltaIntegrationPayload {
  /** Pseudonymized user identifier (NOT email/name) */
  userId: string;

  /** Source bounded context (primitive string for independence) */
  sourceContext: string; // 'geographic-auth', 'engagement', 'community-communication'

  /** Previous trust score in source context */
  previousScore: number;

  /** New trust score in source context */
  newScore: number;

  /** Delta (newScore - previousScore) */
  delta: number;

  /** Human-readable reason for trust change */
  reason: string; // 'home_address_verified', 'quality_comment_posted', 'spam_reported'

  /** When the trust change occurred */
  occurredAt: Date;

  /** Optional context-specific metadata (flexible extension) */
  metadata?: Record<string, unknown>;
}

export class ContextTrustDeltaIntegrationEvent extends ProjectIntegrationEvent {
  /** Event name for routing and handler registration */
  public static readonly eventName = 'integration.trust.context-delta';

  /** Event version for schema evolution */
  public static readonly VERSION = '1.0.0';

  /**
   * GDPR Context (default for all trust delta events)
   *
   * - containsPII: false (userId is pseudonymized)
   * - legalBasis: legitimate_interest (Art. 6(1)(f) GDPR)
   * - retentionPeriod: 90 days (operational necessity)
   * - processingPurpose: Trust score calculation across contexts
   */
  private static readonly DEFAULT_GDPR_CONTEXT: GDPRIntegrationContext = {
    containsPII: false,
    legalBasis: 'legitimate_interest',
    retentionPeriod: 90,
    processingPurpose: 'Trust score calculation and distribution across bounded contexts',
  };

  /**
   * Security Context (default for all trust delta events)
   *
   * - issuedBy: Source context (overridden in constructor)
   * - requiresDeduplication: true (prevent duplicate processing)
   * - securityLevel: internal (Project system only)
   * - encryptionRequired: false (no PII, no sensitive data)
   */
  private static readonly DEFAULT_SECURITY_CONTEXT: SecurityIntegrationContext = {
    issuedBy: 'trust',
    requiresDeduplication: true,
    securityLevel: 'internal',
    encryptionRequired: false,
  };

  constructor(
    /** User identifier (pseudonymized) */
    public readonly userId: string,

    /** Source bounded context (override from base class) */
    public override readonly sourceContext: string,

    /** Previous trust score in source context */
    public readonly previousScore: number,

    /** New trust score in source context */
    public readonly newScore: number,

    /** Delta (newScore - previousScore) */
    public readonly delta: number,

    /** Reason for trust change */
    public readonly reason: string,

    /** When the change occurred (defaults to now) */
    occurredAt: Date = new Date(),

    /** Optional context-specific metadata */
    public readonly eventMetadata?: Record<string, unknown>,

    /** Optional correlation ID for request tracing */
    correlationId?: string,

    /** Optional causation ID for event chain tracking */
    causationId?: string
  ) {
    super(
      ContextTrustDeltaIntegrationEvent.eventName,
      {
        userId,
        sourceContext,
        previousScore,
        newScore,
        delta,
        reason,
        occurredAt: occurredAt.toISOString(),
        metadata: eventMetadata,
      },
      sourceContext,
      ContextTrustDeltaIntegrationEvent.DEFAULT_GDPR_CONTEXT,
      {
        ...ContextTrustDeltaIntegrationEvent.DEFAULT_SECURITY_CONTEXT,
        issuedBy: sourceContext,
      },
      {
        correlationId,
        causationId,
        occurredAt,
      }
    );
  }

  /**
   * Factory method: Reconstruct event from payload
   *
   * Used by:
   * - Outbox processor when reading from database
   * - Queue consumer when receiving from BullMQ
   * - Test fixtures for consistent test data
   */
  static fromPayload(
    payload: ContextTrustDeltaIntegrationPayload,
    metadata?: { correlationId?: string; causationId?: string }
  ): ContextTrustDeltaIntegrationEvent {
    return new ContextTrustDeltaIntegrationEvent(
      payload.userId,
      payload.sourceContext,
      payload.previousScore,
      payload.newScore,
      payload.delta,
      payload.reason,
      payload.occurredAt,
      payload.metadata,
      metadata?.correlationId,
      metadata?.causationId
    );
  }

  /**
   * Business Logic: Check if delta meets point threshold
   *
   * BR-TRUST-DELTA-001 (Condition 1):
   * Emit event if |delta| >= 10 points
   *
   * Rationale:
   * - Small changes (±1, ±2) would spam the system
   * - 10 points represents SIGNIFICANT trust change
   * - Examples: Home verification (+15), Spam report (-20)
   */
  meetsPointThreshold(): boolean {
    return Math.abs(this.delta) >= 10;
  }

  /**
   * Business Logic: Check if event meets time threshold
   *
   * BR-TRUST-DELTA-001 (Condition 2):
   * Emit event if daysSinceLastEmit >= 7 days
   *
   * Rationale:
   * - Even small deltas accumulate over time
   * - Global score becomes stale without periodic updates
   * - 7 days = weekly trust score sync
   *
   * @param lastEmittedAt Date of last emitted trust delta event
   */
  meetsTimeThreshold(lastEmittedAt: Date): boolean {
    const daysSinceLastEmit = this.daysSince(lastEmittedAt);
    return daysSinceLastEmit >= 7;
  }

  /**
   * Helper: Calculate days between two dates
   */
  private daysSince(pastDate: Date): number {
    const now = new Date();
    const diffMs = now.getTime() - pastDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return Math.floor(diffDays);
  }
}
```

---

## ProjectIntegrationEvent Base Class

**Location**: `src/shared/domain/integration-events/base/project-integration-event.ts`

**Key Features**:
- **eventId**: Unique identifier (UUID)
- **eventName**: Static routing key
- **payload**: Primitive types only
- **sourceContext**: Origin bounded context
- **gdprContext**: GDPR compliance metadata
- **securityContext**: Security and deduplication settings
- **integrationMetadata**: correlationId, causationId, occurredAt

```typescript
import { randomUUID } from 'crypto';
import {
  GDPRIntegrationContext,
  IntegrationEventMetadata,
  SecurityIntegrationContext,
} from '../types/integration-event.types';

/**
 * Base class for ALL Project integration events
 *
 * Features:
 * - GDPR compliance (containsPII, legalBasis, retention)
 * - Security context (deduplication, encryption)
 * - Integration metadata (correlation, causation)
 * - Primitive types only (NO complex domain objects)
 */
export abstract class ProjectIntegrationEvent {
  /** Unique event identifier */
  public readonly eventId: string;

  /** Event name for routing (e.g., 'integration.trust.context-delta') */
  public readonly eventName: string;

  /** Event payload (primitive types ONLY) */
  public readonly payload: Record<string, unknown>;

  /** Source bounded context */
  public readonly sourceContext: string;

  /** GDPR compliance context */
  public readonly gdprContext: GDPRIntegrationContext;

  /** Security and deduplication context */
  public readonly securityContext: SecurityIntegrationContext;

  /** Integration metadata (correlation, causation) */
  public readonly integrationMetadata: IntegrationEventMetadata;

  protected constructor(
    eventName: string,
    payload: Record<string, unknown>,
    sourceContext: string,
    gdprContext: GDPRIntegrationContext,
    securityContext: SecurityIntegrationContext,
    metadata: {
      correlationId?: string;
      causationId?: string;
      occurredAt?: Date;
    }
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
   * Validate that payload contains NO PII
   *
   * CRITICAL: Integration events MUST NOT contain PII
   * - Use pseudonymized IDs (userId, aggregateId)
   * - NEVER email, phone, name, address
   * - Hash sensitive data if needed (ipAddressHash)
   */
  public validateNoPII(): boolean {
    if (!this.gdprContext.containsPII) {
      return true; // GDPR context declares no PII
    }

    // If containsPII: true, check encryption requirement
    if (this.securityContext.encryptionRequired) {
      return true; // PII must be encrypted
    }

    throw new Error(
      `Integration event ${this.eventName} contains PII but encryption not required. ` +
      `Either remove PII or set encryptionRequired: true.`
    );
  }
}
```

---

## Integration Event Types

**Location**: `src/shared/domain/integration-events/types/integration-event.types.ts`

```typescript
/**
 * GDPR compliance context for integration events
 */
export interface GDPRIntegrationContext {
  /** Does payload contain personally identifiable information? */
  containsPII: boolean;

  /** Legal basis for processing (GDPR Art. 6) */
  legalBasis:
    | 'consent'
    | 'contract'
    | 'legal_obligation'
    | 'vital_interests'
    | 'public_task'
    | 'legitimate_interest';

  /** Retention period in days */
  retentionPeriod: number;

  /** Purpose of data processing */
  processingPurpose: string;
}

/**
 * Security context for integration events
 */
export interface SecurityIntegrationContext {
  /** Bounded context that issued the event */
  issuedBy: string;

  /** Prevent duplicate processing? */
  requiresDeduplication: boolean;

  /** Security level for routing decisions */
  securityLevel: 'public' | 'internal' | 'confidential' | 'restricted';

  /** Encrypt payload before storage/transmission? */
  encryptionRequired: boolean;
}

/**
 * Integration metadata for event tracing
 */
export interface IntegrationEventMetadata {
  /** Correlation ID for request tracing across contexts */
  correlationId: string;

  /** Causation ID for event chain tracking (optional) */
  causationId?: string;

  /** When the event occurred */
  occurredAt: Date;
}
```

---

## 🚨 Event Emission Pattern - WHERE to Emit

**CRITICAL**: Integration events are emitted by **HANDLERS or SERVICES**, NEVER by aggregates.

### Pattern 1: Domain Event Handler → Integration Event (RECOMMENDED)

**When to use**: Complex flows, cross-context communication, async processing

**Flow**:
```
Aggregate → Domain Event → Domain Event Handler → Integration Event → Cross-Context Handler
```

**Example**: Trust Delta Emission

```typescript
// 1. Aggregate emits DOMAIN event
export class CommentAggregate extends AggregateRoot<string> {
  public moderate(decision: ModerationDecision): Result<void, Error> {
    // ... business logic ...

    // ✅ Emit DOMAIN event from aggregate
    this.apply(new CommentModeratedEvent({
      piiData: { /* ... */ },
      anonymizedData: { /* ... */ },
      businessData: {
        commentId: this.id.value,
        userId: this._userId.value,
        moderationLevel: decision.level,
        // ... other data
      },
      cryptoShredding: { /* ... */ }
    }));

    return Result.ok(undefined);
  }
}

// 2. Domain Event Handler emits INTEGRATION event
@EventHandler(CommentModeratedEvent)
export class EngagementTrustDeltaEmitterHandler {
  constructor(
    @Inject(UNIVERSAL_EVENT_DISPATCHER_TOKEN)
    private readonly eventDispatcher: IEventDispatcher
  ) {}

  async handle(event: CommentModeratedEvent): Promise<void> {
    // Calculate trust delta (business logic)
    const delta = this.calculateTrustDelta(event);

    // ✅ Emit INTEGRATION event from handler
    const integrationEvent = new ContextTrustDeltaIntegrationEvent(
      event.getUserId(),
      'engagement', // source context
      previousScore,
      newScore,
      delta,
      'comment_moderated',
      new Date()
    );

    await this.eventDispatcher.dispatchEvent(integrationEvent);
  }
}
```

**Real example**: `src/contexts/engagement/application/event-handlers/engagement-trust-delta-emitter.handler.ts:256`

---

### Pattern 2: Domain Event Handler → BullMQ Job (ASYNC Processing)

**When to use**: Async processing (moderation, notifications), background jobs

**Flow**:
```
Aggregate → Domain Event → Domain Event Handler → BullMQ Job → Consumer
```

**Example**: Content Moderation

```typescript
// 1. Aggregate emits DOMAIN event
export class CommentAggregate extends AggregateRoot<string> {
  public static create(/* ... */): Result<CommentAggregate, Error> {
    const comment = new CommentAggregate(/* ... */);

    // ✅ Emit DOMAIN event from aggregate
    comment.apply(new CommentCreatedEvent({
      piiData: { contentHash: '...' },
      anonymizedData: { contentLength: 150 },
      businessData: {
        commentId: id.value,
        userId: userId.value,
        content: 'First 100 chars...',
      },
      cryptoShredding: { /* ... */ }
    }));

    return Result.ok(comment);
  }
}

// 2. Domain Event Handler enqueues BullMQ job
@EventHandler(CommentCreatedEvent)
export class ModerateCommentHandler extends BaseModerateContentHandler<CommentCreatedEvent> {
  constructor(
    @InjectQueue('moderation') private readonly moderationQueue: Queue
  ) {}

  protected getJobName(): string {
    return 'moderate.comment';
  }

  protected extractModerationData(event: CommentCreatedEvent): ModerationData | null {
    return {
      contentId: event.getCommentId(),
      userId: event.getUserId(),
      content: event.getContentPreview(),
      metadata: { /* ... */ }
    };
  }

  // ✅ Base class enqueues job to BullMQ
  // Job processed asynchronously by ModerationConsumer
}
```

**Real example**: `src/contexts/engagement/application/event-handlers/moderate-comment.handler.ts`

---

### Pattern 3: Command Handler → Integration Event (SIMPLIFIED - MVP)

**When to use**: Simple 1:1 mappings, MVP velocity, no intermediate transformation

**Flow**:
```
Command Handler → Integration Event → Cross-Context Handler
```

**Example**: Email Verification

```typescript
@CommandHandler(VerifyEmailCommand)
export class VerifyEmailHandler extends BaseCommandHandler {
  constructor(
    private readonly userRepository: IUserRepository,
    @Inject(UNIVERSAL_EVENT_DISPATCHER_TOKEN)
    private readonly eventDispatcher: IEventDispatcher
  ) {}

  async executeBusinessLogic(command: VerifyEmailCommand): Promise<Result<void, Error>> {
    // 1. Domain logic
    const user = await this.userRepository.findById(command.userId);
    const verifyResult = user.verifyEmail(command.token);
    if (verifyResult.isFailure) return Result.fail(verifyResult.error);

    // 2. Save aggregate (domain events auto-emitted)
    await this.userRepository.save(user);

    // 3. ✅ Emit INTEGRATION event directly from handler
    const integrationEvent = new EmailVerifiedIntegrationEvent(
      command.userId,
      user.getEmail().value,
      'email_link',
      new Date()
    );
    await this.eventDispatcher.dispatchEvent(integrationEvent);

    return Result.ok(undefined);
  }
}
```

**Note**: This pattern is simpler but less common in current codebase. Use Pattern 1 for consistency.

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

## Usage Example: Emission from Domain Service

**File**: `src/contexts/geographic-auth/domain/services/trust-delta-emitter.service.ts`

**Scenario**: User verifies home address → +15 trust points

```typescript
import { Injectable } from '@nestjs/common';
import { Result } from '@vytches/ddd';
import { ContextTrustDeltaIntegrationEvent } from '@shared/domain/integration-events';

@Injectable()
export class TrustDeltaEmitterService {
  constructor(
    private readonly integrationEventPublisher: IntegrationEventPublisher,
    private readonly trustDeltaRepository: ITrustDeltaRepository
  ) {}

  /**
   * Emit trust delta if dual threshold met
   *
   * BR-TRUST-DELTA-001:
   * - Emit if |delta| >= 10 points OR
   * - Emit if daysSinceLastEmit >= 7 days
   */
  async emitTrustDeltaIfThresholdMet(
    userId: string,
    previousScore: number,
    newScore: number,
    reason: string
  ): Promise<Result<void>> {
    const delta = newScore - previousScore;

    // Create event
    const event = new ContextTrustDeltaIntegrationEvent(
      userId,
      'geographic-auth', // Source context
      previousScore,
      newScore,
      delta,
      reason,
      new Date(),
      {
        verificationType: 'home_address',
        verificationMethod: 'postGIS_boundary_check'
      }
    );

    // Check POINT threshold (Condition 1)
    if (event.meetsPointThreshold()) {
      return await this.publishEvent(event);
    }

    // Check TIME threshold (Condition 2)
    const lastEmittedAt = await this.trustDeltaRepository.getLastEmissionTime(userId);
    if (lastEmittedAt && event.meetsTimeThreshold(lastEmittedAt)) {
      return await this.publishEvent(event);
    }

    // Neither threshold met - skip emission
    return Result.ok();
  }

  private async publishEvent(
    event: ContextTrustDeltaIntegrationEvent
  ): Promise<Result<void>> {
    // Publish to outbox (transactional)
    const publishResult = await this.integrationEventPublisher.publish(event);

    if (publishResult.isFailure) {
      return Result.fail(publishResult.error);
    }

    // Record emission timestamp for time threshold
    await this.trustDeltaRepository.recordEmission(
      event.userId,
      event.integrationMetadata.occurredAt
    );

    return Result.ok();
  }
}
```

---

## Usage in Event Handler (Consumption)

**File**: `src/contexts/authorization/application/event-handlers/context-trust-delta.handler.ts`

**Scenario**: Authorization context receives trust delta, updates global score

```typescript
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { ContextTrustDeltaIntegrationEvent } from '@shared/domain/integration-events';
import { Result } from '@vytches/ddd';

@EventsHandler(ContextTrustDeltaIntegrationEvent)
export class ContextTrustDeltaHandler implements IEventHandler<ContextTrustDeltaIntegrationEvent> {
  constructor(
    private readonly globalTrustRepository: IGlobalTrustRepository,
    private readonly verificationLevelService: VerificationLevelService,
    private readonly logger: ILogger
  ) {}

  async handle(event: ContextTrustDeltaIntegrationEvent): Promise<void> {
    this.logger.info('Processing trust delta', {
      userId: event.userId,
      sourceContext: event.sourceContext,
      delta: event.delta,
      correlationId: event.integrationMetadata.correlationId,
    });

    try {
      // 1. Update global trust score (sum of all context scores)
      const updateResult = await this.globalTrustRepository.applyDelta(
        event.userId,
        event.sourceContext,
        event.delta
      );

      if (updateResult.isFailure) {
        throw new Error(updateResult.error.message);
      }

      // 2. Check if verification level threshold crossed
      const newGlobalScore = updateResult.value;
      await this.verificationLevelService.reevaluateVerificationLevel(
        event.userId,
        newGlobalScore
      );

      // 3. Log successful processing
      this.logger.info('Trust delta processed successfully', {
        userId: event.userId,
        newGlobalScore,
        correlationId: event.integrationMetadata.correlationId,
      });

    } catch (error) {
      this.logger.error('Failed to process trust delta', {
        userId: event.userId,
        error: (error as Error).message,
        correlationId: event.integrationMetadata.correlationId,
      });
      throw error; // Retry mechanism will handle
    }
  }
}
```

---

---

## BullMQ Per-Context Consumer Pattern (TS-INFRA-002)

> **STATUS**: This is the CANONICAL pattern for integration event consumption as of TS-INFRA-002.
> The old `IntegrationEventsQueueProcessor` (single shared processor + eventDispatcher) has been
> REPLACED by per-context processors calling commandBus directly.

### Problem with the old pattern

```
// ❌ OLD: Single shared queue + eventDispatcher (BROKEN)
// - eventDispatcher.dispatchEvent() only calls @EventHandler-decorated handlers
// - 4 contexts (CC, NE, Engagement, GeoAuth) had no @EventHandler → never called
// - One retry = ALL contexts retry (no independent failure isolation)
@Processor(QueueName.INTEGRATION_EVENTS)
export class IntegrationEventsQueueProcessor extends WorkerHost {
  async process(job): Promise<void> {
    await this.eventDispatcher.dispatchEvent(integrationEvent); // ❌ broken
  }
}
```

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

    const routingTable: Record<string, Queue[]> = {
      UserRegisteredIntegrationEvent: [this.trustQueue, this.userProfileQueue, this.ccQueue, this.neQueue, this.engQueue, this.geoQueue],
      EmailVerifiedIntegrationEvent: [this.authQueue],
      UserDisplayNameUpdatedIntegrationEvent: [this.ccQueue, this.neQueue, this.engQueue, this.geoQueue],
      UserProfileUpdatedIntegrationEvent: [this.ccQueue, this.neQueue, this.engQueue, this.geoQueue],
      UserRoleChangedIntegrationEvent: [this.ccQueue, this.neQueue, this.engQueue, this.geoQueue],
      UserTrustScoreUpdatedIntegrationEvent: [this.authQueue, this.userProfileQueue],
      TrustScoreUpdateRequestedIntegrationEvent: [this.trustQueue],
      ModerationSuspensionRequestedIntegrationEvent: [this.trustQueue],
      PaymentCompletedIntegrationEvent: [this.ccQueue, this.neQueue, this.engQueue],
      ClubSubscriptionActivatedIntegrationEvent: [this.ccQueue, this.neQueue],
      ClubSubscriptionExpiredIntegrationEvent: [this.ccQueue],
      ClubSubscriptionFinallyExpiredIntegrationEvent: [this.ccQueue],
    };

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
    switch (eventName) {
      case 'UserRegisteredIntegrationEvent':
        await this.commandBus.execute(new CreateUserReadModelCommand(
          payload.userId as string, payload.displayName as string | undefined,
          payload.email as string, payload.registrationMethod as string,
        ));
        break;
      case 'UserDisplayNameUpdatedIntegrationEvent':
        await this.commandBus.execute(new UpdateUserDisplayNameCommand(
          payload.userId as string, payload.displayName as string, payload.avatarUrl as string | null,
        ));
        break;
      case 'UserProfileUpdatedIntegrationEvent':
        await this.commandBus.execute(new SyncUserProfileCommand(payload.userId as string, payload.profileChanges));
        break;
      case 'UserRoleChangedIntegrationEvent':
        await this.commandBus.execute(new SyncUserRoleCommand(payload.userId as string, payload.newRole as string));
        break;
      default:
        // Unknown event for this context — log and skip (do NOT throw)
        break;
    }
  }
}
```

**Step 3 — Register processor in context module**

```typescript
// src/contexts/geographic-auth/geographic-auth.module.ts
@Module({
  imports: [
    BullModule.registerQueue({ name: QueueName.INTEGRATION_GEOGRAPHIC_AUTH }),
  ],
  providers: [
    GeoAuthIntegrationProcessor, // ← add to providers
    // ... other providers
  ],
})
export class GeographicAuthModule {}
```

**Step 4 — Emitters use IntegrationEventFanOutService instead of direct queue**

```typescript
// ❌ OLD:
await this.integrationEventsQueue.add('user-registered', jobData, { attempts: 3 });

// ✅ NEW:
await this.fanOutService.fanOut(jobData);
```

### Key rules for per-context processors

1. **NEVER use `eventDispatcher`** — call `commandBus.execute()` directly
2. **Switch on `eventName`** — each processor handles all events for its context
3. **`default:` case must NOT throw** — unknown events logged and skipped
4. **JobId = `{eventName}:{correlationId}:{contextName}`** — idempotency via BullMQ deduplication
5. **Retry config**: `attempts: 5`, `backoff: { type: 'exponential', delay: 2000 }`, `removeOnFail: 200`
6. **500ms delay** preserved — add `await new Promise(r => setTimeout(r, 500))` before processing in each processor (same FK-commit-wait rationale as old processor)

### Routing Table (canonical — TS-INFRA-002)

See `project-orchestration/tasks/TS-INFRA-002-bullmq-integration-events-fan-out.md` for
the complete event→context routing matrix. The `IntegrationEventFanOutService` is the
SINGLE source of truth for routing — `targetContexts` field in job data is deprecated.

---

## Decision Tree: When to Use Integration Events

```
Is this event for cross-bounded-context communication?
├─ YES → Does it involve trust score synchronization?
│         ├─ YES → ContextTrustDeltaIntegrationEvent
│         │         - Dual threshold: |delta| >= 10 OR days >= 7
│         │         - GDPR: containsPII=false, legalBasis=legitimate_interest
│         │         - Primitive types only
│         │
│         └─ NO → Does it require GDPR/Security context?
│                  ├─ YES → Create new ProjectIntegrationEvent subclass
│                  │         - Follow ContextTrustDelta pattern
│                  │         - Define GDPR and security contexts
│                  │         - Use primitive types
│                  │
│                  └─ NO → Use simple integration event (if no compliance needs)
│
└─ NO → Is this a domain state change?
         ├─ YES → Domain Event (Aggregate.apply())
         │         - See domain-event-pattern.md
         │
         └─ NO → System Event (technical, not business)
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

### ❌ Business Logic in Handler

```typescript
// ❌ WRONG: Business logic in handler
@EventsHandler(ContextTrustDeltaIntegrationEvent)
export class ContextTrustDeltaHandler implements IEventHandler {
  async handle(event: ContextTrustDeltaIntegrationEvent): Promise<void> {
    // ❌ Business rule in handler
    if (Math.abs(event.delta) < 10) {
      return; // Skip small deltas
    }
    // Process event...
  }
}

// ✅ CORRECT: Business logic in event class
@EventsHandler(ContextTrustDeltaIntegrationEvent)
export class ContextTrustDeltaHandler implements IEventHandler {
  async handle(event: ContextTrustDeltaIntegrationEvent): Promise<void> {
    // ✅ Business rule in event class
    // Handler only processes events that SHOULD be emitted
    await this.globalTrustRepository.applyDelta(
      event.userId,
      event.sourceContext,
      event.delta
    );
  }
}

// Emission logic checks thresholds BEFORE publishing
if (event.meetsPointThreshold() || event.meetsTimeThreshold(lastEmit)) {
  await this.integrationEventPublisher.publish(event);
}
```

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
- [ ] Static `eventName` field (routing key)
- [ ] Static `VERSION` field (schema evolution)
- [ ] GDPR context defined with all 4 fields
- [ ] Security context defined with all 4 fields
- [ ] Factory method `fromPayload()` implemented
- [ ] Business logic methods in event class (NOT handler)
- [ ] Flexible metadata using Record<string, unknown>
- [ ] correlationId and causationId support
- [ ] Event registered in handler with @EventsHandler decorator
- [ ] GDPR compliance validated (containsPII vs encryptionRequired)

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
| **Examples** | ContextTrustDelta | UserResidenceVerified |

---

**Real Production Code**: `src/shared/domain/integration-events/context-trust-delta.integration-event.ts`

**Business Rule**: BR-TRUST-DELTA-001 (Dual Threshold Pattern)

**References**:
- ADR-0025 (Hybrid Event System)
- `.claude/knowledge/patterns/domain/domain-event-pattern.md`
- ContextTrustDeltaIntegrationEvent (real production code)
- ProjectIntegrationEvent base class

**Status**: ✅ PRODUCTION - Pattern actively used in Geographic-Auth and Authorization contexts

**Pattern Version**: 2.0 (2026-01-04) - Replaced fictional examples with real production code
