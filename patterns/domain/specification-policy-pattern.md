# DDD Specifications & Policies Reference

**Purpose**: Core patterns for business rules using PolicyBuilder and Specifications
**Audience**: domain-application-implementer
**Philosophy**: Code + concise rules, NO verbose explanations

---

## Core Rules (ADR-0035)

1. **Specifications = Single Source of Truth** for ALL business rules
2. **ALWAYS use PolicyBuilder.must()** - NEVER `BusinessRuleValidator.addRule()`
3. **Aggregates delegate to Specifications** - NO inline logic
4. **Policies compose Specifications** - multi-rule validation
5. **Test specifications independently** - foundation of test pyramid

---

## Specification Template

```typescript
import { CompositeSpecification } from '@vytches/ddd';

// Context interface (NOT aggregate)
export interface SessionContext {
  session?: {
    sessionId: string;
    deviceInfo: { userAgent: string; ipAddress: string };
    createdAt: Date;
    expiresAt: Date;
  };
  currentDeviceInfo?: { userAgent: string; ipAddress: string };
}

// Specification uses context
export class IPConsistencySpecification extends CompositeSpecification<SessionContext> {
  isSatisfiedBy(ctx: SessionContext): boolean {
    if (!ctx.currentDeviceInfo || !ctx.session?.deviceInfo) return true;

    return this.isSameSubnet(
      ctx.session.deviceInfo.ipAddress,
      ctx.currentDeviceInfo.ipAddress
    );
  }

  private isSameSubnet(original: string, current: string): boolean {
    const originalOctets = original.split('.').slice(0, 3);
    const currentOctets = current.split('.').slice(0, 3);
    return originalOctets.join('.') === currentOctets.join('.');
  }
}
```

---

## PolicyBuilder Pattern (MANDATORY)

```typescript
import { PolicyBuilder, PolicyContextFactory } from '@vytches/ddd';

// Factory function (NEVER class with constructor)
export function createSessionValidationPolicy() {
  return PolicyBuilder.create<SessionContext>()
    .withId('session-validation')           // REQUIRED
    .withDomain('auth')                     // REQUIRED
    .withName('Session Validation Policy')  // REQUIRED

    // MUST rules - fail with ERROR (blocking)
    .must(new SessionExistsSpecification())
      .withCode('SESSION_NOT_FOUND')
      .withMessage('Session not found')
      .withSeverity('ERROR')
    .and()

    // SHOULD rules - fail with WARNING (non-blocking)
    .should(new DeviceConsistencySpecification())
      .withCode('DEVICE_MISMATCH')
      .withSeverity('WARNING')

    .build();
}

// Usage in @Injectable() service
@Injectable()
export class SessionValidationService {
  async validate(context: SessionContext): Promise<Result<void>> {
    const policy = createSessionValidationPolicy();

    const result = await policy.check({
      entity: context,
      context: PolicyContextFactory.minimal(context.userId), // REQUIRED
    });

    if (result.isFailure) {
      return Result.fail(new SessionError(result.error.message));
    }
    return Result.ok();
  }
}
```

---

## Async Specifications

```typescript
import { AsyncCompositeSpecification } from '@vytches/ddd';

export class HasPermissionSpecification extends AsyncCompositeSpecification<PermissionContext> {
  constructor(private readonly permissionService: IPermissionService) {
    super();
  }

  async isSatisfiedByAsync(ctx: PermissionContext): Promise<boolean> {
    const result = await this.permissionService.hasPermission(ctx.userId, ctx.action);
    return result.isSuccess && result.value;
  }
}

// Use .mustAsync() in PolicyBuilder
export function createPermissionPolicy(permissionService: IPermissionService) {
  return PolicyBuilder.create<PermissionContext>()
    .withId('permission-check')
    .withDomain('authorization')
    .withName('Permission Check Policy')
    .mustAsync(new HasPermissionSpecification(permissionService))
      .withCode('PERMISSION_DENIED')
      .withSeverity('ERROR')
    .build();
}
```

---

## Fluent Specification Composition

```typescript
// Compose with .and(), .or(), .not()
const canPerformAction = new EmailVerifiedSpec()
  .and(new NotBlockedSpec())
  .and(
    new HasRoleSpec(RoleType.ADMIN)
      .or(new HasRoleSpec(RoleType.MODERATOR))
  );

// Admin can skip email verification
const adminOrVerified = new HasRoleSpec(RoleType.ADMIN)
  .or(new EmailVerifiedSpec().and(new NotBlockedSpec()));

// Usage
if (canPerformAction.isSatisfiedBy(context)) {
  // Proceed
}
```

---

## Specification in Aggregate (ADR-0035)

```typescript
import { AddressChangeCooldownSpecification } from '../specifications/residence';

class UserResidenceAggregate extends AggregateRoot<string> {
  private _lastAddressChange: Date | null;

  // Expose context for specifications
  public getSpecificationContext(): ResidenceContext {
    return {
      residenceId: this.getId().value,
      lastAddressChange: this._lastAddressChange,
      address: { city: this._address.city, street: this._address.street },
    };
  }

  // Delegate to specification (NO inline logic)
  public canChangeAddress(): boolean {
    const spec = new AddressChangeCooldownSpecification();
    return spec.isSatisfiedBy(this.getSpecificationContext());
  }

  public changeAddress(newAddress: PolishAddress): Result<void> {
    // Use specification for validation
    if (!this.canChangeAddress()) {
      return Result.fail(new AddressChangeCooldownError());
    }

    this._address = newAddress;
    this._lastAddressChange = new Date();
    this.apply(new AddressChangedEvent(this.getId().value, newAddress));
    return Result.ok();
  }
}

// Specification is testable independently (ADR-0035 pyramid)
class AddressChangeCooldownSpecification extends CompositeSpecification<ResidenceContext> {
  isSatisfiedBy(ctx: ResidenceContext): boolean {
    if (!ctx.lastAddressChange) return true;
    const daysSince = this.calculateDaysSince(ctx.lastAddressChange);
    return daysSince >= 30;
  }

  private calculateDaysSince(date: Date): number {
    return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  }
}
```

---

## Policy in Domain Service

```typescript
import { createAddressChangePolicy } from '../policies/residence';

@Injectable()
export class AddressChangeDomainService {
  public canChangeAddress(
    residence: UserResidenceAggregate,
    newCoordinates: { latitude: number; longitude: number }
  ): Result<void> {
    // Policy composes multiple specifications
    const policy = createAddressChangePolicy();

    const context = {
      ...residence.getSpecificationContext(),
      newCoordinates,
    };

    const result = policy.check({ entity: context });

    if (!result.passed) {
      return Result.fail(this.mapViolationToError(result.violations[0]));
    }

    return Result.ok();
  }

  private mapViolationToError(violation: PolicyViolation): BaseError {
    switch (violation.code) {
      case 'ADDRESS_CHANGE_COOLDOWN':
        return new AddressChangeCooldownError(violation.message);
      case 'OUTSIDE_SERVICE_AREA':
        return new OutsideServiceAreaError(violation.message);
      default:
        return new DomainError(violation.message);
    }
  }
}
```

---

## Decision Tree

```
Is it format/structure validation?
├─ YES → Value Object constructor
└─ NO → Create Specification for the rule
         ├─ Simple rule (1 spec) → Aggregate uses Specification directly
         ├─ Complex rule (2+ specs) → Policy composes Specifications
         └─ Cross-aggregate → Domain Service uses Policy
```

---

## Anti-Patterns

### Inline Business Logic
```typescript
// ❌ WRONG: inline logic in aggregate
class UserResidenceAggregate {
  canChangeAddress(): boolean {
    const daysSince = Math.floor(
      (Date.now() - this._lastAddressChange.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSince >= 30;  // ❌ Not testable independently
  }
}

// ✅ CORRECT: delegate to specification
class UserResidenceAggregate {
  canChangeAddress(): boolean {
    const spec = new AddressChangeCooldownSpecification();
    return spec.isSatisfiedBy(this.getSpecificationContext());
  }
}
```

### BusinessRuleValidator (Deprecated)
```typescript
// ❌ WRONG: old pattern
BusinessRuleValidator.addRule(new SomeRule());  // ❌ NEVER use

// ✅ CORRECT: PolicyBuilder
PolicyBuilder.create<Context>()
  .must(new SomeSpecification())
  .build();
```

---

## Checklist

- [ ] Specifications extend `CompositeSpecification<Context>`
- [ ] Context interface (NOT aggregate) for specifications
- [ ] Policies use `PolicyBuilder.create<Context>()`
- [ ] Required: `.withId()`, `.withDomain()`, `.withName()`
- [ ] `.must()` for blocking, `.should()` for warnings
- [ ] `.mustAsync()` for async specifications
- [ ] Aggregates expose `getSpecificationContext()`
- [ ] Aggregates delegate to specifications
- [ ] PolicyContextFactory.minimal() for policy.check()
- [ ] Specifications have independent unit tests

**References**:
- ADR-0035 (Specification-First testing)
- `src/shared/domain/policies/examples/`
- `src/shared/domain/specifications/`
- `.claude/knowledge/learned/domain-layer-patterns.md` (real examples)
