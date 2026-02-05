# Domain Event Pattern

## 🎯 Problem

**Challenges with domain event implementation**:
- PII mixed with business data → GDPR compliance violations
- Missing crypto-shredding metadata → data retention issues
- No correlation IDs → distributed tracing impossible
- Inconsistent event naming across contexts
- Missing event getters → handlers access undefined data
- Event deserialization failures → missing events in repository eventMap

**Real-world pain points**:
- **Production GDPR audit failure**: Email stored in business data instead of piiData → compliance violation
- **Missing event in eventMap**: UserProfileUpdatedEvent not registered → runtime error when loading aggregate
- **No correlation ID**: Cannot trace request flow across contexts → debugging nightmare
- **Undefined data access**: Handler called `event.getUserId()` before checking if business data exists → null pointer

---

## ✅ Solution

**Domain Event pattern with**:
- GDPR data segregation: `piiData`, `anonymizedData`, `businessData`, `cryptoShredding`
- `ProjectDomainEvent<PII, Anonymized, Business>` extension
- **Per-context enum**: Static `EVENT_NAME` and instance `eventName` use context-specific enum (TS-EVENTS-002)
- Event versioning: `eventVersion` field
- Correlation ID in all business data
- Getter methods with undefined checks
- Constructor sets `aggregateId` from business data
- Crypto-shredding metadata: `piiFields`, `retentionPeriod`, `isShredded`

---

## 🔧 Implementation

### Example 1: CommentCreatedEvent (GDPR Segregation Pattern)

**File**: `src/contexts/engagement/domain/events/comment-created.event.ts`

**Key characteristics**:
- 4-part GDPR segregation (piiData, anonymizedData, businessData, cryptoShredding)
- Content hash in PII for spam detection
- Anonymized analytics data (hour, dayOfWeek, trust tier)
- Correlation ID for distributed tracing
- 7-year retention (Polish legal requirements)

```typescript
import { ProjectDomainEvent, type ModerationStatusEnum } from '@shared/domain';
import type { TargetTypeEnum } from '../value-objects/target-reference.vo';
import { EngagementEventNames } from './event-names.enum'; // ✅ Import context enum

export type TrustTier = 'ELITE' | 'TRUSTED' | 'NORMAL' | 'FLAGGED' | 'SUSPENDED';

// 1. ✅ PII Data - contains user-identifying information
export interface CommentCreatedPiiData {
  userIdHash: string; // SHA256 hash for duplicate detection
  contentHash: string; // SHA256 of content for spam detection
}

// 2. ✅ Anonymized Data - ML/Analytics safe (NO PII)
export interface CommentCreatedAnonymizedData {
  targetType: TargetTypeEnum; // 'event' | 'alert' | 'job-request'
  contentLength: number;
  nestingLevel: number; // 0, 1, 2, 3
  trustTier: TrustTier; // Moderation routing tier
  hourOfDay: number; // 0-23 for time-based analytics
  dayOfWeek: number; // 0-6 for pattern analysis
  isReply: boolean;
}

// 3. ✅ Business Data - Full details for audit and handlers
export interface CommentCreatedBusinessData {
  commentId: string;
  userId: string; // Actual user ID (business need)
  targetType: TargetTypeEnum;
  targetId: string;
  targetOwnerId?: string; // For notifications
  parentCommentId?: string; // If reply
  parentCommentAuthorId?: string; // For notifications
  contentPreview: string; // First 100 chars for notifications
  nestingLevel: number;
  verificationLevel: number; // Trust score
  moderationStatus: ModerationStatusEnum;
  correlationId: string; // ✅ CRITICAL: Distributed tracing
  createdAt: Date;
}

// 4. ✅ Event Props - Combined structure
export interface CommentCreatedEventProps {
  piiData: CommentCreatedPiiData;
  anonymizedData: CommentCreatedAnonymizedData;
  businessData: CommentCreatedBusinessData;
  cryptoShredding: {
    piiFields: string[]; // Fields to crypto-shred on retention expiry
    retentionPeriod: number; // Days (2555 = 7 years Polish law)
    isShredded: boolean; // Whether PII has been shredded
  };
}

/**
 * CommentCreatedEvent - Emitted when new comment is posted
 *
 * Handlers:
 * - ModerationQueueHandler: Route to moderation pipeline
 * - NotificationHandler: Notify target owner and parent author
 * - EngagementAnalyticsHandler: Track comment metrics
 * - EngagementAuditHandler: GDPR compliance audit trail
 */
export class CommentCreatedEvent extends ProjectDomainEvent<
  CommentCreatedPiiData,
  CommentCreatedAnonymizedData,
  CommentCreatedBusinessData
> {
  // 5. ✅ Static EVENT_NAME using context enum (TS-EVENTS-002)
  public static readonly EVENT_NAME = EngagementEventNames.COMMENT_CREATED;
  // 6. ✅ Instance eventName using same enum value
  public override readonly eventName = EngagementEventNames.COMMENT_CREATED;
  public readonly eventVersion = 1;

  constructor(props: CommentCreatedEventProps) {
    super(props);
    // 7. ✅ Set aggregateId from business data
    (this as any).aggregateId = props.businessData.commentId;
  }

  // 7. ✅ Getter methods with undefined checks
  getCommentId(): string {
    return this.getBusinessData()?.commentId || '';
  }

  getUserId(): string {
    return this.getBusinessData()?.userId || '';
  }

  getTargetType(): TargetTypeEnum | undefined {
    return this.getBusinessData()?.targetType;
  }

  getTargetOwnerId(): string | undefined {
    return this.getBusinessData()?.targetOwnerId;
  }

  getParentCommentId(): string | undefined {
    return this.getBusinessData()?.parentCommentId;
  }

  getParentCommentAuthorId(): string | undefined {
    return this.getBusinessData()?.parentCommentAuthorId;
  }

  getContentPreview(): string {
    return this.getBusinessData()?.contentPreview || '';
  }

  getNestingLevel(): number {
    return this.getBusinessData()?.nestingLevel ?? 0;
  }

  getVerificationLevel(): number {
    return this.getBusinessData()?.verificationLevel ?? 0;
  }

  // 8. ✅ Query methods for handler logic
  isReply(): boolean {
    return !!this.getParentCommentId();
  }

  isTopLevel(): boolean {
    return !this.isReply();
  }

  shouldNotifyTargetOwner(): boolean {
    return !!this.getTargetOwnerId() && this.isTopLevel();
  }

  shouldNotifyParentAuthor(): boolean {
    return this.isReply() && !!this.getParentCommentAuthorId();
  }

  getTrustTier(): TrustTier | undefined {
    return this.getAnonymizedData()?.trustTier;
  }
}
```

---

### Example 2: ServiceOfferingModeratedEvent (Moderation Pattern)

**File**: `src/contexts/neighborhood-economy/domain/service-offerings/events/service-offering-moderated.event.ts`

**Key characteristics**:
- Status transition tracking (previousStatus → newStatus)
- Moderation level metadata (L0/L1/L2/SKIPPED)
- Confidence score (0.00-1.00)
- Category classification (spam, fraud, inappropriate)
- Reason field for human-readable explanation

```typescript
import {
  ProjectDomainEvent,
  type ModerationLevelEnum,
  type ModerationStatusEnum,
} from '@shared/domain';
import { NeighborhoodEconomyEventNames } from '../../../events/event-names.enum'; // ✅ Import context enum

// 1. ✅ PII Data - minimal for business content
export interface ServiceOfferingModeratedPiiData {
  // Service offerings are business content - no user PII needed
}

// 2. ✅ Anonymized Data - ML/Analytics safe
export interface ServiceOfferingModeratedAnonymizedData {
  serviceType: string;
  previousStatus: ModerationStatusEnum;
  newStatus: ModerationStatusEnum;
  moderationLevel: ModerationLevelEnum; // L0, L1, L2, SKIPPED
  category?: string; // spam, fraud, inappropriate, etc.
  confidence?: number; // 0.00-1.00 (ML model confidence)
  hourOfDay: number;
  dayOfWeek: number;
}

// 3. ✅ Business Data - Full moderation details
export interface ServiceOfferingModeratedBusinessData {
  serviceOfferingId: string;
  userId: string; // Service provider
  serviceType: string;
  previousStatus: ModerationStatusEnum;
  newStatus: ModerationStatusEnum;
  moderationLevel: ModerationLevelEnum;
  category?: string;
  confidence?: number;
  reason?: string; // Human-readable reason (for rejection notifications)
  moderatedAt: Date;
  correlationId: string; // ✅ Distributed tracing
}

export interface ServiceOfferingModeratedEventProps {
  piiData: ServiceOfferingModeratedPiiData;
  anonymizedData: ServiceOfferingModeratedAnonymizedData;
  businessData: ServiceOfferingModeratedBusinessData;
  cryptoShredding: {
    piiFields: string[];
    retentionPeriod: number;
    isShredded: boolean;
  };
}

export class ServiceOfferingModeratedEvent extends ProjectDomainEvent<
  ServiceOfferingModeratedPiiData,
  ServiceOfferingModeratedAnonymizedData,
  ServiceOfferingModeratedBusinessData
> {
  // ✅ Static EVENT_NAME using context enum (TS-EVENTS-002)
  public static readonly EVENT_NAME = NeighborhoodEconomyEventNames.SERVICE_OFFERING_MODERATED;
  // ✅ Instance eventName using same enum value
  public override readonly eventName = NeighborhoodEconomyEventNames.SERVICE_OFFERING_MODERATED;
  public readonly eventVersion = 1;

  constructor(props: ServiceOfferingModeratedEventProps) {
    super(props);
    (this as any).aggregateId = props.businessData.serviceOfferingId;
  }

  // Getters...
  getServiceOfferingId(): string {
    return this.getBusinessData()?.serviceOfferingId || '';
  }

  getUserId(): string {
    return this.getBusinessData()?.userId || '';
  }

  override getServiceType(): string {
    return this.getBusinessData()?.serviceType || '';
  }

  getPreviousStatus(): ModerationStatusEnum | undefined {
    return this.getBusinessData()?.previousStatus;
  }

  getNewStatus(): ModerationStatusEnum | undefined {
    return this.getBusinessData()?.newStatus;
  }

  getModerationLevel(): ModerationLevelEnum | undefined {
    return this.getBusinessData()?.moderationLevel;
  }

  getCategory(): string | undefined {
    return this.getBusinessData()?.category;
  }

  getConfidence(): number | undefined {
    return this.getBusinessData()?.confidence;
  }

  getReason(): string | undefined {
    return this.getBusinessData()?.reason;
  }

  // ✅ Query methods for handler decisions
  wasApproved(): boolean {
    return this.getNewStatus() === 'approved';
  }

  wasRejected(): boolean {
    return this.getNewStatus() === 'rejected';
  }

  wasEscalated(): boolean {
    return this.getNewStatus() === 'escalated';
  }

  wasHidden(): boolean {
    return this.getNewStatus() === 'hidden';
  }

  wasAutomated(): boolean {
    const level = this.getModerationLevel();
    return level === 'L0' || level === 'L1';
  }

  wasHumanModerated(): boolean {
    return this.getModerationLevel() === 'L2';
  }

  wasModerationSkipped(): boolean {
    return this.getModerationLevel() === 'SKIPPED';
  }

  // ✅ Trust feedback integration
  shouldUpdateTrust(): boolean {
    return this.wasApproved() || this.wasRejected();
  }

  getTrustFeedbackValue(): number {
    if (this.wasApproved()) return 1; // Positive trust signal
    if (this.wasRejected()) return -5; // Negative trust signal
    return 0;
  }

  // ✅ Notification logic
  shouldNotifyProvider(): boolean {
    return (
      this.wasRejected() ||
      this.wasHidden() ||
      (this.wasApproved() && this.getPreviousStatus() === 'escalated')
    );
  }

  // ✅ Confidence checks
  wasHighConfidence(): boolean {
    return (this.getConfidence() ?? 0) > 0.9;
  }

  wasLowConfidence(): boolean {
    return (this.getConfidence() ?? 1) < 0.6;
  }
}
```

---

## 📋 Rules

### MUST

1. **Extend `ProjectDomainEvent<PII, Anonymized, Business>`**
2. **GDPR segregation**: ALL events have `piiData`, `anonymizedData`, `businessData`, `cryptoShredding`
3. **Per-context enum (TS-EVENTS-002)**:
   - Import context enum: `import { AuthEventNames } from './event-names.enum'`
   - Static EVENT_NAME: `public static readonly EVENT_NAME = AuthEventNames.USER_REGISTERED`
   - Instance eventName: `public override readonly eventName = AuthEventNames.USER_REGISTERED`
4. **Event version**: `public readonly eventVersion = 1`
5. **Correlation ID**: ALL business data includes `correlationId: string`
6. **Set aggregateId**: Constructor sets `(this as any).aggregateId = props.businessData.{id}`
7. **Getter methods**: ALL business data fields have getter methods with undefined checks
8. **Crypto-shredding metadata**: `piiFields`, `retentionPeriod`, `isShredded` in ALL events
9. **Timestamps**: `createdAt`, `updatedAt`, or action-specific timestamp in business data
10. **Query methods**: Add helper methods for handler decision logic (e.g., `wasApproved()`)
11. **⚠️ Audit handler**: Create/update audit handler for Tier 1 events per ADR-0027 (see `audit-handler-pattern.md`)

### MUST NOT

1. **NEVER mix PII with business data** - strict segregation required
2. **NEVER missing correlation ID** - distributed tracing essential
3. **NEVER access data without undefined check** - use getters
4. **NEVER hardcoded strings in eventMap** - use context enum (TS-EVENTS-002)
5. **NEVER duplicate event names** - single source of truth in enum
6. **NEVER missing crypto-shredding** - GDPR compliance requirement
7. **NEVER missing event registration** - all events in repository eventMap
8. **NEVER skip audit handler for Tier 1 events** - GDPR Article 30 compliance (see ADR-0027)

---

## ⚠️ Anti-Patterns

### 1. PII Mixed with Business Data (GDPR Violation)

```typescript
// ❌ WRONG: Email in business data
export interface UserRegisteredBusinessData {
  userId: string;
  email: string; // ❌ PII in business data!
  registrationMethod: string;
  createdAt: Date;
}

// ✅ CORRECT: Email in piiData
export interface UserRegisteredPiiData {
  email: string; // ✅ PII segregated
  verificationToken: string;
}

export interface UserRegisteredBusinessData {
  userId: string; // ✅ Only non-PII
  registrationMethod: string;
  correlationId: string;
  createdAt: Date;
}

export interface UserRegisteredEventProps {
  piiData: UserRegisteredPiiData;
  anonymizedData: { registrationMethod: string; hour: number };
  businessData: UserRegisteredBusinessData;
  cryptoShredding: {
    piiFields: ['email', 'verificationToken'], // ✅ Mark PII for shredding
    retentionPeriod: 2555, // 7 years
    isShredded: false,
  };
}
```

---

### 2. Missing Correlation ID (No Distributed Tracing)

```typescript
// ❌ WRONG: No correlation ID
export interface CommentCreatedBusinessData {
  commentId: string;
  userId: string;
  content: string;
  createdAt: Date;
  // ❌ Missing correlationId!
}

// ✅ CORRECT: Correlation ID present
export interface CommentCreatedBusinessData {
  commentId: string;
  userId: string;
  content: string;
  correlationId: string; // ✅ For distributed tracing
  createdAt: Date;
}

// In aggregate:
import { AppUtils } from '@shared/utils/app-utils';

this.apply(
  new CommentCreatedEvent({
    // ...
    businessData: {
      // ...
      correlationId: AppUtils.getUUID(), // ✅ Generate correlation ID
      createdAt: new Date(),
    },
  })
);
```

---

### 3. Missing Getter Undefined Checks (Null Pointer Risk)

```typescript
// ❌ WRONG: Direct property access
export class CommentCreatedEvent extends ProjectDomainEvent<...> {
  getUserId(): string {
    return this.businessData.userId; // ❌ Can be undefined!
  }
}

// Handler crashes when businessData is undefined
const userId = event.getUserId(); // ❌ Runtime error!

// ✅ CORRECT: Getter with undefined check
export class CommentCreatedEvent extends ProjectDomainEvent<...> {
  getUserId(): string {
    return this.getBusinessData()?.userId || ''; // ✅ Safe fallback
  }
}

// Handler works even if data missing
const userId = event.getUserId(); // ✅ Returns empty string if undefined
```

---

### 4. Missing Crypto-Shredding Metadata (GDPR Compliance)

```typescript
// ❌ WRONG: No crypto-shredding metadata
this.apply(
  new UserRegisteredEvent({
    piiData: { email: 'user@example.com' },
    anonymizedData: { hour: 14 },
    businessData: { userId: 'uuid', createdAt: new Date() },
    // ❌ Missing cryptoShredding!
  })
);

// ✅ CORRECT: Crypto-shredding metadata present
this.apply(
  new UserRegisteredEvent({
    piiData: { email: 'user@example.com', verificationToken: 'token123' },
    anonymizedData: { registrationMethod: 'email', hour: 14 },
    businessData: { userId: 'uuid', correlationId: AppUtils.getUUID(), createdAt: new Date() },
    cryptoShredding: {
      piiFields: ['email', 'verificationToken'], // ✅ Which fields to shred
      retentionPeriod: 2555, // ✅ 7 years (Polish law)
      isShredded: false, // ✅ Initial state
    },
  })
);
```

---

### 5. Hardcoded Strings in EventMap (TS-EVENTS-002 Violation)

```typescript
// ❌ WRONG: Hardcoded strings in eventMap
const eventMap: Record<string, any> = {
  'engagement.comment.created': CommentCreatedEvent, // ❌ String duplication!
  'engagement.comment.edited': CommentEditedEvent,
};

const EventClass = eventMap[plainEvent.eventName]; // Works but no type safety

// ✅ CORRECT: Use context enum with computed property syntax (TS-EVENTS-002)
import { EngagementEventNames } from '../../domain/events/event-names.enum';

const eventMap: Record<string, any> = {
  [EngagementEventNames.COMMENT_CREATED]: CommentCreatedEvent, // ✅ Type-safe, single source of truth
  [EngagementEventNames.COMMENT_EDITED]: CommentEditedEvent,
  [EngagementEventNames.COMMENT_DELETED]: CommentDeletedEvent,
  [EngagementEventNames.COMMENT_MODERATED]: CommentModeratedEvent,
};

const EventClass = eventMap[plainEvent.eventName]; // ✅ Type-safe lookup!
if (!EventClass) {
  throw new Error(
    `Unknown event: ${plainEvent.eventName}. Available: ${Object.keys(eventMap).join(', ')}`
  );
}
```

**Benefits of enum pattern**:
- ✅ Single source of truth (event name in one place)
- ✅ Compile-time validation (typos caught at build time)
- ✅ IDE autocomplete (developer experience)
- ✅ Safe refactoring (rename symbol, not find/replace)

---

### 6. Missing Event in Repository EventMap (Runtime Error)

```typescript
// ❌ WRONG: Event not registered in eventMap
// In repository:
import { EngagementEventNames } from '../../domain/events/event-names.enum';

const eventMap: Record<string, any> = {
  [EngagementEventNames.COMMENT_CREATED]: CommentCreatedEvent,
  [EngagementEventNames.COMMENT_EDITED]: CommentEditedEvent,
  // ❌ Missing COMMENT_MODERATED!
};

// Later: Loading aggregate with CommentModeratedEvent
const aggregate = await repository.findById(id);
// ❌ Runtime error: Unknown event: engagement.comment.moderated

// ✅ CORRECT: ALL events registered (3-layer protection)
// Layer 1: Imports (alphabetical)
import {
  CommentCreatedEvent,
  CommentDeletedEvent,
  CommentEditedEvent,
  CommentModeratedEvent, // ✅ Imported
} from '../../domain/events';
import { EngagementEventNames } from '../../domain/events/event-names.enum';

// Layer 2: EventMap registration using enum (TS-EVENTS-002)
const eventMap: Record<string, any> = {
  [EngagementEventNames.COMMENT_CREATED]: CommentCreatedEvent,
  [EngagementEventNames.COMMENT_DELETED]: CommentDeletedEvent,
  [EngagementEventNames.COMMENT_EDITED]: CommentEditedEvent,
  [EngagementEventNames.COMMENT_MODERATED]: CommentModeratedEvent, // ✅ Registered
};

// Layer 3: Verification test (see repository-events-pattern.md)
```

---

## 📚 References

### ADRs
- **ADR-0025**: Hybrid Event System - Domain events within transaction
- **GDPR Compliance**: Crypto-shredding for PII retention management

### Implementation Files
- `src/contexts/engagement/domain/events/comment-created.event.ts`
- `src/contexts/neighborhood-economy/domain/service-offerings/events/service-offering-moderated.event.ts`
- `src/contexts/auth/domain/events/user-registered.event.ts`
- `src/shared/domain/events/project-domain-event.ts` (base class)

### Related Patterns
- **aggregate-pattern.md** - Aggregates emit domain events
- **repository-events-pattern.md** - 3-layer protection for event registration
- **domain-errors-pattern.md** - Error codes in failure events
- **audit-handler-pattern.md** - ⚠️ MANDATORY: Audit handlers for Tier 1 events (ADR-0027)

---

## 🎯 When to Use

### Use Domain Events When

✅ **State change in aggregate**: Entity created, updated, deleted
✅ **Business process trigger**: Order placed → send confirmation email
✅ **Cross-aggregate coordination**: User registered → create geographic profile
✅ **Audit trail**: GDPR compliance requires event history
✅ **Analytics**: Track user behavior, business metrics
✅ **Integration**: Notify other contexts via integration events

### Use Integration Events Instead When

❌ **Cross-context communication**: Use integration events (async, after transaction commit)
❌ **External systems**: Webhook notifications, third-party integrations

### Use System Events Instead When

❌ **Infrastructure concerns**: Logging, monitoring, health checks
❌ **Technical events**: Cache invalidation, background jobs

---

**Version**: 1.2
**Created**: 2026-01-04
**Last Updated**: 2026-01-30
**Maintained By**: @project-orchestrator
**Primary Users**: domain-application-implementer, infrastructure-testing-implementer, code-quality-verifier

**v1.2 Changes** (2026-01-30):
- **TS-EVENTS-002**: Per-context event name enums pattern
  - MUST rule #3 updated: Use context enum for EVENT_NAME and eventName
  - MUST NOT rules #4-5: No hardcoded strings, use enum single source of truth
  - Anti-pattern #5: Hardcoded strings → Use enum with computed property syntax
  - Anti-pattern #6: Updated to show enum usage in eventMap
  - Code examples updated: CommentCreatedEvent and ServiceOfferingModeratedEvent use enums
  - Benefits: Type safety, IDE autocomplete, safe refactoring, single source of truth

**v1.1 Changes** (2026-01-13):
- Added MUST rule #11: Audit handler for Tier 1 events (ADR-0027)
- Added MUST NOT rule #7: NEVER skip audit handler for Tier 1 events
- Added Related Pattern: audit-handler-pattern.md (MANDATORY)
