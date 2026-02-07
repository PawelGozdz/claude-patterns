# Aggregate Pattern

## 🎯 Problem

**Challenges with aggregate implementation**:
- Inconsistent construction patterns (factory vs constructor)
- Missing GDPR event segregation in domain events
- Format validation leaking into domain (violates ADR-0021)
- Infrastructure dependencies (async DB calls) in aggregates
- Exception throwing instead of Result pattern
- Missing specification context getters for policy evaluation

**Real-world pain points**:
- Production bug: Aggregate threw exception instead of returning Result → unhandled error in transaction
- GDPR compliance: Missing crypto-shredding metadata in events → audit failure
- Test complexity: Aggregates with async methods impossible to unit test
- Policy evaluation: Missing context getters → policies can't access aggregate state

---

## ✅ Solution

**Aggregate pattern with**:
- `AggregateRoot<string>` extension from @vytches/ddd
- Dual construction: `create()` for new entities, `reconstituteFromPersistence()` for database hydration
- Result pattern: ALL methods return `Result<T, DomainError>`, NEVER throw
- GDPR event segregation: `piiData`, `anonymizedData`, `businessData`, `cryptoShredding`
- Specification context: Getters for policy validation
- Synchronous domain logic: NO async operations, NO infrastructure dependencies
- Business rules only: Format validation delegated to value objects (ADR-0021)

---

## 🔧 Implementation

### Example 1: CommentAggregate (Engagement Context)

**File**: `src/contexts/engagement/domain/aggregates/comment.aggregate.ts` (752 lines)

**Key characteristics**:
- Trust-based moderation routing (5 tiers: ELITE/TRUSTED/NORMAL/FLAGGED/SUSPENDED)
- Threading structure: max 3 nesting levels
- Factory methods: `create()`, `createReply()`, `reconstituteFromPersistence()`
- Domain methods: `edit()`, `delete()`, `applyModerationDecision()`
- Query methods: `isDeleted()`, `isVisible()`, `isApproved()`

```typescript
import { AggregateRoot, Result } from '@vytches/ddd';
import { UserId, ModerationStatus } from '@shared/domain';
import { CommentContent, CommentId, NestingLevel, TargetReference } from '../value-objects';
import { CommentCreatedEvent, CommentEditedEvent, CommentModeratedEvent } from '../events';

export interface CommentProps {
  userId: UserId;
  content: CommentContent;
  target: TargetReference;
  targetOwnerId?: string;
  parentCommentId?: CommentId;
  nestingLevel: NestingLevel;
  moderationStatus: ModerationStatus;
  verificationLevel: number;
  editCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export class CommentAggregate extends AggregateRoot<string> {
  // 1. ✅ Private fields with underscore prefix
  private _userId: UserId;
  private _content: CommentContent;
  private _target: TargetReference;
  private _moderationStatus: ModerationStatus;
  private _nestingLevel: NestingLevel;
  private _verificationLevel: number;
  private _editCount: number;
  private _createdAt: Date;
  private _updatedAt: Date;

  // 2. ✅ Private constructor - NEVER called directly
  constructor(id: CommentId, props: CommentProps, version?: number) {
    super({ id, version });
    this._userId = props.userId;
    this._content = props.content;
    this._target = props.target;
    this._moderationStatus = props.moderationStatus;
    this._nestingLevel = props.nestingLevel;
    this._verificationLevel = props.verificationLevel;
    this._editCount = props.editCount;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  // 3. ✅ Public getters (immutability)
  get id(): CommentId { return CommentId.create(super.id.value); }
  get userId(): UserId { return this._userId; }
  get content(): CommentContent { return this._content; }
  get moderationStatus(): ModerationStatus { return this._moderationStatus; }
  get nestingLevel(): NestingLevel { return this._nestingLevel; }
  get verificationLevel(): number { return this._verificationLevel; }

  // 4. ✅ Factory method for NEW aggregates (emits domain event)
  public static create(
    userId: UserId,
    content: CommentContent,
    target: TargetReference,
    targetOwnerId: string | undefined,
    verificationLevel: number
  ): Result<CommentAggregate, EngagementValidationError> {
    // Business rule validation
    if (verificationLevel < 40) {
      return Result.fail(
        EngagementValidationError.insufficientTrustLevel(40, verificationLevel)
      );
    }

    const id = CommentId.create();
    const now = new Date();
    const nestingLevel = NestingLevel.topLevel();

    // Determine moderation status based on trust tier
    const trustTier = this.getTrustTier(verificationLevel);
    const moderationStatus = trustTier === 'ELITE'
      ? ModerationStatus.skipped()
      : ModerationStatus.pending();

    const comment = new CommentAggregate(
      id,
      {
        userId,
        content,
        target,
        targetOwnerId,
        nestingLevel,
        moderationStatus,
        verificationLevel,
        editCount: 0,
        createdAt: now,
        updatedAt: now,
      }
    );

    // 5. ✅ Emit domain event with GDPR segregation
    comment.apply(
      new CommentCreatedEvent({
        piiData: {
          userIdHash: crypto.createHash('sha256').update(userId.value).digest('hex'),
          contentHash: content.hash,
        },
        anonymizedData: {
          targetType: target.type,
          contentLength: content.length,
          nestingLevel: nestingLevel.getLevel(),
          trustTier,
          hourOfDay: now.getHours(),
          dayOfWeek: now.getDay(),
          isReply: false,
        },
        businessData: {
          commentId: id.value,
          userId: userId.value,
          targetType: target.type,
          targetId: target.id,
          targetOwnerId,
          nestingLevel: nestingLevel.getLevel(),
          verificationLevel,
          moderationStatus: moderationStatus.status,
          contentPreview: content.preview,
          correlationId: AppUtils.getUUID(),
          createdAt: now,
        },
        cryptoShredding: {
          piiFields: ['userIdHash', 'contentHash'],
          retentionPeriod: 2555, // 7 years Polish law
          isShredded: false,
        },
      })
    );

    return Result.ok(comment);
  }

  // 6. ✅ Factory method for database HYDRATION (NO events)
  public static reconstituteFromPersistence(
    id: CommentId,
    props: CommentProps,
    version: number
  ): CommentAggregate {
    return new CommentAggregate(id, props, version);
  }

  // 7. ✅ Domain method with Result pattern
  public edit(newContent: CommentContent): Result<void, EngagementValidationError> {
    // Validation: Cannot edit deleted comment
    if (this._deletedAt) {
      return Result.fail(EngagementValidationError.cannotEditDeletedComment());
    }

    // Validation: Content unchanged
    if (this._content.equals(newContent)) {
      return Result.fail(EngagementValidationError.contentUnchanged());
    }

    // Validation: Max 5 edits
    if (this._editCount >= 5) {
      return Result.fail(EngagementValidationError.maxEditsReached(5));
    }

    // Apply changes
    this._content = newContent;
    this._editCount++;
    this._updatedAt = new Date();

    // Emit event
    this.apply(
      new CommentEditedEvent({
        piiData: { contentHash: newContent.hash },
        anonymizedData: {
          contentLength: newContent.length,
          editNumber: this._editCount,
          hourOfDay: this._updatedAt.getHours(),
        },
        businessData: {
          commentId: this.id.value,
          userId: this._userId.value,
          editCount: this._editCount,
          contentPreview: newContent.preview,
          correlationId: AppUtils.getUUID(),
          editedAt: this._updatedAt,
        },
        cryptoShredding: {
          piiFields: ['contentHash'],
          retentionPeriod: 2555,
          isShredded: false,
        },
      })
    );

    return Result.ok(undefined);
  }

  // 8. ✅ Domain method with moderation integration
  public applyModerationDecision(
    newStatus: ModerationStatus,
    level: ModerationLevelEnum,
    category?: string,
    confidence?: number,
    reason?: string
  ): Result<void, EngagementValidationError> {
    const previousStatus = this._moderationStatus.status;

    // Validation: Cannot moderate deleted content
    if (this._deletedAt) {
      return Result.fail(EngagementValidationError.cannotModerateDeletedComment());
    }

    // Apply moderation
    this._moderationStatus = newStatus;
    this._updatedAt = new Date();

    // Emit event
    this.apply(
      new CommentModeratedEvent({
        piiData: {},
        anonymizedData: {
          previousStatus,
          newStatus: newStatus.status,
          moderationLevel: level,
          category,
          confidence,
          hourOfDay: this._updatedAt.getHours(),
          dayOfWeek: this._updatedAt.getDay(),
        },
        businessData: {
          commentId: this.id.value,
          userId: this._userId.value,
          previousStatus,
          newStatus: newStatus.status,
          moderationLevel: level,
          category,
          confidence,
          reason,
          correlationId: AppUtils.getUUID(),
          moderatedAt: this._updatedAt,
        },
        cryptoShredding: {
          piiFields: [],
          retentionPeriod: 2555,
          isShredded: false,
        },
      })
    );

    return Result.ok(undefined);
  }

  // 9. ✅ Query methods (no side effects)
  public isDeleted(): boolean {
    return !!this._deletedAt;
  }

  public isVisible(): boolean {
    return !this._deletedAt && this._moderationStatus.isApproved();
  }

  public isApproved(): boolean {
    return this._moderationStatus.isApproved();
  }

  public canHaveReplies(): boolean {
    return this._nestingLevel.canHaveReplies() && this.isVisible();
  }

  // 10. ✅ Specification context getter (for policy evaluation)
  public getSpecificationContext() {
    return {
      userId: this._userId.value,
      content: this._content,
      moderationStatus: this._moderationStatus,
      verificationLevel: this._verificationLevel,
      nestingLevel: this._nestingLevel.getLevel(),
      isDeleted: this.isDeleted(),
    };
  }

  // 11. ✅ Pure calculation (no state mutation)
  private static getTrustTier(verificationLevel: number): TrustTier {
    if (verificationLevel >= 90) return 'ELITE';
    if (verificationLevel >= 70) return 'TRUSTED';
    if (verificationLevel >= 40) return 'NORMAL';
    if (verificationLevel >= 20) return 'FLAGGED';
    return 'SUSPENDED';
  }
}
```

---

### Example 2: UserIdentityAggregate (Auth Context)

**File**: `src/contexts/auth/domain/aggregates/user-identity.aggregate.ts` (936 lines)

**Key characteristics**:
- Factory methods: `create()`, `createWithSocialLogin()`, `reconstituteFromPersistence()`
- Email verification workflow with token management
- Session management with multiple active sessions
- Password management with bcrypt hashing (via value object)

```typescript
export class UserIdentityAggregate extends AggregateRoot<string> {
  private _email: Email;
  private _password: HashedPassword;
  private _isEmailVerified: boolean;
  private _verificationToken?: string;
  private _verificationTokenExpiry?: Date;
  private _registrationMethod: RegistrationMethod;
  private _createdAt: Date;
  private _updatedAt: Date;

  // Factory: New user registration
  public static create(
    email: Email,
    password: HashedPassword,
    registrationMethod: RegistrationMethod
  ): Result<UserIdentityAggregate, AuthDomainError> {
    const id = UserId.create();
    const now = new Date();
    const verificationToken = this.generateVerificationToken();
    const tokenExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h

    const user = new UserIdentityAggregate(
      id,
      {
        email,
        password,
        isEmailVerified: false,
        verificationToken,
        verificationTokenExpiry: tokenExpiry,
        registrationMethod,
        createdAt: now,
        updatedAt: now,
      }
    );

    user.apply(new UserRegisteredEvent({ /* GDPR segregated */ }));
    return Result.ok(user);
  }

  // Domain method: Verify email
  public verifyEmail(token: string): Result<void, AuthDomainError> {
    // Validation: Already verified
    if (this._isEmailVerified) {
      return Result.fail(new EmailAlreadyVerifiedError());
    }

    // Validation: Token mismatch
    if (this._verificationToken !== token) {
      return Result.fail(new InvalidVerificationTokenError());
    }

    // Validation: Token expired
    if (this._verificationTokenExpiry && new Date() > this._verificationTokenExpiry) {
      return Result.fail(new VerificationTokenExpiredError());
    }

    // Apply verification
    this._isEmailVerified = true;
    this._verificationToken = undefined;
    this._verificationTokenExpiry = undefined;
    this._updatedAt = new Date();

    this.apply(new EmailVerifiedEvent({ /* GDPR segregated */ }));
    return Result.ok(undefined);
  }
}
```

---

## 📋 Rules

### MUST

1. **Extend `AggregateRoot<string>`** from @vytches/ddd
2. **Private constructor** - NEVER called directly by clients
3. **Factory methods**:
   - `create()` for NEW aggregates → emits domain event
   - `reconstituteFromPersistence()` for database hydration → NO events
4. **Result pattern**: ALL methods return `Result<T, DomainError>`, NEVER throw
5. **GDPR event segregation**: ALL events include `piiData`, `anonymizedData`, `businessData`, `cryptoShredding`
6. **Specification context getter**: `getSpecificationContext()` for policy evaluation
7. **Synchronous logic**: NO async operations, NO infrastructure dependencies
8. **Business rules only**: Format validation in value objects (ADR-0021)
9. **Private fields**: Use `_fieldName` prefix, expose via public getters
10. **Event application**: Use `this.apply(new DomainEvent(...))` for ALL state changes
11. **🚨 CRITICAL: Emit ONLY domain events** - Aggregates emit domain events, NEVER integration events

### MUST NOT

1. **NEVER throw exceptions** - always use Result pattern
2. **NEVER async methods** - aggregates must be synchronous
3. **NEVER infrastructure dependencies** - no DB, HTTP, external services
4. **NEVER format validation** - delegate to value objects (ADR-0021)
5. **NEVER direct constructor calls** - always use factory methods
6. **NEVER missing GDPR segregation** - ALL events must segregate data
7. **NEVER missing crypto-shredding metadata** - required for GDPR compliance
8. **🚨 CRITICAL: NEVER emit integration events from aggregates** - Use `this.apply(DomainEvent)` only, NOT `this.apply(IntegrationEvent)`

---

## ⚠️ Anti-Patterns

### 1. Throwing Exceptions

```typescript
// ❌ WRONG: Throws exception
public updateEmail(email: Email): void {
  if (!this._isEmailVerified) {
    throw new Error('Email not verified');
  }
  this._email = email;
}

// ✅ CORRECT: Returns Result
public updateEmail(email: Email): Result<void, AuthDomainError> {
  if (!this._isEmailVerified) {
    return Result.fail(new EmailNotVerifiedError());
  }
  this._email = email;
  this.apply(new EmailUpdatedEvent({ /* ... */ }));
  return Result.ok(undefined);
}
```

---

### 2. Async Operations in Aggregate

```typescript
// ❌ WRONG: Async database query in aggregate
public async changeEmail(email: Email): Promise<Result<void>> {
  const exists = await this.repository.emailExists(email); // ❌ Infrastructure!
  if (exists) return Result.fail(new EmailExistsError());
  this._email = email;
  return Result.ok(undefined);
}

// ✅ CORRECT: Handler checks uniqueness, aggregate applies change
// In handler:
const exists = await this.repository.emailExists(email);
if (exists) return Result.fail(new EmailExistsError());

const result = aggregate.changeEmail(email); // Synchronous!
if (result.isFailure) return result;

await this.repository.save(aggregate);
```

---

### 3. Format Validation in Domain (Violates ADR-0021)

```typescript
// ❌ WRONG: Regex validation in aggregate
public updateEmail(emailStr: string): Result<void, AuthDomainError> {
  if (!/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(emailStr)) {
    return Result.fail(new InvalidEmailFormatError());
  }
  this._email = Email.create(emailStr).value;
  return Result.ok(undefined);
}

// ✅ CORRECT: Format validation in value object or Zod schema
// Value object:
export class Email extends BaseValueObject<string> {
  static create(email: string): Result<Email, ValidationError> {
    if (!/^[\w-\.]+@/.test(email)) { // Format check in VO
      return Result.fail(new InvalidEmailFormatError());
    }
    return Result.ok(new Email(email));
  }
}

// Aggregate receives validated VO:
public updateEmail(email: Email): Result<void, AuthDomainError> {
  if (this._email.equals(email)) {
    return Result.fail(new EmailUnchangedError());
  }
  this._email = email;
  return Result.ok(undefined);
}
```

---

### 4. 🚨 CRITICAL: Emitting Integration Events from Aggregate

```typescript
// ❌ WRONG: Aggregate emits integration event
export class UserAggregate extends AggregateRoot<string> {
  public register(email: Email): Result<void, AuthDomainError> {
    // ... business logic ...

    // ❌ Integration event from aggregate!
    this.apply(new UserRegisteredIntegrationEvent({
      userId: this.id.value,
      email: email.toString(),
      occurredAt: new Date(),
    }));

    return Result.ok(undefined);
  }
}

// ✅ CORRECT: Aggregate emits domain event, handler emits integration event
export class UserAggregate extends AggregateRoot<string> {
  public register(email: Email): Result<void, AuthDomainError> {
    // ... business logic ...

    // ✅ Domain event from aggregate
    this.apply(new UserRegisteredEvent({
      piiData: { email: email.toString() },
      anonymizedData: { registrationMethod: 'email' },
      businessData: { userId: this.id.value, correlationId: '...' },
      cryptoShredding: { /* ... */ }
    }));

    return Result.ok(undefined);
  }
}

// Handler listens to domain event and emits integration event
@EventHandler(UserRegisteredEvent)
export class UserRegisteredIntegrationHandler {
  async handle(event: UserRegisteredEvent): Promise<void> {
    // ✅ Integration event from handler
    const integrationEvent = new UserRegisteredIntegrationEvent({
      userId: event.getUserId(),
      occurredAt: event.getOccurredAt(),
    });
    await this.eventDispatcher.dispatchEvent(integrationEvent);
  }
}
```

**Why this is critical**:
- Aggregates are **domain core** - they model business concepts
- Integration events are **infrastructure** - they enable cross-context communication
- Mixing these violates **DDD bounded context isolation**
- Integration events should be emitted by **domain event handlers** or **command handlers**

---

### 5. Missing GDPR Event Segregation

```typescript
// ❌ WRONG: No data segregation
this.apply(
  new UserRegisteredEvent({
    userId: id.value,
    email: email.toString(), // ❌ PII mixed with business data
    registrationMethod: 'email',
    createdAt: now,
  })
);

// ✅ CORRECT: GDPR segregation
this.apply(
  new UserRegisteredEvent({
    piiData: {
      email: email.toString(),
      verificationToken: token,
    },
    anonymizedData: {
      registrationMethod: 'email',
      registrationHour: now.getHours(),
      dayOfWeek: now.getDay(),
    },
    businessData: {
      userId: id.value,
      correlationId: AppUtils.getUUID(),
      createdAt: now,
    },
    cryptoShredding: {
      piiFields: ['email', 'verificationToken'],
      retentionPeriod: 2555, // 7 years
      isShredded: false,
    },
  })
);
```

---

### 5. Direct Constructor Usage

```typescript
// ❌ WRONG: Direct constructor call
const comment = new CommentAggregate(id, props); // ❌ No event emitted!

// ✅ CORRECT: Factory method
const result = CommentAggregate.create(userId, content, target, ownerId, verificationLevel);
if (result.isFailure) return result.error;
const comment = result.value; // ✅ Event emitted
```

---

## 📚 References

### ADRs
- **ADR-0013**: Hybrid Error Handling - Result pattern in domain
- **ADR-0021**: Validation Layer Separation - Format validation at trusted boundary (NOT domain)
- **ADR-0025**: Hybrid Event System - Domain events within transaction
- **ADR-0035**: Specification-First Testing Strategy

### Implementation Files
- `src/contexts/engagement/domain/aggregates/comment.aggregate.ts` (752L)
- `src/contexts/auth/domain/aggregates/user-identity.aggregate.ts` (936L)
- `src/contexts/geographic-auth/domain/aggregates/user-residence.aggregate.ts` (1154L)
- `src/contexts/community-communication/domain/aggregates/event.aggregate.ts`

### Related Patterns
- **value-object-pattern.md** - Value object construction and validation
- **domain-event-pattern.md** - GDPR event segregation details
- **domain-errors-pattern.md** - ProjectErrorCode enum usage
- **command-handler-pattern.md** - Handler orchestration with aggregates
- **repository-pattern.md** - Aggregate persistence and optimistic locking

---

## 🎯 When to Use

### Use Aggregates When

✅ **Business rule enforcement**: Complex multi-field validation (e.g., "event end > start")
✅ **State transitions**: Status changes with business constraints
✅ **Transactional consistency**: Multiple fields must change atomically
✅ **Domain events**: State changes that trigger side effects
✅ **Invariant protection**: Rules that ALWAYS hold (e.g., "max 3 nesting levels")

### Use Value Objects Instead When

❌ **Format validation only**: Email format, phone number format → Value Object
❌ **Single field**: Simple string/number with format rules → Value Object
❌ **No state changes**: Immutable calculation → Value Object method

### Use Specifications Instead When

❌ **Cross-aggregate rules**: "User can comment if trust >= 40" → Specification in Policy
❌ **Reusable validation**: Same rule used in multiple contexts → Shared Specification
❌ **Test isolation**: Want to test rule without aggregate → Specification unit test

---

**Version**: 1.0
**Created**: 2026-01-04
**Last Updated**: 2026-01-04
**Maintained By**: @project-orchestrator
**Primary Users**: domain-application-implementer, code-quality-verifier
