# DDD Domain Services Reference

**Purpose**: Cross-aggregate business logic patterns
**Audience**: domain-application-implementer
**Philosophy**: Code + concise rules, NO verbose explanations

---

## Core Rules

1. **@Injectable()**: Domain services are NestJS services
2. **Stateless**: No instance variables (except injected dependencies)
3. **Cross-aggregate logic**: Operations involving multiple aggregates
4. **Pure domain**: NO infrastructure (database, HTTP, file system)
5. **Uses PolicyBuilder**: Complex business rules via policies

---

## When to Use Domain Service

| Scenario | Use Domain Service? |
|----------|---------------------|
| Single aggregate invariant (1-2 checks) | NO - inline in aggregate |
| Complex rules (3+ specifications) | YES |
| Cross-aggregate validation | YES |
| Policy with warnings + errors | YES |
| Requires external data for validation | NO - use application layer |

---

## Template

```typescript
import { Injectable } from '@nestjs/common';
import { Result } from '@vytches/ddd';

import { createAddressChangePolicy } from '../policies/residence';
import type { UserResidenceAggregate } from '../aggregates';
import { AddressChangeCooldownError, OutsideServiceAreaError } from '../errors';

/**
 * Domain Service for address change business rules
 *
 * Encapsulates complex validation using PolicyBuilder.
 * Called by Application Handler before aggregate method.
 */
@Injectable()
export class AddressChangeDomainService {
  /**
   * Validate if address change is allowed
   *
   * Uses PolicyBuilder to compose multiple specifications:
   * - AddressChangeCooldownSpecification (30-day cooldown)
   * - PolishCoordinatesSpecification (within Poland)
   * - ServiceAreaSpecification (city enabled for service)
   */
  public canChangeAddress(
    residence: UserResidenceAggregate,
    newCoordinates: { latitude: number; longitude: number }
  ): Result<void> {
    // Create policy (composes multiple specifications)
    const policy = createAddressChangePolicy();

    // Get context from aggregate
    const context = residence.getSpecificationContext();

    // Extend context with new coordinates
    const extendedContext = {
      ...context,
      newCoordinates,
    };

    // Execute policy check
    const result = policy.check({ entity: extendedContext });

    if (!result.passed) {
      return Result.fail(this.mapViolationToError(result.violations[0]));
    }

    return Result.empty();
  }

  /**
   * Map policy violation to domain error
   */
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

## Usage in Handler

```typescript
@Injectable()
@CommandHandler(ChangeAddressCommand)
export class ChangeAddressHandler implements ICommandHandler<ChangeAddressCommand> {
  constructor(
    private readonly residenceRepository: IUserResidenceRepository,
    private readonly addressChangeService: AddressChangeDomainService,  // Inject
  ) {}

  @Transactional()
  async execute(command: ChangeAddressCommand): Promise<Result<void>> {
    try {
      // 1. Load aggregate
      const residence = await this.residenceRepository.findById(command.residenceId);

      // 2. Domain Service validates complex rules
      const canChange = this.addressChangeService.canChangeAddress(
        residence,
        command.newCoordinates
      );
      if (canChange.isFailure) {
        return canChange;  // Triggers rollback
      }

      // 3. Aggregate method (simple invariants)
      const result = residence.changeAddress(command.newAddress, command.newCoordinates);
      if (result.isFailure) {
        return result;
      }

      // 4. Save
      await this.residenceRepository.save(residence);

      return Result.empty();

    } catch (error) {
      return Result.fail(new InfrastructureError(error.message));
    }
  }
}
```

---

## Cross-Aggregate Example

```typescript
@Injectable()
export class UserRegistrationDomainService {
  /**
   * Validate registration business rules
   *
   * Cross-aggregate validation: checks user + district data
   */
  public canRegisterInDistrict(
    email: Email,
    districtCode: string,
    districts: DistrictAggregate[]
  ): Result<void> {
    // Check if district exists
    const district = districts.find(d => d.code === districtCode);
    if (!district) {
      return Result.fail(new DistrictNotFoundError(districtCode));
    }

    // Check if district accepts new users
    if (!district.isAcceptingRegistrations) {
      return Result.fail(new DistrictClosedError(districtCode));
    }

    // Check district capacity
    if (district.currentUserCount >= district.maxUsers) {
      return Result.fail(new DistrictAtCapacityError(districtCode));
    }

    return Result.empty();
  }
}

// Handler usage
@CommandHandler(RegisterUserCommand)
export class RegisterUserHandler {
  constructor(
    private readonly registrationService: UserRegistrationDomainService,
    private readonly districtRepository: IDistrictRepository,
  ) {}

  @Transactional()
  async execute(command: RegisterUserCommand): Promise<Result<UserId>> {
    // Load all districts (cross-aggregate data)
    const districts = await this.districtRepository.findAll();

    // Domain Service validates cross-aggregate rules
    const canRegister = this.registrationService.canRegisterInDistrict(
      email,
      command.districtCode,
      districts
    );
    if (canRegister.isFailure) {
      return canRegister;
    }

    // Aggregate creation (single aggregate)
    const user = UserIdentityAggregate.create(email, password);
    await this.userRepository.save(user);

    return Result.ok(user.getId());
  }
}
```

---

## Domain Service vs Application Service

| Concern | Domain Service | Application Service |
|---------|----------------|---------------------|
| **Layer** | Domain layer | Application layer |
| **Dependencies** | Other domain objects | Infrastructure (repos, APIs) |
| **Purpose** | Business rules | Orchestration |
| **Testability** | Unit tests (pure) | Integration tests |
| **Example** | Address change validation | Send email + save user |

```typescript
// ✅ Domain Service (pure business logic)
@Injectable()
export class AddressChangeDomainService {
  canChangeAddress(residence: UserResidenceAggregate): Result<void> {
    const policy = createAddressChangePolicy();
    return policy.check(residence.getSpecificationContext());
  }
}

// ✅ Application Service (orchestration + infrastructure)
@Injectable()
export class UserRegistrationApplicationService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly emailService: IEmailService,
    private readonly eventBus: EventBus,
  ) {}

  async registerUser(command: RegisterUserCommand): Promise<Result<UserId>> {
    // Orchestrates: domain + infrastructure
    const user = UserIdentityAggregate.create(email, password);
    await this.userRepository.save(user);
    await this.emailService.sendWelcome(email);
    await this.eventBus.publish(new UserRegisteredEvent(...));
    return Result.ok(user.getId());
  }
}
```

---

## Anti-Patterns

### Infrastructure in Domain Service
```typescript
// ❌ WRONG: database query in domain service
@Injectable()
export class AddressChangeDomainService {
  constructor(private readonly userRepository: IUserRepository) {}

  async canChangeAddress(residenceId: string): Promise<Result<void>> {
    const residence = await this.userRepository.findById(residenceId);  // ❌
    // ...
  }
}

// ✅ CORRECT: handler loads data, domain service validates
@Injectable()
export class AddressChangeDomainService {
  canChangeAddress(residence: UserResidenceAggregate): Result<void> {
    // Pure validation, NO infrastructure
    const policy = createAddressChangePolicy();
    return policy.check(residence.getSpecificationContext());
  }
}
```

### Stateful Domain Service
```typescript
// ❌ WRONG: instance variables
@Injectable()
export class AddressChangeDomainService {
  private currentResidence: UserResidenceAggregate;  // ❌

  setResidence(residence: UserResidenceAggregate) {
    this.currentResidence = residence;
  }
}

// ✅ CORRECT: stateless, parameters only
@Injectable()
export class AddressChangeDomainService {
  canChangeAddress(residence: UserResidenceAggregate): Result<void> {
    // Stateless - all data via parameters
  }
}
```

---

## Checklist

- [ ] `@Injectable()` decorator
- [ ] Stateless (no instance variables)
- [ ] Pure business logic (NO infrastructure)
- [ ] Cross-aggregate operations OR complex policies
- [ ] Returns `Result<T, E>`
- [ ] Used by application handlers
- [ ] Unit testable (no mocks needed)

**References**:
- `src/contexts/geographic-auth/domain/services/address-change.domain-service.ts`
- `.claude/knowledge/reference/ddd/specifications-and-policies.md`
- `.claude/knowledge/learned/domain-layer-patterns.md`
