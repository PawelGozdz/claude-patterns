# Value Object Pattern

## 🎯 Problem

**Challenges with value object implementation**:
- Inconsistent validation patterns across contexts
- Missing normalization (whitespace, case sensitivity)
- Format validation leaking into aggregates (violates ADR-0021)
- Primitive obsession (using strings/numbers instead of typed values)
- Missing equality comparison logic
- Mutable value objects breaking immutability guarantees

**Real-world pain points**:
- Production bug: Email comparison failed due to case sensitivity → user couldn't log in
- GDPR compliance: Content hash missing → duplicate detection impossible
- Test complexity: No equality method → manual property comparison in tests
- Type safety: string userId accepted in wrong places → runtime errors

---

## ✅ Solution

**Value Object pattern with**:
- `BaseValueObject<Props>` extension from @vytches/ddd
- Factory method: `static create()` returns `Result<VO, ValidationError>`
- Private constructor - NEVER called directly
- Immutability: All fields readonly, no setters
- Equality comparison: `getEqualityComponents()` implementation
- Normalization: Whitespace trimming, case normalization in factory
- Format validation ONLY (ADR-0021): NO business rules
- Props interface: Type-safe property structure

---

## 🔧 Implementation

### Example 1: CommentContent (Text Content Pattern)

**File**: `src/contexts/engagement/domain/value-objects/comment-content.vo.ts` (187 lines)

**Key characteristics**:
- Text content with length constraints (5-2000 chars)
- Content hash for duplicate/spam detection (SHA256)
- Whitespace normalization (trim, collapse spaces)
- Preview generation for notifications
- Immutable after creation

```typescript
import * as crypto from 'crypto';
import { BaseValueObject, Result } from '@vytches/ddd';
import { EngagementValidationError } from '../errors/engagement-validation.error';

export const COMMENT_MIN_LENGTH = 5;
export const COMMENT_MAX_LENGTH = 2000;

interface CommentContentProps {
  content: string;
  hash: string;
}

export class CommentContent extends BaseValueObject<CommentContentProps> {
  protected readonly props: CommentContentProps;

  // 1. ✅ Private constructor - NEVER called directly
  constructor(props: CommentContentProps) {
    super(props);
    this.props = props;
  }

  // 2. ✅ Factory method with validation and normalization
  public static create(content: string): Result<CommentContent, EngagementValidationError> {
    if (!content) {
      return Result.fail(EngagementValidationError.required('content'));
    }

    // Normalization: trim, collapse whitespace
    const normalizedContent = CommentContent.normalizeContent(content);

    // Format validation: length constraints
    if (normalizedContent.length < COMMENT_MIN_LENGTH) {
      return Result.fail(EngagementValidationError.invalidCommentLength(normalizedContent.length));
    }

    if (normalizedContent.length > COMMENT_MAX_LENGTH) {
      return Result.fail(EngagementValidationError.invalidCommentLength(normalizedContent.length));
    }

    // Generate content hash for duplicate/spam detection
    const hash = CommentContent.generateHash(normalizedContent);

    return Result.ok(
      new CommentContent({
        content: normalizedContent,
        hash,
      })
    );
  }

  // 3. ✅ Normalization helper (private)
  private static normalizeContent(content: string): string {
    return content
      .trim()
      .replace(/\s+/g, ' ') // Collapse multiple whitespace to single space
      .replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
  }

  // 4. ✅ Hash generation for duplicate detection
  private static generateHash(content: string): string {
    return crypto.createHash('sha256').update(content.toLowerCase()).digest('hex');
  }

  // 5. ✅ Validation method (called by BaseValueObject)
  validate(props: CommentContentProps): boolean {
    const length = props.content.length;
    return length >= COMMENT_MIN_LENGTH && length <= COMMENT_MAX_LENGTH && props.hash.length === 64;
  }

  // 6. ✅ Equality comparison (for hash-based comparison)
  protected getEqualityComponents(): string[] {
    return [this.props.hash];
  }

  // 7. ✅ Public getters (immutability)
  getContent(): string {
    return this.props.content;
  }

  get hash(): string {
    return this.props.hash;
  }

  get length(): number {
    return this.props.content.length;
  }

  // 8. ✅ Convenience preview method
  get preview(): string {
    if (this.props.content.length <= 100) {
      return this.props.content;
    }
    return `${this.props.content.substring(0, 97)}...`;
  }

  // 9. ✅ Query methods (no side effects)
  isMinimumLength(): boolean {
    return this.props.content.length === COMMENT_MIN_LENGTH;
  }

  isMaximumLength(): boolean {
    return this.props.content.length === COMMENT_MAX_LENGTH;
  }

  isSameAs(other: CommentContent): boolean {
    return this.props.hash === other.hash;
  }

  // 10. ✅ String representation
  public override toString(): string {
    return this.props.content;
  }

  // 11. ✅ Static constraints info
  public static getConstraints(): { minLength: number; maxLength: number } {
    return {
      minLength: COMMENT_MIN_LENGTH,
      maxLength: COMMENT_MAX_LENGTH,
    };
  }
}
```

---

### Example 2: ModerationStatus (Enum-Based Pattern)

**File**: `src/shared/domain/value-objects/moderation-status.vo.ts` (362 lines)

**Key characteristics**:
- Enum-based status with metadata (level, category, confidence)
- Factory methods for specific statuses (pending, approved, rejected, etc.)
- Business logic methods (isVisible, needsHumanReview)
- Multi-field equality comparison
- Human-readable translations (Polish)

```typescript
import { BaseValueObject, Result } from '@vytches/ddd';
import { SharedValidationError } from '../errors/shared-validation.error';

export enum ModerationStatusEnum {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  HIDDEN = 'hidden',
  ESCALATED = 'escalated',
}

export enum ModerationLevelEnum {
  L0 = 'L0', // Rule-based
  L1 = 'L1', // Embedding-based
  L2 = 'L2', // LLM-based
  SKIPPED = 'SKIPPED', // Elite users
}

export interface ModerationStatusProps {
  status: ModerationStatusEnum;
  level?: ModerationLevelEnum;
  category?: string; // spam, toxic, harassment, etc.
  confidence?: number; // 0.00-1.00
}

export class ModerationStatus extends BaseValueObject<ModerationStatusProps> {
  protected readonly props: ModerationStatusProps;

  constructor(props: ModerationStatusProps) {
    super(props);
    this.props = props;
  }

  // 1. ✅ General factory with validation
  public static create(
    status: string,
    level?: string,
    category?: string,
    confidence?: number
  ): Result<ModerationStatus, SharedValidationError> {
    const normalizedStatus = status.toLowerCase().trim();

    if (!Object.values(ModerationStatusEnum).includes(normalizedStatus as ModerationStatusEnum)) {
      return Result.fail(
        SharedValidationError.invalidFormat(
          'moderationStatus',
          `Must be one of: ${Object.values(ModerationStatusEnum).join(', ')}`
        )
      );
    }

    let parsedLevel: ModerationLevelEnum | undefined;
    if (level) {
      const normalizedLevel = level.toUpperCase().trim();
      if (!Object.values(ModerationLevelEnum).includes(normalizedLevel as ModerationLevelEnum)) {
        return Result.fail(
          SharedValidationError.invalidFormat(
            'moderationLevel',
            `Must be one of: ${Object.values(ModerationLevelEnum).join(', ')}`
          )
        );
      }
      parsedLevel = normalizedLevel as ModerationLevelEnum;
    }

    if (confidence !== undefined && (confidence < 0 || confidence > 1)) {
      return Result.fail(SharedValidationError.invalidRange('confidence', 0, 1));
    }

    return Result.ok(
      new ModerationStatus({
        status: normalizedStatus as ModerationStatusEnum,
        level: parsedLevel,
        category,
        confidence,
      })
    );
  }

  // 2. ✅ Convenience factory methods for specific statuses
  public static pending(): ModerationStatus {
    return new ModerationStatus({ status: ModerationStatusEnum.PENDING });
  }

  public static approved(level?: ModerationLevelEnum, confidence?: number): ModerationStatus {
    return new ModerationStatus({
      status: ModerationStatusEnum.APPROVED,
      level,
      confidence,
    });
  }

  public static rejected(
    level: ModerationLevelEnum,
    category: string,
    confidence?: number
  ): ModerationStatus {
    return new ModerationStatus({
      status: ModerationStatusEnum.REJECTED,
      level,
      category,
      confidence,
    });
  }

  public static escalated(
    level: ModerationLevelEnum,
    category?: string,
    confidence?: number
  ): ModerationStatus {
    return new ModerationStatus({
      status: ModerationStatusEnum.ESCALATED,
      level,
      category,
      confidence,
    });
  }

  public static skippedForElite(): ModerationStatus {
    return new ModerationStatus({
      status: ModerationStatusEnum.APPROVED,
      level: ModerationLevelEnum.SKIPPED,
    });
  }

  // 3. ✅ Validation
  validate(props: ModerationStatusProps): boolean {
    if (!Object.values(ModerationStatusEnum).includes(props.status)) {
      return false;
    }
    if (props.level && !Object.values(ModerationLevelEnum).includes(props.level)) {
      return false;
    }
    if (props.confidence !== undefined && (props.confidence < 0 || props.confidence > 1)) {
      return false;
    }
    return true;
  }

  // 4. ✅ Multi-field equality comparison
  protected getEqualityComponents(): unknown[] {
    return [this.props.status, this.props.level, this.props.category];
  }

  // 5. ✅ Public getters
  get status(): ModerationStatusEnum { return this.props.status; }
  get level(): ModerationLevelEnum | undefined { return this.props.level; }
  get category(): string | undefined { return this.props.category; }
  get confidence(): number | undefined { return this.props.confidence; }

  // 6. ✅ Query methods with business logic
  isPending(): boolean { return this.props.status === ModerationStatusEnum.PENDING; }
  isApproved(): boolean { return this.props.status === ModerationStatusEnum.APPROVED; }
  isRejected(): boolean { return this.props.status === ModerationStatusEnum.REJECTED; }
  isHidden(): boolean { return this.props.status === ModerationStatusEnum.HIDDEN; }
  isEscalated(): boolean { return this.props.status === ModerationStatusEnum.ESCALATED; }

  // ✅ Complex business logic (SECURITY FIX TS-MOD-003)
  isVisible(isAuthor: boolean = false): boolean {
    if (isAuthor) {
      // Author can see own PENDING/ESCALATED content
      return this.isApproved() || this.isPending() || this.isEscalated();
    }
    // Public: only APPROVED visible
    return this.isApproved();
  }

  needsHumanReview(): boolean {
    return this.isEscalated();
  }

  wasSkipped(): boolean {
    return this.props.level === ModerationLevelEnum.SKIPPED;
  }

  isFinal(): boolean {
    return this.isApproved() || this.isRejected() || this.isHidden();
  }

  // 7. ✅ String representations
  public override toString(): string {
    let result: string = this.props.status;
    if (this.props.level) result += `:${this.props.level}`;
    if (this.props.category) result += `:${this.props.category}`;
    return result;
  }

  toReadableString(): string {
    const translations: Record<ModerationStatusEnum, string> = {
      [ModerationStatusEnum.PENDING]: 'Oczekuje na moderację',
      [ModerationStatusEnum.APPROVED]: 'Zatwierdzony',
      [ModerationStatusEnum.REJECTED]: 'Odrzucony',
      [ModerationStatusEnum.HIDDEN]: 'Ukryty',
      [ModerationStatusEnum.ESCALATED]: 'Do przeglądu',
    };
    return translations[this.props.status];
  }
}
```

---

### Example 3: Coordinates (Calculation Pattern)

**File**: `src/contexts/geographic-auth/domain/value-objects/coordinates.vo.ts`

**Key characteristics**:
- GPS latitude/longitude with accuracy
- Distance calculation (Haversine formula)
- Validation: latitude (-90 to 90), longitude (-180 to 180)
- Calculation methods (pure functions)

```typescript
import { BaseValueObject, Result } from '@vytches/ddd';
import { GeographicAuthValidationError } from '../errors';

interface CoordinatesProps {
  latitude: number;
  longitude: number;
  accuracy?: number; // meters
}

export class Coordinates extends BaseValueObject<CoordinatesProps> {
  protected readonly props: CoordinatesProps;

  constructor(props: CoordinatesProps) {
    super(props);
    this.props = props;
  }

  public static create(
    latitude: number,
    longitude: number,
    accuracy?: number
  ): Result<Coordinates, GeographicAuthValidationError> {
    // Format validation: GPS coordinate ranges
    if (latitude < -90 || latitude > 90) {
      return Result.fail(
        GeographicAuthValidationError.invalidCoordinateRange('latitude', -90, 90)
      );
    }

    if (longitude < -180 || longitude > 180) {
      return Result.fail(
        GeographicAuthValidationError.invalidCoordinateRange('longitude', -180, 180)
      );
    }

    if (accuracy !== undefined && accuracy < 0) {
      return Result.fail(GeographicAuthValidationError.invalidAccuracy());
    }

    return Result.ok(new Coordinates({ latitude, longitude, accuracy }));
  }

  validate(props: CoordinatesProps): boolean {
    return (
      props.latitude >= -90 &&
      props.latitude <= 90 &&
      props.longitude >= -180 &&
      props.longitude <= 180 &&
      (props.accuracy === undefined || props.accuracy >= 0)
    );
  }

  protected getEqualityComponents(): unknown[] {
    return [this.props.latitude, this.props.longitude];
  }

  // Getters
  get latitude(): number { return this.props.latitude; }
  get longitude(): number { return this.props.longitude; }
  get accuracy(): number | undefined { return this.props.accuracy; }

  // ✅ Calculation method (pure function, NO side effects)
  distanceTo(other: Coordinates): number {
    return this.haversineDistance(
      this.props.latitude,
      this.props.longitude,
      other.latitude,
      other.longitude
    );
  }

  // Haversine formula for distance calculation
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  public override toString(): string {
    return `${this.props.latitude},${this.props.longitude}`;
  }
}
```

---

## 📋 Rules

### MUST

1. **Extend `BaseValueObject<Props>`** from @vytches/ddd
2. **Private constructor** - NEVER called directly
3. **Factory method**: `static create()` returns `Result<VO, ValidationError>`
4. **Immutability**: All fields readonly, NO setters
5. **Normalization**: Whitespace trimming, case normalization in factory
6. **Format validation ONLY** (ADR-0021): Length, range, regex, format checks
7. **Equality comparison**: Implement `getEqualityComponents()`
8. **Props interface**: Type-safe property structure
9. **Validation method**: Implement `validate(props)` for BaseValueObject
10. **Pure functions**: Calculation methods with NO side effects

### MUST NOT

1. **NEVER business rules** - only format/structure validation (ADR-0021)
2. **NEVER infrastructure** - no DB, HTTP, external dependencies
3. **NEVER async operations** - value objects must be synchronous
4. **NEVER setters** - immutable after creation
5. **NEVER direct constructor** - always use factory method
6. **NEVER mutable fields** - all props readonly

---

## ⚠️ Anti-Patterns

### 1. Business Rules in Value Object (Violates ADR-0021)

```typescript
// ❌ WRONG: Business rule in value object
export class DateOfBirth extends BaseValueObject<Date> {
  static create(date: Date): Result<DateOfBirth, Error> {
    // ❌ Business rule: minimum age 16
    const age = this.calculateAge(date);
    if (age < 16) {
      return Result.fail(new MinimumAgeError()); // ❌ Business logic!
    }
    return Result.ok(new DateOfBirth(date));
  }
}

// ✅ CORRECT: Format validation only, business rule in Specification
export class DateOfBirth extends BaseValueObject<Date> {
  static create(date: Date): Result<DateOfBirth, Error> {
    // ✅ Format validation: not in future
    if (date > new Date()) {
      return Result.fail(new DateCannotBeFutureError());
    }
    // ✅ Sanity check: max age 120
    const age = this.calculateAge(date);
    if (age > 120) {
      return Result.fail(new AgeExceedsMaximumError());
    }
    return Result.ok(new DateOfBirth(date));
  }

  // ✅ Pure calculation method (NO validation)
  getAge(): number {
    return this.calculateAge(this.value);
  }
}

// ✅ Business rule in Specification
export class MeetsMinimumAgeSpecification {
  constructor(private readonly minimumAge: number = 16) {}

  isSatisfiedBy(context: { dateOfBirth: DateOfBirth }): boolean {
    return context.dateOfBirth.getAge() >= this.minimumAge;
  }
}
```

---

### 2. Mutable Value Object

```typescript
// ❌ WRONG: Mutable value object
export class Email extends BaseValueObject<string> {
  private _value: string;

  setEmail(newEmail: string): void { // ❌ Setter!
    this._value = newEmail;
  }
}

// ✅ CORRECT: Immutable value object
export class Email extends BaseValueObject<string> {
  private readonly _value: string; // ✅ readonly

  static create(email: string): Result<Email, Error> {
    // Validation...
    return Result.ok(new Email(email));
  }

  getValue(): string { // ✅ Only getter
    return this._value;
  }
}
```

---

### 3. Direct Constructor Usage

```typescript
// ❌ WRONG: Direct constructor call
const content = new CommentContent({ content: 'Hello', hash: '' }); // ❌ No validation!

// ✅ CORRECT: Factory method
const result = CommentContent.create('Hello');
if (result.isFailure) {
  return result.error;
}
const content = result.value; // ✅ Validated
```

---

### 4. Missing Normalization

```typescript
// ❌ WRONG: No normalization
export class Email extends BaseValueObject<string> {
  static create(email: string): Result<Email, Error> {
    if (!/^[\w-\.]+@/.test(email)) { // ❌ Case-sensitive comparison!
      return Result.fail(new InvalidEmailError());
    }
    return Result.ok(new Email(email)); // ❌ Stored as-is
  }
}

// Later: email comparison fails
user1.email.equals(user2.email); // "John@Example.com" !== "john@example.com" ❌

// ✅ CORRECT: Normalize in factory
export class Email extends BaseValueObject<string> {
  static create(email: string): Result<Email, Error> {
    const normalized = email.toLowerCase().trim(); // ✅ Normalize
    if (!/^[\w-\.]+@/.test(normalized)) {
      return Result.fail(new InvalidEmailError());
    }
    return Result.ok(new Email(normalized)); // ✅ Stored normalized
  }
}

// Later: email comparison works
user1.email.equals(user2.email); // "john@example.com" === "john@example.com" ✅
```

---

### 5. Missing Equality Comparison

```typescript
// ❌ WRONG: No equality method
export class CommentContent extends BaseValueObject<CommentContentProps> {
  // Missing getEqualityComponents() ❌
}

// Later: comparison always false
content1.equals(content2); // Always false, even if same content! ❌

// ✅ CORRECT: Hash-based equality
export class CommentContent extends BaseValueObject<CommentContentProps> {
  protected getEqualityComponents(): string[] {
    return [this.props.hash]; // ✅ Compare by hash
  }
}

// Later: comparison works
content1.equals(content2); // True if same hash ✅
```

---

## 📚 References

### ADRs
- **ADR-0013**: Hybrid Error Handling - Result pattern in domain
- **ADR-0021**: Validation Layer Separation - Format validation in VO, business rules in Specifications

### Implementation Files
- `src/contexts/engagement/domain/value-objects/comment-content.vo.ts` (187L)
- `src/shared/domain/value-objects/moderation-status.vo.ts` (362L)
- `src/contexts/geographic-auth/domain/value-objects/coordinates.vo.ts`
- `src/contexts/engagement/domain/value-objects/nesting-level.vo.ts`
- `src/shared/domain/value-objects/user-id.vo.ts`
- `src/shared/domain/value-objects/moderator-filters/` (Geographic filter VOs: GminaFilter, PowiatFilter, VoivodeshipFilter, RadiusFilter - TS-ARCH-002)

### Related Patterns
- **aggregate-pattern.md** - Aggregates use value objects as properties
- **domain-errors-pattern.md** - ProjectErrorCode for validation errors
- **specification-policy-pattern.md** - Business rules using value objects
- **geographic-filtering-pattern.md** - Geographic filter VOs (GminaFilter, PowiatFilter, VoivodeshipFilter, RadiusFilter)

---

## 🎯 When to Use

### Use Value Objects When

✅ **Format validation**: Email format, phone number, coordinates
✅ **Single concept**: One logical value (even if multiple fields)
✅ **Immutable data**: Value doesn't change after creation
✅ **Equality by value**: Two instances equal if properties equal
✅ **No identity**: No unique ID, identified by value alone
✅ **Calculations**: Pure functions like distance, age, duration

### Use Aggregates Instead When

❌ **Entity with identity**: Has unique ID, lifecycle, state changes
❌ **Business rules**: Complex multi-field validation requiring external context
❌ **State transitions**: Status changes, workflow states
❌ **Event sourcing**: State changes emit domain events

### Use Specifications Instead When

❌ **Business rules**: "User can comment if trust >= 40"
❌ **Cross-aggregate**: Rules involving multiple entities
❌ **Context-dependent**: Validation depends on use case

---

**Version**: 1.0
**Created**: 2026-01-04
**Last Updated**: 2026-01-04
**Maintained By**: @project-orchestrator
**Primary Users**: domain-application-implementer, code-quality-verifier
