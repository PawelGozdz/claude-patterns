# Entity Pattern

## 🎯 Problem

**Challenges with entity implementation**:
- Confusion Entity vs Aggregate (when to use which?)
- Identity-based equality (not value-based like VOs)
- Simple business logic without domain events
- Mutable state without event sourcing overhead
- Child entities within aggregates

**Real-world pain points**:
- **Overengineering**: Using Aggregate when simple Entity would suffice → unnecessary event sourcing overhead
- **Equality bugs**: Comparing entities by value instead of identity → duplicate entities not detected
- **Missing validation**: Entities without `isValid()` → runtime errors
- **Direct constructor**: Public constructor bypassing validation → invalid state

---

## ✅ Solution

**Entity pattern with**:
- `BaseEntity<TProps, TId>` extension (NOT AggregateRoot)
- Identity-based equality (`equals()` compares IDs only)
- Factory methods: `create()`, `reconstruct()`
- Result pattern: Returns `Result<T, Error>`
- NO domain events (simple state changes)
- Specification-based validation
- Mutable state (unlike Value Objects)

---

## 🔧 Implementation

### Example 1: InstitutionalAnnouncementEntity (Simple CRUD Entity)

**File**: `src/contexts/community-communication/domain/institutional-announcements/entities/institutional-announcement.entity.ts`

**Key characteristics**:
- NO complex business invariants
- NO domain events (simple CRUD lifecycle)
- NO internal entity collection
- Lightweight operations: create, read, update, status management
- Uses specifications for validation

```typescript
import { BaseEntity, EntityId, Result } from '@vytches/ddd';

/**
 * WHY NOT AN AGGREGATE:
 * - No complex business invariants (unlike EventAggregate with capacity/RSVP)
 * - No domain events needed (simple CRUD lifecycle)
 * - No internal entity collection (unlike Event with attendees)
 * - Lightweight operations: create, read, update content, delete
 */

interface InstitutionalAnnouncementProps {
  authorId: ActorId;           // WHO OWNS - individual or organization
  createdBy: UserId;            // WHO CREATED - always individual for audit
  neighborhoodId: string;
  announcementContent: AnnouncementContent; // VO
  category: AnnouncementCategory;           // VO
  severity: AnnouncementSeverity;           // VO
  source: NoticeSource;                     // VO
  createdAt: Date;
  expiresAt: Date;
  viewCount: number;
  status: AnnouncementStatus;   // VO
  resolvedAt?: Date;
  resolvedBy?: UserId;
  resolutionReason?: string;
}

export class InstitutionalAnnouncement extends BaseEntity<
  InstitutionalAnnouncementProps,
  EntityId
> {
  // ============================================
  // Factory Method: create()
  // ============================================
  public static create(
    authorId: ActorId,
    createdBy: UserId,
    neighborhoodId: string,
    announcementContent: AnnouncementContent,
    category: AnnouncementCategory,
    severity: AnnouncementSeverity,
    source: NoticeSource,
    expiresInHours: number = 24,
    organizationId?: string
  ): InstitutionalAnnouncement {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000);

    // Use specification to validate expiration limits (BR-COMM-INST-005)
    const validationContext = createAnnouncementSpecificationContext({
      createdAt: now,
      expiresAt,
      severity: severity.getSeverityLevel(),
      category: category.value,
      contentLength: announcementContent.content.length,
      isOfficial: source.isEmergencyService() || source.isMunicipality(),
    });

    const expirationSpec = new ExpirationWithinLimitsSpecification();
    if (!expirationSpec.isSatisfiedBy(validationContext)) {
      throw InstitutionalAnnouncementValidationError.invalidRange(
        'expiresInHours',
        1,
        MAX_EXPIRATION_HOURS
      );
    }

    const id = BaseEntityId.createWithRandomUUID();

    return new InstitutionalAnnouncement(
      {
        authorId,
        createdBy,
        neighborhoodId,
        organizationId,
        announcementContent,
        category,
        severity,
        source,
        createdAt: now,
        expiresAt,
        viewCount: 0,
        status: AnnouncementStatus.active(),
      },
      id
    );
  }

  // ============================================
  // Factory Method: reconstruct() (from DB)
  // ============================================
  public static reconstruct(
    props: InstitutionalAnnouncementProps,
    id: EntityId
  ): InstitutionalAnnouncement {
    return new InstitutionalAnnouncement(props, id);
  }

  // ============================================
  // Business Methods (NO domain events!)
  // ============================================

  /**
   * Update announcement content
   *
   * Business Rules (via Specifications):
   * - Announcement must be ACTIVE
   * - Announcement must not be expired
   */
  updateContent(newContent: AnnouncementContent): void {
    if (!this.props.status.isActive()) {
      throw InstitutionalAnnouncementValidationError.notActive();
    }

    const context = this.createSpecificationContext();
    const notExpiredSpec = new AnnouncementNotExpiredSpecification();

    if (!notExpiredSpec.isSatisfiedBy(context)) {
      throw InstitutionalAnnouncementValidationError.alreadyExpired();
    }

    // Direct mutation (NO domain event)
    this.props.announcementContent = newContent;
  }

  /**
   * Increment view count (called when announcement is viewed)
   */
  incrementViewCount(): void {
    this.props.viewCount += 1;  // Direct mutation
  }

  /**
   * Resolve announcement (manually by creator)
   */
  public resolve(
    resolvedBy: UserId,
    reason?: string
  ): Result<void, InstitutionalAnnouncementValidationError> {
    if (this.props.status.isResolved()) {
      return Result.fail(InstitutionalAnnouncementValidationError.alreadyResolved());
    }

    if (!this.props.status.isActive()) {
      return Result.fail(InstitutionalAnnouncementValidationError.notActive());
    }

    // Direct mutation (NO domain event)
    this.props.status = AnnouncementStatus.resolved();
    this.props.resolvedAt = new Date();
    this.props.resolvedBy = resolvedBy;
    this.props.resolutionReason = reason;

    return Result.ok();
  }

  // ============================================
  // Specification Support
  // ============================================

  /**
   * Create specification context from entity state
   */
  private createSpecificationContext(): AnnouncementSpecificationContext {
    return createAnnouncementSpecificationContext({
      createdAt: this.props.createdAt,
      expiresAt: this.props.expiresAt,
      severity: this.props.severity.getSeverityLevel(),
      category: this.props.category.value,
      contentLength: this.props.announcementContent.content.length,
      isOfficial: this.props.source.isEmergencyService() || this.props.source.isMunicipality(),
    });
  }

  public getSpecificationContext(): AnnouncementSpecificationContext {
    return this.createSpecificationContext();
  }

  // ============================================
  // Query Methods
  // ============================================

  isExpired(): boolean {
    const context = this.createSpecificationContext();
    const notExpiredSpec = new AnnouncementNotExpiredSpecification();
    return !notExpiredSpec.isSatisfiedBy(context);
  }

  requiresPushNotification(): boolean {
    return this.props.severity.requiresPushNotification();
  }

  isOfficial(): boolean {
    return this.props.source.isMunicipality() || this.props.source.isEmergencyService();
  }

  // ============================================
  // Getters
  // ============================================

  get authorId(): ActorId {
    return this.props.authorId;
  }

  get announcementContent(): AnnouncementContent {
    return this.props.announcementContent;
  }

  get status(): AnnouncementStatus {
    return this.props.status;
  }

  // ... more getters

  // ============================================
  // Validation (Required by BaseEntity)
  // ============================================

  public isValid(): boolean {
    return (
      !!this.props.authorId &&
      !!this.props.createdBy &&
      !!this.props.neighborhoodId &&
      !!this.props.announcementContent &&
      !!this.props.category &&
      !!this.props.severity &&
      !!this.props.source &&
      !!this.props.createdAt &&
      !!this.props.expiresAt &&
      !!this.props.status
    );
  }
}
```

---

### Example 2: BaseEntity Implementation

**File**: `src/shared/domain/base-entity.ts`

**Key characteristics**:
- Generic typing: `<TProps, TId>`
- Identity-based equality
- Protected constructor
- Abstract `isValid()` method

```typescript
import { EntityId } from '@vytches/ddd';

/**
 * Base class for all domain entities.
 *
 * Entities are objects that have a distinct identity that runs through time
 * and different representations. Their identity is not defined by their attributes.
 */
export abstract class BaseEntity<TProps = any, TId extends EntityId = EntityId> {
  protected readonly _id: TId;
  protected readonly _props: TProps;

  protected constructor(props: TProps, id: TId) {
    this._id = id;
    this._props = props;
  }

  // ============================================
  // Identity
  // ============================================

  public getId(): TId {
    return this._id;
  }

  public get id(): string {
    return this._id.toString();
  }

  protected get props(): TProps {
    return this._props;
  }

  // ============================================
  // Equality (CRITICAL: by identity, NOT value)
  // ============================================

  /**
   * Two entities are equal if they have the same ID
   * (different from Value Objects - equal by value)
   */
  public equals(other: BaseEntity<any, any>): boolean {
    if (!other || !(other instanceof BaseEntity)) {
      return false;
    }

    if (this === other) {
      return true;
    }

    // Entities are equal if they have the same ID
    return this._id.equals(other._id);
  }

  // ============================================
  // Hash & String
  // ============================================

  public hashCode(): string {
    return `${this.constructor.name}:${this._id.toString()}`;
  }

  public toString(): string {
    return `${this.constructor.name}(${this._id.toString()})`;
  }

  // ============================================
  // Validation (MUST implement in subclasses)
  // ============================================

  public abstract isValid(): boolean;
}
```

---

## 📋 Rules

### MUST

1. **Extend `BaseEntity<TProps, TId>`** (NOT AggregateRoot)
2. **Identity-based equality**: Override `equals()` to compare IDs only
3. **Factory methods**: `create()` for new instances, `reconstruct()` from DB
4. **Private constructor**: Force use of factory methods
5. **Implement `isValid()`**: Required by BaseEntity abstract method
6. **Use specifications**: Delegate validation to specifications
7. **Result pattern**: Return `Result<T, Error>` from methods
8. **Getters for props**: Expose properties via getters
9. **Mutable state**: Direct mutation of props (NO event sourcing)
10. **Type safety**: Generic typing `<TProps, TId extends EntityId>`

### MUST NOT

1. **NO domain events** - entities are lightweight, aggregates emit events
2. **NO public constructor** - use factory methods
3. **NO value-based equality** - entities equal by ID, not props
4. **NO business logic in constructor** - use factory method + validation
5. **NO throwing from create()** - return Result or throw domain error
6. **NO async operations** - entities are synchronous
7. **NO infrastructure** - entities are pure domain

---

## ⚠️ Anti-Patterns

### 1. Using Aggregate When Entity Would Suffice

```typescript
// ❌ WRONG: Aggregate for simple CRUD
export class InstitutionalAnnouncement extends AggregateRoot<string> {
  public static create(...): InstitutionalAnnouncement {
    const announcement = new InstitutionalAnnouncement(...);

    // ❌ Unnecessary event sourcing overhead
    announcement.apply(new AnnouncementCreatedEvent(...));

    return announcement;
  }

  updateContent(newContent: AnnouncementContent): void {
    this._content = newContent;

    // ❌ Event overhead for simple CRUD
    this.apply(new AnnouncementContentUpdatedEvent(...));
  }
}

// ✅ CORRECT: Entity for simple CRUD (NO events)
export class InstitutionalAnnouncement extends BaseEntity<...> {
  public static create(...): InstitutionalAnnouncement {
    const id = BaseEntityId.createWithRandomUUID();

    // ✅ No event sourcing overhead
    return new InstitutionalAnnouncement({ ... }, id);
  }

  updateContent(newContent: AnnouncementContent): void {
    if (!this.props.status.isActive()) {
      throw InstitutionalAnnouncementValidationError.notActive();
    }

    // ✅ Direct mutation, NO events
    this.props.announcementContent = newContent;
  }
}
```

---

### 2. Value-Based Equality (Entity Bug)

```typescript
// ❌ WRONG: Comparing entities by value
export class InstitutionalAnnouncement extends BaseEntity<...> {
  public equals(other: InstitutionalAnnouncement): boolean {
    // ❌ Value-based equality (should be ID-based)
    return (
      this.props.announcementContent.equals(other.props.announcementContent) &&
      this.props.category.equals(other.props.category) &&
      this.props.severity.equals(other.props.severity)
    );
  }
}

// Result: Two announcements with same content but different IDs are "equal"
const announcement1 = InstitutionalAnnouncement.create(...); // ID: "abc-123"
const announcement2 = InstitutionalAnnouncement.create(...); // ID: "def-456"

announcement1.equals(announcement2); // ❌ Returns true (WRONG!)

// ✅ CORRECT: Identity-based equality (inherited from BaseEntity)
export class InstitutionalAnnouncement extends BaseEntity<...> {
  // ✅ Uses BaseEntity.equals() - compares IDs only
}

announcement1.equals(announcement2); // ✅ Returns false (different IDs)
```

---

### 3. Public Constructor

```typescript
// ❌ WRONG: Public constructor (bypasses validation)
export class InstitutionalAnnouncement extends BaseEntity<...> {
  public constructor(props: InstitutionalAnnouncementProps, id: EntityId) {
    super(props, id);
  }
}

// Can create invalid entity directly:
const announcement = new InstitutionalAnnouncement(
  { expiresAt: new Date('1999-01-01') }, // ❌ Expired!
  id
);

// ✅ CORRECT: Private constructor + factory methods
export class InstitutionalAnnouncement extends BaseEntity<...> {
  private constructor(props: InstitutionalAnnouncementProps, id: EntityId) {
    super(props, id);
  }

  public static create(...): InstitutionalAnnouncement {
    // ✅ Validation in factory method
    const expirationSpec = new ExpirationWithinLimitsSpecification();
    if (!expirationSpec.isSatisfiedBy(context)) {
      throw InstitutionalAnnouncementValidationError.invalidRange(...);
    }

    return new InstitutionalAnnouncement({ ... }, id);
  }
}
```

---

### 4. Missing isValid() Implementation

```typescript
// ❌ WRONG: No isValid() implementation
export class InstitutionalAnnouncement extends BaseEntity<...> {
  // ❌ Abstract method not implemented
}

// Compilation error: "Class 'InstitutionalAnnouncement' must implement abstract method 'isValid()'"

// ✅ CORRECT: Implement isValid()
export class InstitutionalAnnouncement extends BaseEntity<...> {
  public isValid(): boolean {
    return (
      !!this.props.authorId &&
      !!this.props.createdBy &&
      !!this.props.neighborhoodId &&
      !!this.props.announcementContent &&
      !!this.props.category &&
      !!this.props.severity &&
      !!this.props.source &&
      !!this.props.createdAt &&
      !!this.props.expiresAt &&
      !!this.props.status
    );
  }
}
```

---

## 📚 References

### ADRs
- **ADR-0013**: Hybrid Error Handling - Result pattern in domain layer
- **ADR-0021**: Trusted Boundary - NO format validation in entity

### Implementation Files
- `src/shared/domain/base-entity.ts` (base class)
- `src/contexts/community-communication/domain/institutional-announcements/entities/institutional-announcement.entity.ts`

### Related Patterns
- **aggregate-pattern.md** - When to use Aggregate instead (complex invariants, events)
- **value-object-pattern.md** - Value Objects are immutable, entities are mutable
- **specification-policy-pattern.md** - Specification-based validation

---

## 🎯 When to Use

### Use Entity When

✅ **Simple CRUD operations**: Create, read, update, delete without complex business rules
✅ **NO domain events needed**: State changes don't require audit trail or cross-context notification
✅ **NO complex invariants**: Simple validation rules (e.g., expiration date, status)
✅ **Child entity within aggregate**: Entities owned by aggregate root (e.g., OrderLine within Order)
✅ **Identity matters**: Two objects with same properties are NOT the same (unlike Value Objects)

### Use Aggregate Instead When

❌ **Complex business invariants**: Multi-field validation, cross-entity rules
❌ **Domain events required**: State changes must trigger other processes
❌ **Internal entity collection**: Managing multiple child entities with consistency
❌ **Transaction boundary**: Aggregate root enforces consistency
❌ **Event sourcing**: Need audit trail of all state changes

### Decision Tree

```
Does object have identity (ID)?
├─ NO → Value Object
└─ YES → Entity or Aggregate?
    ├─ Simple CRUD + NO events → Entity
    └─ Complex rules OR events → Aggregate
```

---

**Version**: 1.0
**Created**: 2026-01-04
**Last Updated**: 2026-01-04
**Maintained By**: @localhero-project-orchestrator
**Primary Users**: domain-application-implementer, code-quality-verifier
