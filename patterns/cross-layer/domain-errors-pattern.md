# Domain Errors Pattern

**Version**: 1.0
**Last Updated**: 2026-01-04
**Status**: PRODUCTION

---

## 🎯 Problem

Without standardized domain error structure, error handling becomes fragmented:
- **Inconsistent error codes**: Different contexts use different error code systems → integration hell
- **No HTTP mapping strategy**: Controllers guess HTTP status codes → inconsistent API responses
- **Poor testability**: Hard to verify specific error scenarios without consistent structure
- **Weak type safety**: String-based error identification → runtime errors
- **No business context**: Generic errors don't communicate business rules violated

**Real pain points from Project**:
- Pre-TS-INFRA-001: Fragmented usage of VytchesDDD's DomainErrorCode across contexts
- Error mapper consolidation required unified error code system
- Integration tests needed predictable error code format
- Business rules documentation required traceable error → rule mapping

---

## ✅ Solution

**Domain Errors Pattern** provides type-safe, hierarchical error system with HTTP mapping:

**Core Components**:
1. **BaseError** (from @vytches/ddd) - Foundation error class
2. **ProjectErrorCode enum** - Single source of truth for error codes (hierarchical, context-aware)
3. **ERROR_HTTP_STATUS Record** - Automatic HTTP status mapping
4. **Domain error classes** - Context-specific errors extending BaseError
5. **JSDoc documentation** (optional) - Business rule references and security notes
6. **Static factory methods** (optional) - Simplified test creation

**Key Benefits**:
- ✅ Type-safe error identification (compile-time validation)
- ✅ Consistent HTTP status mapping across all contexts
- ✅ Hierarchical organization (D_*, AUTH_*, GEO_*, etc.)
- ✅ Testability via factory methods
- ✅ Business rule traceability via JSDoc

---

## 🔧 Implementation

### 1. ProjectErrorCode Enum (Single Source of Truth)

**Location**: `src/shared/domain/errors/error-codes.ts` (738 lines)

**Structure**:
```typescript
/**
 * Project Error Codes
 *
 * Design Principles:
 * 1. Type-safe enum with string values (for serialization)
 * 2. Hierarchical organization by category
 * 3. Single source of truth for HTTP status mapping
 * 4. Context-specific codes alongside generic ones
 *
 * Naming Convention: CATEGORY_SPECIFIC_ERROR
 * Examples: NOT_FOUND, VALIDATION_FAILED, AUTH_INVALID_CREDENTIALS
 */
export enum ProjectErrorCode {
  // ==========================================================================
  // GENERIC ERRORS (cross-context, map to common HTTP statuses)
  // ==========================================================================

  /** Generic error - 500 Internal Server Error */
  DEFAULT = 'D_ERROR',

  /** Resource not found - 404 Not Found */
  NOT_FOUND = 'D_NOT_FOUND',

  /** Validation failed - 400 Bad Request */
  VALIDATION_FAILED = 'D_VALIDATION_FAILED',

  // ==========================================================================
  // AUTHENTICATION ERRORS (auth context)
  // ==========================================================================

  /** Invalid email or password - 401 Unauthorized */
  AUTH_INVALID_CREDENTIALS = 'D_INVALID_CREDENTIALS',

  /** Account locked - 423 Locked */
  AUTH_ACCOUNT_LOCKED = 'D_ACCOUNT_LOCKED',

  // ==========================================================================
  // ENGAGEMENT ERRORS (engagement context)
  // ==========================================================================

  /** Duplicate action (already liked, etc.) - 409 Conflict */
  ENGAGE_DUPLICATE_ACTION = 'D_DUPLICATE_ACTION',

  /** Max nesting level exceeded - 422 Unprocessable Entity */
  ENGAGE_MAX_NESTING = 'D_MAX_NESTING_EXCEEDED',

  // ... 200+ more error codes organized by context
}

/**
 * HTTP Status code mapping for error codes
 *
 * Single source of truth for error → HTTP status mapping.
 * Used by all context error mappers for consistent responses.
 */
export const ERROR_HTTP_STATUS: Record<ProjectErrorCode, number> = {
  [ProjectErrorCode.DEFAULT]: 500,
  [ProjectErrorCode.NOT_FOUND]: 404,
  [ProjectErrorCode.VALIDATION_FAILED]: 400,
  [ProjectErrorCode.AUTH_INVALID_CREDENTIALS]: 401,
  [ProjectErrorCode.AUTH_ACCOUNT_LOCKED]: 423,
  [ProjectErrorCode.ENGAGE_DUPLICATE_ACTION]: 409,
  [ProjectErrorCode.ENGAGE_MAX_NESTING]: 422,
  // ... complete mapping for all 200+ codes
};

/**
 * Get HTTP status code for an error code
 */
export function getHttpStatusForCode(code: ProjectErrorCode | string): number {
  if (typeof code === 'string') {
    const enumEntry = Object.entries(ProjectErrorCode).find(([, value]) => value === code);
    if (enumEntry) {
      return ERROR_HTTP_STATUS[enumEntry[1] as ProjectErrorCode] ?? 500;
    }
    return 500;
  }
  return ERROR_HTTP_STATUS[code] ?? 500;
}
```

**Categories**: Generic (D_*), Auth (AUTH_*), Permission (PERM_*), Validation (VAL_*), Engagement (ENGAGE_*), Events (EVENT_*), Geographic (GEO_*), Services (SVC_*), Trust (TRUST_*), Payment (PAY_*), Organization (ORG_*), Representatives (REP_*), Feedback (FEEDBACK_*), Infrastructure (INFRA_*)

---

### 2. Basic Domain Error (Simple Constructor)

**Example**: `src/contexts/auth/domain/errors/auth-domain-errors.ts`

```typescript
import { BaseError } from '@vytches/ddd';
import { ProjectErrorCode } from '@shared/domain/errors';

/**
 * User Already Exists Error
 *
 * Thrown when attempting to register with email already in use.
 */
export class UserAlreadyExistsError extends BaseError {
  public readonly code = ProjectErrorCode.DUPLICATE_ENTRY;

  constructor(email: string) {
    super(`User with email ${email} already exists`);
  }
}

/**
 * Invalid Credentials Error
 *
 * Thrown when login credentials are incorrect.
 * Maps to 401 Unauthorized.
 */
export class InvalidCredentialsError extends BaseError {
  public readonly code = ProjectErrorCode.AUTH_INVALID_CREDENTIALS;

  constructor() {
    super('Invalid email or password');
  }
}
```

**Pattern**: Extends BaseError, readonly code property, constructor with message.

---

### 3. Domain Error with Context Properties

**Example**: `src/contexts/auth/domain/errors/auth-domain-errors.ts`

```typescript
/**
 * Too Many Requests Error
 *
 * Rate limiting error with retry information.
 * Maps to 429 Too Many Requests.
 */
export class TooManyRequestsError extends BaseError {
  public readonly code = ProjectErrorCode.AUTH_TOO_MANY_REQUESTS;

  constructor(
    message = 'Too many requests. Please try again later.',
    public readonly context?: {
      retryAfter?: number;        // Seconds until retry allowed
      resetTime?: Date;            // Absolute reset timestamp
      reason?: string;             // Why rate limited
    }
  ) {
    super(message);
  }
}

/**
 * Market Validation Error
 *
 * Business rule violation during market-specific validation.
 */
export class MarketValidationError extends BaseError {
  public readonly code = ProjectErrorCode.VALIDATION_FAILED;

  constructor(
    message: string,
    public readonly rule: string,      // Business rule ID
    public readonly market: string,    // Market code (e.g., 'PL')
    public readonly field?: string     // Field that failed validation
  ) {
    super(message);
  }
}
```

**Pattern**: Additional readonly properties for error-specific context (useful for logging, debugging, UI feedback).

---

### 4. Domain Error with JSDoc Business Rule References (Best Practice)

**Example**: `src/contexts/geographic-auth/domain/errors/geographic-auth-domain-errors.ts`

```typescript
/**
 * Verification Limit Exceeded Error
 *
 * Thrown when user exceeds maximum verification attempt limit.
 *
 * **Business Rule**: BR-GEO-VERIFY-001
 * - Maximum 5 verification attempts per 24-hour period
 * - Prevents abuse and fraud
 * - Reset after 24 hours from first attempt
 *
 * **Related**:
 * - VerificationAttemptLimitPolicy (domain/policies/)
 * - VerificationAttemptLimitSpec (domain/specifications/)
 *
 * @see docs/business-rules/geographic-auth/BUSINESS_RULES.md#BR-GEO-VERIFY-001
 */
export class VerificationLimitExceededError extends BaseError {
  public readonly code = ProjectErrorCode.GEO_VERIFICATION_LIMIT;

  constructor(maxAttempts: number = 5) {
    super(
      `Verification attempt limit exceeded. Maximum ${maxAttempts} attempts allowed per 24 hours.`
    );
  }
}

/**
 * Address Change Cooldown Error
 *
 * Thrown when user attempts to change address within cooldown period.
 *
 * **Business Rule**: BR-GEO-ADDRESS-002
 * - 30-day cooldown between address changes
 * - Prevents address hopping fraud
 * - Applies to PRIMARY residence only
 *
 * **Security**: Prevents horizontal privilege escalation via address manipulation
 *
 * @see docs/business-rules/geographic-auth/BUSINESS_RULES.md#BR-GEO-ADDRESS-002
 */
export class AddressChangeCooldownError extends BaseError {
  public readonly code = ProjectErrorCode.GEO_ADDRESS_COOLDOWN;

  constructor(
    public readonly daysRemaining: number,
    public readonly cooldownDays: number = 30
  ) {
    super(
      `Address change cooldown period active. ${daysRemaining} days remaining of ${cooldownDays}-day cooldown.`
    );
  }
}

/**
 * Unauthorized Residence Access Error
 *
 * Thrown when user attempts to access/modify residence they don't own.
 *
 * **Security**: Prevents horizontal privilege escalation attacks
 * - User can only access their own residences
 * - Validates ownership before ANY modify/delete operation
 * - Logged for security audit trail
 *
 * @see ADR-0027 - Audit Event Selection Strategy (MANDATORY tier)
 */
export class UnauthorizedResidenceAccessError extends BaseError {
  public readonly code = ProjectErrorCode.GEO_UNAUTHORIZED_RESIDENCE_ACCESS;

  constructor(
    public readonly userId: string,
    public readonly residenceId: string,
    public readonly operation: string = 'modify'
  ) {
    super(
      `User ${userId} is not authorized to ${operation} residence ${residenceId}. ` +
      `This incident has been logged for security review.`
    );
  }
}
```

**Best Practice**: JSDoc with business rule IDs, security implications, and BUSINESS_RULES.md references.

---

### 5. Domain Error with Static Factory Methods (Test-Friendly)

**Example**: `src/contexts/engagement/domain/errors/engagement-validation.error.ts`

```typescript
/**
 * Engagement Validation Error
 *
 * Single error class with factory methods for different validation scenarios.
 * Simplifies testing and ensures consistent error structure.
 */
export class EngagementValidationError extends BaseError {
  public readonly code: ProjectErrorCode;

  constructor(
    message: string,
    public readonly field?: string,
    code?: ProjectErrorCode
  ) {
    super(message);
    this.code = code ?? ProjectErrorCode.VALIDATION_FAILED;
  }

  // ========================================================================
  // Factory Methods (Test-Friendly)
  // ========================================================================

  static required(field: string): EngagementValidationError {
    return new EngagementValidationError(
      `${field} is required`,
      field,
      ProjectErrorCode.FIELD_REQUIRED
    );
  }

  static duplicateAction(): EngagementValidationError {
    return new EngagementValidationError(
      'User has already performed this action on this target',
      'action',
      ProjectErrorCode.ENGAGE_DUPLICATE_ACTION
    );
  }

  static maxNestingLevelExceeded(): EngagementValidationError {
    return new EngagementValidationError(
      'Maximum comment nesting level (3) exceeded',
      'nestingLevel',
      ProjectErrorCode.ENGAGE_MAX_NESTING
    );
  }

  static insufficientTrustLevel(required: number, actual: number): EngagementValidationError {
    return new EngagementValidationError(
      `Insufficient trust level to comment. Required: ${required}, actual: ${actual}`,
      'verificationLevel',
      ProjectErrorCode.ENGAGE_INSUFFICIENT_TRUST
    );
  }

  static invalidCommentLength(min: number, max: number, actual: number): EngagementValidationError {
    return new EngagementValidationError(
      `Comment length must be between ${min} and ${max} characters (actual: ${actual})`,
      'content',
      ProjectErrorCode.ENGAGE_INVALID_COMMENT_LENGTH
    );
  }
}
```

**Usage in Tests**:
```typescript
// ❌ HARDER TO TEST (manual construction)
throw new EngagementValidationError(
  'Maximum comment nesting level (3) exceeded',
  'nestingLevel',
  ProjectErrorCode.ENGAGE_MAX_NESTING
);

// ✅ EASIER TO TEST (factory method)
throw EngagementValidationError.maxNestingLevelExceeded();

// Test assertion
expect(() => aggregate.addComment(...)).toThrow(
  EngagementValidationError.maxNestingLevelExceeded()
);
```

**Example 2**: `src/contexts/trust/domain/errors/validation-errors.ts`

```typescript
/**
 * Invalid Delta Error
 *
 * Thrown when trust score adjustment delta violates business rules:
 * - Reward delta must be positive
 * - Penalty delta must be negative
 *
 * **Business Rule**: BR-TRUST-009 (Manual adjustments clamped to -50/+50)
 */
export class InvalidDeltaError extends BaseError {
  public readonly code = ProjectErrorCode.TRUST_INVALID_DELTA;

  constructor(message: string) {
    super(message);
  }

  static forReward(): InvalidDeltaError {
    return new InvalidDeltaError('Reward delta must be positive');
  }

  static forPenalty(): InvalidDeltaError {
    return new InvalidDeltaError('Penalty delta must be negative');
  }
}
```

**Pattern**: Static factory methods reduce boilerplate in tests and ensure consistent error messages.

---

## 📋 Rules

### MUST

1. **MUST extend BaseError** from @vytches/ddd
   ```typescript
   import { BaseError } from '@vytches/ddd';

   export class MyDomainError extends BaseError { ... }
   ```

2. **MUST have `public readonly code` property** with ProjectErrorCode value
   ```typescript
   public readonly code = ProjectErrorCode.AUTH_INVALID_CREDENTIALS;
   ```

3. **MUST use ProjectErrorCode enum** - NEVER string literals or custom codes
   ```typescript
   // ✅ CORRECT
   public readonly code = ProjectErrorCode.NOT_FOUND;

   // ❌ WRONG
   public readonly code = 'NOT_FOUND';
   public readonly code = 'my-custom-error-code';
   ```

4. **MUST call super(message)** in constructor with descriptive error message
   ```typescript
   constructor(email: string) {
     super(`User with email ${email} already exists`);
   }
   ```

5. **MUST use hierarchical naming** for context-specific errors
   - Generic: `D_*` (D_NOT_FOUND, D_VALIDATION_FAILED)
   - Auth: `AUTH_*` (AUTH_INVALID_CREDENTIALS, AUTH_SESSION_INACTIVE)
   - Geographic: `GEO_*` (GEO_RESIDENCE_NOT_FOUND, GEO_ADDRESS_COOLDOWN)
   - Engagement: `ENGAGE_*` (ENGAGE_DUPLICATE_ACTION, ENGAGE_MAX_NESTING)
   - Services: `SVC_*` (SVC_JOB_REQUEST_NOT_FOUND, SVC_OFFER_ALREADY_ACCEPTED)

6. **MUST add JSDoc documentation** with business rule references (best practice)
   ```typescript
   /**
    * Address Change Cooldown Error
    *
    * **Business Rule**: BR-GEO-ADDRESS-002
    * - 30-day cooldown between address changes
    *
    * @see docs/business-rules/geographic-auth/BUSINESS_RULES.md#BR-GEO-ADDRESS-002
    */
   export class AddressChangeCooldownError extends BaseError { ... }
   ```

7. **MUST update ERROR_HTTP_STATUS** when adding new ProjectErrorCode
   ```typescript
   export const ERROR_HTTP_STATUS: Record<ProjectErrorCode, number> = {
     // ... existing mappings
     [ProjectErrorCode.MY_NEW_ERROR]: 422,
   };
   ```

8. **MUST use context properties** for error-specific data (NOT in message)
   ```typescript
   // ✅ CORRECT - context as properties
   constructor(
     public readonly daysRemaining: number,
     public readonly cooldownDays: number = 30
   ) {
     super(`Cooldown active. ${daysRemaining} days remaining.`);
   }

   // ❌ WRONG - no way to access structured data
   constructor(daysRemaining: number) {
     super(`Cooldown active. ${daysRemaining} days remaining.`);
   }
   ```

### MUST NOT

1. **MUST NOT use string literals** for error codes
   ```typescript
   // ❌ WRONG
   public readonly code = 'USER_NOT_FOUND';
   ```

2. **MUST NOT create custom error code systems** - use ProjectErrorCode
   ```typescript
   // ❌ WRONG
   enum MyContextErrorCode {
     MY_ERROR = 'MY_ERROR',
   }

   // ✅ CORRECT
   export enum ProjectErrorCode {
     // Add to shared enum
     MY_CONTEXT_MY_ERROR = 'D_MY_CONTEXT_MY_ERROR',
   }
   ```

3. **MUST NOT throw Error or generic exceptions** in domain layer
   ```typescript
   // ❌ WRONG
   throw new Error('User not found');

   // ✅ CORRECT
   throw new UserNotFoundError(userId);
   ```

4. **MUST NOT include sensitive data** in error messages (PII, credentials, etc.)
   ```typescript
   // ❌ WRONG - password in message
   throw new InvalidCredentialsError(`Password ${password} is incorrect`);

   // ✅ CORRECT - generic message
   throw new InvalidCredentialsError('Invalid email or password');
   ```

5. **MUST NOT duplicate error codes** across contexts - use unique codes
   ```typescript
   // ❌ WRONG - duplicate codes
   AUTH_NOT_FOUND = 'D_NOT_FOUND',
   GEO_NOT_FOUND = 'D_NOT_FOUND',

   // ✅ CORRECT - unique codes
   AUTH_USER_NOT_FOUND = 'D_AUTH_USER_NOT_FOUND',
   GEO_RESIDENCE_NOT_FOUND = 'D_RESIDENCE_NOT_FOUND',
   ```

6. **MUST NOT use HTTP status codes in domain errors** - use ProjectErrorCode only
   ```typescript
   // ❌ WRONG
   public readonly statusCode = 404;

   // ✅ CORRECT
   public readonly code = ProjectErrorCode.NOT_FOUND;
   // HTTP status derived from ERROR_HTTP_STATUS mapping
   ```

---

## ⚠️ Anti-Patterns

### ❌ ANTI-PATTERN 1: String Literal Error Codes

**Problem**: No type safety, runtime errors on typos, no HTTP mapping.

```typescript
// ❌ WRONG
export class UserNotFoundError extends BaseError {
  public readonly code = 'USER_NOT_FOUND'; // String literal - no type safety

  constructor(userId: string) {
    super(`User ${userId} not found`);
  }
}
```

**Why Wrong**:
- Typo in string literal → runtime error
- No compile-time validation
- No automatic HTTP status mapping
- Error mappers can't handle consistently

**✅ CORRECT**:
```typescript
import { ProjectErrorCode } from '@shared/domain/errors';

export class UserNotFoundError extends BaseError {
  public readonly code = ProjectErrorCode.NOT_FOUND; // Type-safe enum

  constructor(userId: string) {
    super(`User ${userId} not found`);
  }
}
```

---

### ❌ ANTI-PATTERN 2: Context-Specific Error Code Enum

**Problem**: Fragmentation, no cross-context consistency, duplicate HTTP mappings.

```typescript
// ❌ WRONG - context-specific enum
export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
}

export class InvalidCredentialsError extends BaseError {
  public readonly code = AuthErrorCode.INVALID_CREDENTIALS;

  constructor() {
    super('Invalid credentials');
  }
}
```

**Why Wrong**:
- Each context creates own error code system
- No shared HTTP mapping strategy
- Integration tests can't assert on consistent error codes
- Error monitoring/logging fragmented

**✅ CORRECT**:
```typescript
// ✅ Unified enum in shared/domain/errors/error-codes.ts
export enum ProjectErrorCode {
  // Auth errors
  AUTH_INVALID_CREDENTIALS = 'D_INVALID_CREDENTIALS',
  AUTH_SESSION_EXPIRED = 'D_SESSION_EXPIRED',

  // Geo errors
  GEO_RESIDENCE_NOT_FOUND = 'D_RESIDENCE_NOT_FOUND',

  // ... all contexts use same enum
}

// ✅ Single HTTP mapping
export const ERROR_HTTP_STATUS: Record<ProjectErrorCode, number> = {
  [ProjectErrorCode.AUTH_INVALID_CREDENTIALS]: 401,
  [ProjectErrorCode.AUTH_SESSION_EXPIRED]: 401,
  [ProjectErrorCode.GEO_RESIDENCE_NOT_FOUND]: 404,
  // ... complete mapping
};
```

---

### ❌ ANTI-PATTERN 3: Generic Error Class with No Type Safety

**Problem**: Loses type safety, hard to test specific errors.

```typescript
// ❌ WRONG - generic error with string code
export class DomainValidationError extends BaseError {
  public readonly code: string; // Not type-safe

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

// Usage - no compile-time validation
throw new DomainValidationError('User not found', 'USER_NOT_FOUND');
```

**Why Wrong**:
- Code is runtime string - typos not caught
- Can't assert error type in tests (instanceof check useless)
- No IDE autocomplete for error codes

**✅ CORRECT**:
```typescript
// ✅ Specific error class with type-safe code
export class UserNotFoundError extends BaseError {
  public readonly code = ProjectErrorCode.NOT_FOUND;

  constructor(userId: string) {
    super(`User ${userId} not found`);
  }
}

// Usage - type-safe
throw new UserNotFoundError(userId);

// Test - instanceof works
expect(() => service.getUser(userId)).toThrow(UserNotFoundError);
```

---

### ❌ ANTI-PATTERN 4: Error Data in Message Only

**Problem**: Can't access structured data programmatically.

```typescript
// ❌ WRONG - data only in message
export class AddressChangeCooldownError extends BaseError {
  public readonly code = ProjectErrorCode.GEO_ADDRESS_COOLDOWN;

  constructor(daysRemaining: number) {
    super(`Address change cooldown active. ${daysRemaining} days remaining.`);
    // daysRemaining lost - can't be accessed!
  }
}

// Can't get daysRemaining for UI display or logging
```

**Why Wrong**:
- UI can't display structured error info
- Logging can't extract metrics (e.g., average cooldown remaining)
- Error handlers can't provide context-aware responses

**✅ CORRECT**:
```typescript
// ✅ Data as readonly properties
export class AddressChangeCooldownError extends BaseError {
  public readonly code = ProjectErrorCode.GEO_ADDRESS_COOLDOWN;

  constructor(
    public readonly daysRemaining: number,
    public readonly cooldownDays: number = 30
  ) {
    super(
      `Address change cooldown active. ${daysRemaining} days remaining of ${cooldownDays}-day cooldown.`
    );
  }
}

// UI can access structured data
if (error instanceof AddressChangeCooldownError) {
  showCooldownTimer(error.daysRemaining);
}
```

---

### ❌ ANTI-PATTERN 5: Missing HTTP Status Mapping

**Problem**: Controllers guess HTTP status, inconsistent API responses.

```typescript
// ❌ WRONG - no HTTP mapping for new error code
export enum ProjectErrorCode {
  // ... existing codes
  MY_NEW_ERROR = 'D_MY_NEW_ERROR', // Added to enum
}

// ❌ Forgot to add HTTP mapping!
export const ERROR_HTTP_STATUS: Record<ProjectErrorCode, number> = {
  // ... existing mappings
  // Missing: [ProjectErrorCode.MY_NEW_ERROR]: ???
};
```

**Why Wrong**:
- `getHttpStatusForCode(MY_NEW_ERROR)` returns default 500
- Should be specific status (400, 404, 422, etc.)
- Controllers can't provide correct HTTP response

**✅ CORRECT**:
```typescript
// ✅ Add enum value
export enum ProjectErrorCode {
  // ... existing codes
  MY_NEW_ERROR = 'D_MY_NEW_ERROR',
}

// ✅ Add HTTP mapping
export const ERROR_HTTP_STATUS: Record<ProjectErrorCode, number> = {
  // ... existing mappings
  [ProjectErrorCode.MY_NEW_ERROR]: 422, // Unprocessable Entity
};
```

---

### ❌ ANTI-PATTERN 6: No Business Rule Documentation

**Problem**: Error usage unclear, business rules not traceable.

```typescript
// ❌ WRONG - no documentation
export class AddressChangeCooldownError extends BaseError {
  public readonly code = ProjectErrorCode.GEO_ADDRESS_COOLDOWN;

  constructor(daysRemaining: number, cooldownDays: number = 30) {
    super(`Cooldown active. ${daysRemaining} days remaining.`);
  }
}
```

**Why Wrong**:
- Developers don't know WHY cooldown exists
- Business rule not linked to BUSINESS_RULES.md
- Security implications not documented

**✅ CORRECT**:
```typescript
/**
 * Address Change Cooldown Error
 *
 * Thrown when user attempts to change address within cooldown period.
 *
 * **Business Rule**: BR-GEO-ADDRESS-002
 * - 30-day cooldown between address changes
 * - Prevents address hopping fraud
 * - Applies to PRIMARY residence only
 *
 * **Security**: Prevents horizontal privilege escalation via address manipulation
 *
 * @see docs/business-rules/geographic-auth/BUSINESS_RULES.md#BR-GEO-ADDRESS-002
 */
export class AddressChangeCooldownError extends BaseError {
  public readonly code = ProjectErrorCode.GEO_ADDRESS_COOLDOWN;

  constructor(
    public readonly daysRemaining: number,
    public readonly cooldownDays: number = 30
  ) {
    super(
      `Address change cooldown active. ${daysRemaining} days remaining of ${cooldownDays}-day cooldown.`
    );
  }
}
```

---

## 📚 References

### ADRs
- **ADR-0013**: Hybrid Error Handling Strategy (Domain=Result, Infrastructure=Throw, Application=Hybrid)
- **ADR-0027**: Audit Event Selection Strategy (security error logging tiers)
- **ADR-0041**: Error Handler Chain of Responsibility (9 specialized error handlers)

### Related Patterns
- **Error Mappings Pattern**: IDomainErrorMapper with Map-based O(1) lookup
- **Result Pattern**: Result.ok/fail for domain layer error handling
- **Hybrid Error Handling Pattern**: Layer-specific error strategies
- **Error Handler Chain Pattern**: 9 specialized handlers for infrastructure errors

### Implementation Files
- `src/shared/domain/errors/error-codes.ts` - ProjectErrorCode enum (738L)
- `src/contexts/auth/domain/errors/auth-domain-errors.ts` - Auth context errors
- `src/contexts/geographic-auth/domain/errors/geographic-auth-domain-errors.ts` - Geo errors (best practice JSDoc)
- `src/contexts/engagement/domain/errors/engagement-validation.error.ts` - Factory methods pattern
- `src/contexts/trust/domain/errors/validation-errors.ts` - Trust errors with factory methods

### External Dependencies
- `@vytches/ddd` - BaseError foundation class

---

## 🎯 When to Use

### ✅ Use Domain Errors Pattern When:

1. **Domain layer business rule violations**
   - Example: Verification limit exceeded, address cooldown active, trust score too low
   - Pattern: Specific error class with business rule JSDoc

2. **Aggregate invariant violations**
   - Example: Cannot delete only residence, max nesting level exceeded
   - Pattern: Error thrown from aggregate validation methods

3. **Value object validation failures**
   - Example: Invalid coordinates, incomplete address, currency mismatch
   - Pattern: Throw from Value Object static factory methods

4. **Policy/Specification violations**
   - Example: User lacks required permission, insufficient trust level
   - Pattern: Policy.validate() throws specific error

5. **Resource not found scenarios**
   - Example: User not found, residence not found, job request not found
   - Pattern: Repository returns Result.fail() with domain error

6. **State transition violations**
   - Example: Cannot withdraw accepted offer, payment already completed
   - Pattern: Aggregate state machine throws on invalid transitions

### ❌ Do NOT Use Domain Errors For:

1. **Infrastructure failures** (database connection, network timeout)
   - Use: Infrastructure exceptions (DatabaseError, TimeoutError)
   - Why: Not domain concepts, handled at infrastructure layer

2. **Format validation failures** (invalid email format, malformed JSON)
   - Use: Zod schema validation at API boundary (ADR-0021)
   - Why: Format validation !== business validation

3. **Authentication failures** (JWT expired, invalid signature)
   - Use: NestJS auth guards throw UnauthorizedException
   - Why: Framework-level concern, not domain

4. **Rate limiting**
   - Use: NestJS rate limiting guards
   - Why: Infrastructure concern, though can trigger domain errors (e.g., verification limit)

5. **External API failures** (payment gateway down, geocoding service error)
   - Use: Infrastructure exceptions wrapped in Result pattern
   - Why: Technical failures, not business rule violations

---

## 📊 Statistics

**Project Error System**:
- ProjectErrorCode enum: **200+ error codes** across 14 categories
- ERROR_HTTP_STATUS mapping: **100% coverage** (every code has HTTP mapping)
- Contexts using pattern: **13/13 active contexts** (100%)
- Domain error files: **15+ files** across contexts
- Factory methods: **~30 factory methods** in engagement/trust contexts

**Coverage by Context**:
- Auth: 15 error codes
- Geographic-Auth: 35 error codes (best JSDoc documentation)
- Engagement: 18 error codes (most factory methods)
- Community-Communication: 12 error codes
- Services: 22 error codes
- Trust: 8 error codes
- Organization: 20 error codes
- Payment: 10 error codes

---

**Primary Users**: domain-application-implementer, infrastructure-testing-implementer
**Related Tools**: ProjectErrorCode enum, ERROR_HTTP_STATUS mapping, BaseError (@vytches/ddd)
**Migration**: Replaced fragmented VytchesDDD DomainErrorCode usage (TS-INFRA-001)
