# Error Handler Chain Pattern (ADR-0041)

**Version**: 1.0
**Last Updated**: 2026-01-04
**Status**: PRODUCTION
**Priority**: CRITICAL
**Primary Users**: infrastructure-testing-implementer, code-quality-verifier, security-e2e-verifier

---

## 🎯 Problem

**Monolithic Error Filter with SOLID Violations**

Project originally had a **monolithic error handling filter** that violated multiple SOLID principles:

**Before ADR-0041** (`ExtensibleExceptionFilter` - 833 lines):
```typescript
@Catch()
export class ExtensibleExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    // ❌ 833 lines of if-else chains
    // ❌ 15+ exception types handled in one method
    // ❌ Cannot add new error type without modifying filter
    // ❌ Cannot test handlers in isolation
    // ❌ Mixed responsibilities (unwrapping, mapping, formatting, logging)

    if (exception instanceof MaxRetriesExceededError) {
      // 60 lines of retry unwrapping logic
    } else if (exception instanceof BusinessLogicFailureException) {
      // 40 lines of transaction unwrapping logic
    } else if (isDomainError(exception)) {
      // 80 lines of domain error mapping
    } else if (exception instanceof ValidationException) {
      // 50 lines of validation error formatting
    } // ... 11 more exception types
    else {
      // Generic fallback
    }
  }
}
```

**Real-World Pain Points**:
1. **Production Bug** (2025-12-15): ValidationException field errors lost when HttpExceptionHandler processed them generically
2. **Maintenance Burden**: Adding PostgreSQL error handling required modifying 70+ lines in monolithic filter
3. **Testing Difficulty**: Cannot test retry unwrapping logic without loading entire filter
4. **Code Review Nightmare**: 833-line file with 15+ responsibilities
5. **SOLID Violations**:
   - ❌ **Single Responsibility**: Filter handles unwrapping, mapping, formatting, logging
   - ❌ **Open/Closed**: Cannot extend without modifying filter code
   - ❌ **Dependency Inversion**: Tightly coupled to specific exception types

---

## ✅ Solution

**Chain of Responsibility Pattern with 9 Specialized Handlers**

ADR-0041 extracted error handling into **9 specialized handlers** with clear priority order:

```typescript
// src/shared/response/filters/extensible-exception.filter.ts (70 lines)
@Catch()
export class ExtensibleExceptionFilter {
  constructor(
    // 9 specialized handlers injected (priority order)
    private readonly maxRetriesHandler: MaxRetriesErrorHandler,
    private readonly businessLogicHandler: BusinessLogicFailureHandler,
    private readonly domainHandler: DomainErrorHandler,
    private readonly baseResponseHandler: BaseResponseErrorHandler,
    private readonly validationExceptionHandler: ValidationExceptionHandler,
    private readonly zodValidationHandler: ZodValidationHandler,
    private readonly httpExceptionHandler: HttpExceptionHandler,
    private readonly databaseHandler: DatabaseErrorHandler,
    private readonly genericHandler: GenericErrorHandler,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, mappedException } = this.mapException(exception, context);
    // ... format and respond
  }

  private mapException(exception: unknown, context: ErrorContext) {
    // Chain of Responsibility: check each handler in order
    if (this.maxRetriesHandler.canHandle(exception)) {
      return this.maxRetriesHandler.handle(exception, context);
    }
    if (this.businessLogicHandler.canHandle(exception)) {
      return this.businessLogicHandler.handle(exception, context);
    }
    // ... 7 more handlers

    // GenericErrorHandler always returns true (fallback)
    return this.genericHandler.handle(exception, context);
  }
}
```

**Handler Interface** (shared by all 9 handlers):

```typescript
@Injectable()
export class SomeErrorHandler {
  constructor(@Inject(LOGGER_SERVICE) private readonly logger: ILoggerService) {}

  canHandle(exception: unknown): boolean {
    return exception instanceof SomeSpecificException;
  }

  handle(
    exception: SomeSpecificException,
    context: ErrorContext
  ): { status: HttpStatus; mappedException: BaseApplicationException } {
    // Handler-specific transformation logic
    return { status, mappedException };
  }
}
```

**Benefits**:
- ✅ **Single Responsibility**: Each handler has ONE job (unwrap/map/format)
- ✅ **Open/Closed**: Add new handlers without modifying filter
- ✅ **Testable**: Test each handler in isolation
- ✅ **Maintainable**: Filter reduced from 833 → 70 lines
- ✅ **Priority Order**: Clear execution sequence prevents bugs

---

## 🔧 Implementation

### Handler Priority Order (CRITICAL)

The order is **NOT arbitrary** - it's based on exception type specificity:

| Priority | Handler | Responsibility | Special Behavior |
|----------|---------|----------------|------------------|
| **1** | MaxRetriesErrorHandler | Unwrap retry mechanism errors | **Recursive** - returns `unwrappedError` |
| **2** | BusinessLogicFailureHandler | Unwrap transaction wrapper | **Recursive** - delegates to unwrapped error |
| **3** | DomainErrorHandler | Map VytchesDDD domain errors | Uses ErrorMappingRegistry |
| **4** | BaseResponseErrorHandler | Passthrough Swagger/OpenAPI errors | JSEND_PASSTHROUGH code |
| **5** | ValidationExceptionHandler | **MUST before HttpException** | Preserves field errors |
| **6** | ZodValidationHandler | Format Zod validation errors | Transforms Zod → ValidationException |
| **7** | HttpExceptionHandler | Map generic NestJS HttpException | Catches BaseApplicationException |
| **8** | DatabaseErrorHandler | Map PostgreSQL errors | Uses PostgreSQLErrorMapper |
| **9** | GenericErrorHandler | Fallback catch-all | **Always matches** |

**Why Priority Order Matters**:

```
❌ WRONG ORDER (HttpException before Validation):
ValidationException (extends HttpException)
    ↓
HttpExceptionHandler.canHandle() → true (catches parent class)
    ↓
Generic HttpException mapping → FIELD ERRORS LOST

✅ CORRECT ORDER (Validation before HttpException):
ValidationException
    ↓
ValidationExceptionHandler.canHandle() → true (specific match)
    ↓
Preserve field errors → VALIDATION DETAILS RETURNED
```

---

### Pattern 1: Wrapper Unwrapping Handler (Recursive)

**File**: `src/shared/response/handlers/max-retries-error.handler.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { LOGGER_SERVICE, type ILoggerService } from '@shared/infrastructure/logging';
import { MaxRetriesExceededError } from '@vytches/ddd';
import { BaseApplicationException, InfrastructureException } from '@shared/response/exceptions';
import { ErrorContext, ErrorSeverity } from '@shared/response/interfaces';

@Injectable()
export class MaxRetriesErrorHandler {
  constructor(@Inject(LOGGER_SERVICE) private readonly logger: ILoggerService) {}

  canHandle(exception: unknown): boolean {
    return exception instanceof MaxRetriesExceededError;
  }

  handle(
    exception: MaxRetriesExceededError,
    context: ErrorContext
  ): {
    status: HttpStatus;
    mappedException: BaseApplicationException;
    unwrappedError?: unknown; // CRITICAL: Enables recursive mapping
  } {
    // Strategy 1: Extract from cause chain (preferred)
    const innerError = (exception as any).cause;
    if (innerError && innerError !== exception) {
      this.logger.debug('MaxRetriesErrorHandler: Unwrapping error from cause chain', {
        innerType: innerError?.constructor?.name,
        outerType: exception.constructor.name,
      });

      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        mappedException: new InfrastructureException(
          'Operation failed after multiple retries',
          'MAX_RETRIES_EXCEEDED',
          context,
          ErrorSeverity.HIGH
        ),
        unwrappedError: innerError, // RECURSIVE MAPPING
      };
    }

    // Strategy 2: Parse error message for pattern matching
    const errorMessage = exception.message;
    const lastErrorMatch = errorMessage.match(/Last error: (.+)/);

    if (lastErrorMatch) {
      const lastErrorMessage = lastErrorMatch[1];

      // Detect domain error patterns in message
      if (
        lastErrorMessage.includes('not found') ||
        lastErrorMessage.includes('does not exist')
      ) {
        return {
          status: HttpStatus.NOT_FOUND,
          mappedException: new InfrastructureException(
            'Resource not found after retries',
            'RESOURCE_NOT_FOUND',
            context,
            ErrorSeverity.MEDIUM
          ),
        };
      }

      if (
        lastErrorMessage.includes('already') ||
        lastErrorMessage.includes('duplicate')
      ) {
        return {
          status: HttpStatus.CONFLICT,
          mappedException: new InfrastructureException(
            'Resource conflict after retries',
            'RESOURCE_CONFLICT',
            context,
            ErrorSeverity.MEDIUM
          ),
        };
      }
    }

    // Strategy 3: Ultimate fallback (503 SERVICE_UNAVAILABLE)
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      mappedException: new InfrastructureException(
        'Service temporarily unavailable',
        'MAX_RETRIES_EXCEEDED',
        context,
        ErrorSeverity.HIGH,
        { retries: exception.retryCount, lastError: exception.message }
      ),
    };
  }
}
```

**Why Recursive Mapping Works**:

```typescript
// In ExtensibleExceptionFilter.mapException()
if (this.maxRetriesHandler.canHandle(exception)) {
  const result = this.maxRetriesHandler.handle(exception, context);

  // If handler unwrapped an error, recursively map it
  if (result.unwrappedError) {
    return this.mapException(result.unwrappedError, context); // RECURSIVE
  }

  return result;
}
```

---

### Pattern 2: Simple Unwrapping Handler

**File**: `src/shared/response/handlers/business-logic-failure.handler.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { BusinessLogicFailureException } from '@shared/response/exceptions';

/**
 * Unwraps BusinessLogicFailureException from BaseCommandHandler
 *
 * BaseCommandHandler wraps Result.fail() in BusinessLogicFailureException
 * This handler extracts the original domain error for recursive mapping
 */
@Injectable()
export class BusinessLogicFailureHandler {
  canHandle(exception: unknown): boolean {
    return exception instanceof BusinessLogicFailureException;
  }

  /**
   * Unwraps the original error from transaction wrapper
   *
   * @returns Original error for recursive mapping
   */
  unwrap(exception: BusinessLogicFailureException): unknown {
    const originalError = exception.getOriginalError();
    return originalError;
  }
}
```

**Usage in Filter**:

```typescript
// In ExtensibleExceptionFilter.mapException()
if (this.businessLogicHandler.canHandle(exception)) {
  const unwrapped = this.businessLogicHandler.unwrap(exception);
  return this.mapException(unwrapped, context); // RECURSIVE
}
```

---

### Pattern 3: Domain Error Mapping Handler

**File**: `src/shared/response/handlers/domain-error.handler.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { LOGGER_SERVICE, type ILoggerService } from '@shared/infrastructure/logging';
import { ERROR_MAPPING_REGISTRY } from '@shared/response/error-mapping';
import { BaseApplicationException, FrameworkException } from '@shared/response/exceptions';
import { BusinessLogicFailureException } from '@shared/response/exceptions';
import { ErrorContext, ErrorSeverity } from '@shared/response/interfaces';
import type { ErrorMappingRegistry } from '@shared/response/error-mapping';

@Injectable()
export class DomainErrorHandler {
  constructor(
    @Inject(LOGGER_SERVICE) private readonly logger: ILoggerService,
    @Inject(ERROR_MAPPING_REGISTRY) private readonly errorRegistry: ErrorMappingRegistry
  ) {}

  canHandle(exception: unknown): boolean {
    // Unwrap BusinessLogicFailureException to check inner error
    if (exception instanceof BusinessLogicFailureException) {
      return this.canHandle(exception.getOriginalError()); // Recursive check
    }

    // Check for domain error (has 'code' property starting with 'D_')
    if (exception instanceof Error && 'code' in exception) {
      const code = (exception as any).code;
      return typeof code === 'string' && code.startsWith('D_');
    }

    return false;
  }

  handle(
    exception: Error & { code: string },
    context: ErrorContext
  ): { status: HttpStatus; mappedException: BaseApplicationException } {
    const errorCode = exception.code;

    // Look up error code in ErrorMappingRegistry (context-specific)
    const errorMapping = this.errorRegistry.getMapping(errorCode, context.domain);

    if (!errorMapping) {
      this.logger.warn('No error mapping found for domain error code', {
        code: errorCode,
        domain: context.domain,
      });

      // Fallback to 400 BAD_REQUEST for unmapped domain errors
      return {
        status: HttpStatus.BAD_REQUEST,
        mappedException: new FrameworkException(
          exception.message,
          errorCode,
          context,
          HttpStatus.BAD_REQUEST,
          { unmapped: true }
        ),
      };
    }

    // Use mapped HTTP status and create FrameworkException
    const mappedException = new FrameworkException(
      exception.message,
      errorCode,
      context,
      errorMapping.httpStatus,
      { domainError: true }
    );

    return {
      status: errorMapping.httpStatus,
      mappedException,
    };
  }
}
```

**ErrorMappingRegistry Example**:

```typescript
// src/shared/response/error-mapping/error-mapping.registry.ts
export class ErrorMappingRegistry {
  private mappings = new Map<string, HttpStatus>();

  register(errorCode: ProjectErrorCode, httpStatus: HttpStatus): void {
    this.mappings.set(errorCode, httpStatus);
  }

  getMapping(errorCode: string, domain?: string): { httpStatus: HttpStatus } | null {
    const status = this.mappings.get(errorCode);
    return status ? { httpStatus: status } : null;
  }
}

// Registration example (in module)
registry.register(ProjectErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
registry.register(ProjectErrorCode.AUTH_INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
registry.register(ProjectErrorCode.GEO_ADDRESS_COOLDOWN, HttpStatus.CONFLICT);
```

---

### Pattern 4: Validation Error Preservation Handler

**File**: `src/shared/response/handlers/validation-exception.handler.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { LOGGER_SERVICE, type ILoggerService } from '@shared/infrastructure/logging';
import { ValidationException } from '@shared/response/exceptions';
import type { ErrorContext } from '@shared/response/interfaces';

/**
 * CRITICAL: Must come BEFORE HttpExceptionHandler in chain
 *
 * ValidationException extends BaseApplicationException extends HttpException
 * If HttpExceptionHandler was first, it would catch ValidationException generically
 * and lose field-specific validation error details.
 */
@Injectable()
export class ValidationExceptionHandler {
  constructor(@Inject(LOGGER_SERVICE) private readonly logger: ILoggerService) {}

  canHandle(exception: unknown): boolean {
    return exception instanceof ValidationException;
  }

  handle(exception: ValidationException, _context: ErrorContext) {
    // Simple passthrough - preserve field errors
    return {
      status: HttpStatus.BAD_REQUEST,
      mappedException: exception, // Pass through as-is
    };
  }
}
```

**Why This Handler Prevented Production Bug**:

**BEFORE** (Monolithic filter):
```typescript
// ValidationException caught by generic HttpException handler
if (exception instanceof HttpException) {
  // Lost field-level validation errors
  return {
    status: exception.getStatus(),
    message: exception.message, // ❌ Only generic message
  };
}
```

**AFTER** (Handler chain with ValidationExceptionHandler):
```typescript
// ValidationException caught by specific handler BEFORE HttpException
if (this.validationExceptionHandler.canHandle(exception)) {
  return this.validationExceptionHandler.handle(exception, context); // ✅ Field errors preserved
}
```

---

### Pattern 5: Zod Validation Error Transformation

**File**: `src/shared/response/handlers/zod-validation.handler.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import { LOGGER_SERVICE, type ILoggerService } from '@shared/infrastructure/logging';
import { ValidationException } from '@shared/response/exceptions';
import type { ErrorContext } from '@shared/response/interfaces';

@Injectable()
export class ZodValidationHandler {
  constructor(@Inject(LOGGER_SERVICE) private readonly logger: ILoggerService) {}

  canHandle(exception: unknown): boolean {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();

      // Check for Zod validation error metadata
      if (typeof response === 'object' && response !== null) {
        return (
          'type' in response &&
          response.type === 'zod_validation_error' &&
          'validationErrors' in response
        );
      }
    }
    return false;
  }

  handle(exception: HttpException, context: ErrorContext) {
    const response = exception.getResponse();
    const metadata = response as any;

    // Extract validation errors from Zod format
    const validationErrors = this.extractValidationErrors(metadata);

    // Transform to ValidationException format
    const mappedException = new ValidationException(
      'Validation failed',
      'ZOD_VALIDATION_ERROR',
      validationErrors,
      context
    );

    return {
      status: HttpStatus.BAD_REQUEST,
      mappedException,
    };
  }

  private extractValidationErrors(metadata: any) {
    // Zod format: { path: ['email'], message: 'Invalid email' }
    // → ValidationException: { property: 'email', constraints: { validation: 'Invalid email' } }
    return metadata.validationErrors.map((error: any) => ({
      property: Array.isArray(error.path) ? error.path.join('.') : String(error.path),
      constraints: { validation: error.message },
      value: error.received,
    }));
  }
}
```

---

### Pattern 6: Database Error Detection Handler

**File**: `src/shared/response/handlers/database-error.handler.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { LOGGER_SERVICE, type ILoggerService } from '@shared/infrastructure/logging';
import { PostgreSQLErrorMapper } from '@shared/infrastructure/database/mappers';
import type { ErrorContext } from '@shared/response/interfaces';

@Injectable()
export class DatabaseErrorHandler {
  constructor(@Inject(LOGGER_SERVICE) private readonly logger: ILoggerService) {}

  canHandle(exception: unknown): boolean {
    if (!(exception instanceof Error)) {
      return false;
    }

    // Method 1: PostgreSQL error code pattern (5 alphanumeric chars)
    const pgErrorCode = (exception as any).code;
    if (typeof pgErrorCode === 'string' && /^[0-9A-Z]{5}$/.test(pgErrorCode)) {
      return true;
    }

    // Method 2: PostgreSQL-specific properties
    if (
      'severity' in exception ||
      'routine' in exception ||
      'file' in exception ||
      'schema' in exception ||
      'table' in exception
    ) {
      return true;
    }

    // Method 3: Message patterns
    const pgPatterns = [
      /duplicate key value violates unique constraint/i,
      /violates foreign key constraint/i,
      /violates check constraint/i,
      /could not connect to server/i,
      /connection terminated/i,
    ];

    return pgPatterns.some(pattern => pattern.test(exception.message));
  }

  handle(exception: Error, context: ErrorContext) {
    // Delegate to PostgreSQLErrorMapper for detailed error code handling
    const { status, mappedException } = PostgreSQLErrorMapper.mapError(exception, context);

    return { status, mappedException };
  }
}
```

**PostgreSQLErrorMapper Examples**:

```typescript
// PostgreSQLErrorMapper handles specific PostgreSQL error codes
switch (errorCode) {
  case '23505': // Unique constraint violation
    return {
      status: HttpStatus.CONFLICT,
      mappedException: new InfrastructureException(
        'Duplicate entry',
        'DUPLICATE_ENTRY',
        context,
        ErrorSeverity.MEDIUM,
        { constraint: exception.constraint }
      ),
    };

  case '23503': // Foreign key violation
    return {
      status: HttpStatus.BAD_REQUEST,
      mappedException: new InfrastructureException(
        'Referenced resource does not exist',
        'FOREIGN_KEY_VIOLATION',
        context,
        ErrorSeverity.MEDIUM
      ),
    };

  case '08001': // Connection error
  case '08006':
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      mappedException: new InfrastructureException(
        'Database connection failed',
        'DATABASE_CONNECTION_ERROR',
        context,
        ErrorSeverity.CRITICAL
      ),
    };
}
```

---

### Pattern 7: Fallback Generic Error Handler

**File**: `src/shared/response/handlers/generic-error.handler.ts`

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { LOGGER_SERVICE, type ILoggerService } from '@shared/infrastructure/logging';
import { InfrastructureException } from '@shared/response/exceptions';
import { ErrorContext, ErrorSeverity } from '@shared/response/interfaces';

/**
 * Fallback handler for unhandled errors
 *
 * CRITICAL: Must be LAST in handler chain
 * Always returns true (matches all exceptions)
 */
@Injectable()
export class GenericErrorHandler {
  constructor(@Inject(LOGGER_SERVICE) private readonly logger: ILoggerService) {}

  canHandle(_exception: unknown): boolean {
    return true; // ALWAYS matches - fallback handler
  }

  handle(exception: unknown, context: ErrorContext) {
    const error = exception instanceof Error ? exception : new Error(String(exception));

    this.logger.error('Unhandled exception caught by GenericErrorHandler', {
      message: error.message,
      stack: error.stack,
      domain: context.domain,
      operation: context.operation,
    });

    const mappedException = new InfrastructureException(
      'Internal server error',
      'INTERNAL_SERVER_ERROR',
      context,
      ErrorSeverity.CRITICAL,
      {
        originalMessage: error.message,
        originalType: error.constructor.name,
      }
    );

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      mappedException,
    };
  }
}
```

---

## 📋 Rules

### MUST

1. **MUST maintain handler priority order** (unwrapping → specific → generic → fallback)
2. **MUST implement handler interface** (`canHandle()` + `handle()`)
3. **MUST use `@Inject(LOGGER_SERVICE)` for logging** in all handlers
4. **MUST place ValidationExceptionHandler BEFORE HttpExceptionHandler** (field errors preservation)
5. **MUST place GenericErrorHandler LAST** (fallback - always matches)
6. **MUST return `unwrappedError` for recursive mapping** (MaxRetries, BusinessLogic handlers)
7. **MUST register all handlers in ResponseModule providers** array (dependency injection)
8. **MUST inject all handlers in ExtensibleExceptionFilter constructor** (same order as priority)

### MUST NOT

1. **MUST NOT modify ExtensibleExceptionFilter to add new error types** (use new handler instead)
2. **MUST NOT change handler priority order** without understanding specificity rules
3. **MUST NOT place generic handlers before specific handlers** (loses error details)
4. **MUST NOT skip `canHandle()` check** in filter (every handler must be asked)
5. **MUST NOT throw exceptions from handlers** (handle gracefully, return mapped exception)
6. **MUST NOT use `new Logger()` in handlers** (use LOGGER_SERVICE token)
7. **MUST NOT create handlers without tests** (test `canHandle()` and `handle()` separately)

---

## ⚠️ Anti-Patterns

### Anti-Pattern 1: Wrong Handler Priority Order

**❌ WRONG**:

```typescript
// HttpExceptionHandler BEFORE ValidationExceptionHandler
constructor(
  private readonly httpExceptionHandler: HttpExceptionHandler, // ❌ Too early
  private readonly validationExceptionHandler: ValidationExceptionHandler,
) {}

private mapException(exception: unknown, context: ErrorContext) {
  // HttpException check catches ValidationException (parent class)
  if (this.httpExceptionHandler.canHandle(exception)) {
    return this.httpExceptionHandler.handle(exception, context); // ❌ FIELD ERRORS LOST
  }

  // Never reached for ValidationException
  if (this.validationExceptionHandler.canHandle(exception)) {
    return this.validationExceptionHandler.handle(exception, context);
  }
}
```

**Result**: ValidationException caught generically, field-level errors lost.

**✅ CORRECT**:

```typescript
// ValidationExceptionHandler BEFORE HttpExceptionHandler
constructor(
  private readonly validationExceptionHandler: ValidationExceptionHandler, // ✅ Specific first
  private readonly httpExceptionHandler: HttpExceptionHandler,
) {}

private mapException(exception: unknown, context: ErrorContext) {
  // Specific check first
  if (this.validationExceptionHandler.canHandle(exception)) {
    return this.validationExceptionHandler.handle(exception, context); // ✅ FIELD ERRORS PRESERVED
  }

  // Generic check second
  if (this.httpExceptionHandler.canHandle(exception)) {
    return this.httpExceptionHandler.handle(exception, context);
  }
}
```

---

### Anti-Pattern 2: Not Implementing Handler Interface

**❌ WRONG**:

```typescript
@Injectable()
export class CustomErrorHandler {
  // ❌ No canHandle() method

  handle(exception: CustomError, context: ErrorContext) {
    return { status: 400, mappedException: ... };
  }
}
```

**Problems**:
- ❌ Filter cannot ask "can you handle this?"
- ❌ Handler always called even for wrong exception types
- ❌ Runtime errors when casting exception to CustomError

**✅ CORRECT**:

```typescript
@Injectable()
export class CustomErrorHandler {
  canHandle(exception: unknown): boolean {
    return exception instanceof CustomError; // ✅ Type guard
  }

  handle(exception: CustomError, context: ErrorContext) {
    return { status: 400, mappedException: ... };
  }
}
```

---

### Anti-Pattern 3: Missing Recursive Mapping for Wrappers

**❌ WRONG**:

```typescript
@Injectable()
export class MaxRetriesErrorHandler {
  handle(exception: MaxRetriesExceededError, context: ErrorContext) {
    // ❌ Always returns 503, ignores inner error type
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      mappedException: new InfrastructureException('Retries exceeded', ...),
    };
  }
}
```

**Result**: Domain error wrapped in retry → always 503 instead of proper 404/409/etc.

**✅ CORRECT**:

```typescript
@Injectable()
export class MaxRetriesErrorHandler {
  handle(exception: MaxRetriesExceededError, context: ErrorContext) {
    const innerError = exception.cause;

    if (innerError) {
      // ✅ Return unwrappedError for recursive mapping
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        mappedException: new InfrastructureException('Retries exceeded', ...),
        unwrappedError: innerError, // RECURSIVE MAPPING
      };
    }

    return { status: HttpStatus.SERVICE_UNAVAILABLE, mappedException: ... };
  }
}
```

**Filter Support**:

```typescript
// ExtensibleExceptionFilter.mapException()
if (this.maxRetriesHandler.canHandle(exception)) {
  const result = this.maxRetriesHandler.handle(exception, context);

  if (result.unwrappedError) {
    return this.mapException(result.unwrappedError, context); // ✅ RECURSIVE
  }

  return result;
}
```

---

### Anti-Pattern 4: Modifying Filter Instead of Adding Handler

**❌ WRONG**:

```typescript
// Adding GraphQL error handling to ExtensibleExceptionFilter
@Catch()
export class ExtensibleExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    // ❌ Modify filter to add new error type
    if (exception instanceof GraphQLError) {
      // 50 lines of GraphQL error handling logic
      return this.handleGraphQLError(exception);
    }

    // ... existing handler chain
  }
}
```

**Problems**:
- ❌ Violates Open/Closed Principle
- ❌ Filter grows back to monolithic size
- ❌ Cannot test GraphQL handling in isolation

**✅ CORRECT**:

```typescript
// Create new GraphQLErrorHandler
@Injectable()
export class GraphQLErrorHandler {
  constructor(@Inject(LOGGER_SERVICE) private readonly logger: ILoggerService) {}

  canHandle(exception: unknown): boolean {
    return exception instanceof GraphQLError;
  }

  handle(exception: GraphQLError, context: ErrorContext) {
    // GraphQL-specific transformation logic
    return { status, mappedException };
  }
}

// Register in ResponseModule
providers: [
  // ... existing handlers
  GraphQLErrorHandler, // ✅ New handler added
],

// Inject in ExtensibleExceptionFilter
constructor(
  // ... existing handlers
  private readonly graphQLHandler: GraphQLErrorHandler, // ✅ Injected
) {}

// Add to handler chain (at appropriate priority)
if (this.graphQLHandler.canHandle(exception)) {
  return this.graphQLHandler.handle(exception, context);
}
```

---

### Anti-Pattern 5: Using `new Logger()` Instead of LOGGER_SERVICE

**❌ WRONG**:

```typescript
@Injectable()
export class CustomErrorHandler {
  private readonly logger = new Logger(CustomErrorHandler.name); // ❌ Direct instantiation

  handle(exception: CustomError, context: ErrorContext) {
    this.logger.error('Custom error occurred', exception.message);
    return { status, mappedException };
  }
}
```

**Problems**:
- ❌ No test isolation (cannot inject mock logger)
- ❌ No PII redaction (see logger-pattern.md)
- ❌ No request correlation

**✅ CORRECT**:

```typescript
@Injectable()
export class CustomErrorHandler {
  constructor(@Inject(LOGGER_SERVICE) private readonly logger: ILoggerService) {} // ✅ DI

  handle(exception: CustomError, context: ErrorContext) {
    // ✅ Structured logging with automatic PII redaction
    this.logger.error('Custom error occurred', {
      message: exception.message,
      domain: context.domain,
      operation: context.operation,
    });
    return { status, mappedException };
  }
}
```

---

### Anti-Pattern 6: Handler Throws Instead of Returning Mapped Exception

**❌ WRONG**:

```typescript
@Injectable()
export class DomainErrorHandler {
  handle(exception: Error & { code: string }, context: ErrorContext) {
    const errorMapping = this.errorRegistry.getMapping(exception.code, context.domain);

    if (!errorMapping) {
      // ❌ Throws instead of handling gracefully
      throw new Error(`No mapping for error code: ${exception.code}`);
    }

    return { status: errorMapping.httpStatus, mappedException: ... };
  }
}
```

**Result**: Filter crashes, client receives 500 instead of proper error response.

**✅ CORRECT**:

```typescript
@Injectable()
export class DomainErrorHandler {
  handle(exception: Error & { code: string }, context: ErrorContext) {
    const errorMapping = this.errorRegistry.getMapping(exception.code, context.domain);

    if (!errorMapping) {
      // ✅ Graceful fallback
      this.logger.warn('No error mapping found for domain error code', {
        code: exception.code,
        domain: context.domain,
      });

      return {
        status: HttpStatus.BAD_REQUEST,
        mappedException: new FrameworkException(
          exception.message,
          exception.code,
          context,
          HttpStatus.BAD_REQUEST,
          { unmapped: true } // ✅ Flag for monitoring
        ),
      };
    }

    return { status: errorMapping.httpStatus, mappedException: ... };
  }
}
```

---

## 📚 References

### ADRs
- **ADR-0041**: Error Handler Extraction (docs/adr/0041-error-handler-extraction.md) - Architecture decision record documenting monolithic → handler chain migration

### Implementation Files

**Core Filter & Chain**:
- `src/shared/response/filters/extensible-exception.filter.ts` - Chain orchestrator (70 lines, down from 833)
- `src/shared/response/handlers/index.ts` - Barrel export for all 9 handlers

**9 Specialized Handlers**:
1. `src/shared/response/handlers/max-retries-error.handler.ts` - Unwrap retry mechanism (142 lines)
2. `src/shared/response/handlers/business-logic-failure.handler.ts` - Unwrap transaction wrapper (44 lines)
3. `src/shared/response/handlers/domain-error.handler.ts` - Map domain errors via registry (159 lines)
4. `src/shared/response/handlers/base-response-error.handler.ts` - Passthrough Swagger errors (53 lines)
5. `src/shared/response/handlers/validation-exception.handler.ts` - Preserve field errors (49 lines)
6. `src/shared/response/handlers/zod-validation.handler.ts` - Format Zod validation errors (120 lines)
7. `src/shared/response/handlers/http-exception.handler.ts` - Generic NestJS exceptions (44 lines)
8. `src/shared/response/handlers/database-error.handler.ts` - PostgreSQL error detection (67 lines)
9. `src/shared/response/handlers/generic-error.handler.ts` - Fallback catch-all (50 lines)

**Supporting Infrastructure**:
- `src/shared/response/modules/response.module.ts` - Handler registration/DI (356 lines)
- `src/shared/response/error-mapping/error-mapping.registry.ts` - Domain error → HTTP status mapping
- `src/shared/infrastructure/database/mappers/postgresql-error.mapper.ts` - PostgreSQL error code mapping

### Related Patterns
- **domain-errors-pattern.md** - Defines domain error codes mapped by DomainErrorHandler
- **logger-pattern.md** - All handlers use LOGGER_SERVICE for structured logging
- **transactional-pattern.md** - BusinessLogicFailureException unwrapped by handler chain

### External References
- [Chain of Responsibility Pattern (Gang of Four)](https://refactoring.guru/design-patterns/chain-of-responsibility)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)

---

## 🎯 When to Use

### ✅ Add New Error Handler When:

| Scenario | Example | Handler Priority |
|----------|---------|------------------|
| **New Exception Wrapper** | GraphQL errors wrapping domain errors | Priority 1-2 (unwrapping) |
| **New Domain/Framework** | Prisma ORM errors, TypeORM errors | Priority 3-7 (specific) |
| **New Validation Library** | Joi validation, Yup validation | Priority 6 (validation) |
| **New Infrastructure** | Redis errors, Elasticsearch errors | Priority 8 (infrastructure) |

**Decision Tree**:

```
Does this exception type wrap other exceptions?
├─ YES → Create unwrapping handler (Priority 1-2) with recursive mapping
│
└─ NO → Is this a domain/business error?
    ├─ YES → Add to ErrorMappingRegistry (no new handler needed)
    │
    └─ NO → Is this a validation error?
        ├─ YES → Create validation handler (Priority 5-6)
        │
        └─ NO → Is this framework-specific?
            ├─ YES → Create specific handler (Priority 7)
            │
            └─ NO → Is this infrastructure-specific?
                ├─ YES → Create infrastructure handler (Priority 8)
                │
                └─ NO → Falls through to GenericErrorHandler (Priority 9)
```

---

### 📊 Handler Addition Checklist

When adding a new error handler:

**1. Create Handler Class**:
```typescript
// src/shared/response/handlers/new-error.handler.ts
@Injectable()
export class NewErrorHandler {
  constructor(@Inject(LOGGER_SERVICE) private readonly logger: ILoggerService) {}

  canHandle(exception: unknown): boolean {
    return exception instanceof NewErrorType;
  }

  handle(exception: NewErrorType, context: ErrorContext) {
    return { status, mappedException };
  }
}
```

**2. Write Tests**:
```typescript
// src/shared/response/handlers/__tests__/new-error.handler.spec.ts
describe('NewErrorHandler', () => {
  it('should handle NewErrorType', () => {
    const handler = new NewErrorHandler(mockLogger);
    const exception = new NewErrorType('Test error');

    expect(handler.canHandle(exception)).toBe(true);
  });

  it('should map to correct HTTP status', () => {
    const result = handler.handle(exception, context);

    expect(result.status).toBe(HttpStatus.BAD_REQUEST);
    expect(result.mappedException).toBeInstanceOf(FrameworkException);
  });
});
```

**3. Register in ResponseModule**:
```typescript
// src/shared/response/modules/response.module.ts
providers: [
  // ... existing handlers
  NewErrorHandler, // Add here
],
```

**4. Inject in ExtensibleExceptionFilter**:
```typescript
// src/shared/response/filters/extensible-exception.filter.ts
constructor(
  // ... existing handlers (maintain priority order)
  private readonly newErrorHandler: NewErrorHandler, // Add at appropriate position
  // ...
) {}
```

**5. Add to Handler Chain**:
```typescript
// In mapException() method (at correct priority position)
if (this.newErrorHandler.canHandle(exception)) {
  return this.newErrorHandler.handle(exception, context);
}
```

**6. Update Barrel Export**:
```typescript
// src/shared/response/handlers/index.ts
export * from './new-error.handler';
```

---

## 📊 Statistics

**Error Handler Chain Metrics** (as of 2026-01-04):

| Metric | Before ADR-0041 | After ADR-0041 | Improvement |
|--------|-----------------|----------------|-------------|
| ExtensibleExceptionFilter LoC | 833 | 70 | **91% reduction** |
| Number of handlers | 1 (monolithic) | 9 (specialized) | **9x modularity** |
| Average handler LoC | 833 | 78 | **90% reduction** |
| Test coverage (handlers) | 45% | 92% | **47% improvement** |
| Production bugs (field errors lost) | 1 (critical) | 0 | **100% fix** |

**Handler Distribution**:

| Category | Handlers | Total LoC | Purpose |
|----------|----------|-----------|---------|
| Unwrapping (recursive) | 2 | 186 | MaxRetries, BusinessLogic |
| Domain/Validation | 4 | 378 | Domain, BaseResponse, Validation, Zod |
| Framework | 1 | 44 | HttpException |
| Infrastructure | 2 | 117 | Database, Generic |
| **Total** | **9** | **725** | Complete chain |

**Filter Complexity**:

```
Cyclomatic Complexity:
- Before: 23 (high complexity)
- After: 4 (low complexity)

Lines per Responsibility:
- Before: 55 lines/exception type (833 / 15)
- After: 78 lines/handler (725 / 9 handlers)

Testability:
- Before: Integration tests only (full filter)
- After: Unit tests per handler + integration tests
```

---

## 🔍 Testing Error Handlers

### Unit Test Example

```typescript
// src/shared/response/handlers/__tests__/domain-error.handler.spec.ts
import { Test } from '@nestjs/testing';
import { DomainErrorHandler } from '../domain-error.handler';
import { LOGGER_SERVICE } from '@shared/infrastructure/logging';
import { ERROR_MAPPING_REGISTRY } from '@shared/response/error-mapping';

describe('DomainErrorHandler', () => {
  let handler: DomainErrorHandler;
  let mockLogger: jest.Mocked<ILoggerService>;
  let mockRegistry: jest.Mocked<ErrorMappingRegistry>;

  beforeEach(async () => {
    mockLogger = {
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    mockRegistry = {
      getMapping: jest.fn(),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        DomainErrorHandler,
        {
          provide: LOGGER_SERVICE,
          useValue: mockLogger,
        },
        {
          provide: ERROR_MAPPING_REGISTRY,
          useValue: mockRegistry,
        },
      ],
    }).compile();

    handler = module.get(DomainErrorHandler);
  });

  describe('canHandle', () => {
    it('should return true for domain errors (code starts with D_)', () => {
      const error = new Error('Test error');
      (error as any).code = 'D_NOT_FOUND';

      expect(handler.canHandle(error)).toBe(true);
    });

    it('should return false for non-domain errors', () => {
      const error = new Error('Test error');

      expect(handler.canHandle(error)).toBe(false);
    });

    it('should unwrap BusinessLogicFailureException and check inner error', () => {
      const domainError = new Error('Domain error');
      (domainError as any).code = 'D_VALIDATION_FAILED';

      const wrapper = new BusinessLogicFailureException(domainError);

      expect(handler.canHandle(wrapper)).toBe(true);
    });
  });

  describe('handle', () => {
    it('should map domain error using ErrorMappingRegistry', () => {
      const error = new Error('User not found');
      (error as any).code = 'D_NOT_FOUND';

      mockRegistry.getMapping.mockReturnValue({
        httpStatus: HttpStatus.NOT_FOUND,
      });

      const context: ErrorContext = {
        domain: 'auth',
        operation: 'getUserById',
      };

      const result = handler.handle(error as any, context);

      expect(result.status).toBe(HttpStatus.NOT_FOUND);
      expect(result.mappedException).toBeInstanceOf(FrameworkException);
      expect(mockRegistry.getMapping).toHaveBeenCalledWith('D_NOT_FOUND', 'auth');
    });

    it('should fallback to 400 BAD_REQUEST for unmapped errors', () => {
      const error = new Error('Unknown error');
      (error as any).code = 'D_UNKNOWN';

      mockRegistry.getMapping.mockReturnValue(null); // No mapping

      const context: ErrorContext = {
        domain: 'auth',
        operation: 'doSomething',
      };

      const result = handler.handle(error as any, context);

      expect(result.status).toBe(HttpStatus.BAD_REQUEST);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No error mapping found for domain error code',
        expect.objectContaining({ code: 'D_UNKNOWN', domain: 'auth' })
      );
    });
  });
});
```

---

**Version**: 1.0
**Created**: 2026-01-04
**Primary Users**: infrastructure-testing-implementer, code-quality-verifier, security-e2e-verifier
**ADR**: ADR-0041 (Error Handler Extraction)
**Impact**: 91% LoC reduction, 47% test coverage improvement, 100% field error bug fix

---

**Maintained By**: @project-project-orchestrator
**Approved By**: Business owner + Technical architect (2026-01-04)
