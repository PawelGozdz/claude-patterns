# DDD Conventions & Naming Standards

**Purpose**: Naming conventions, file organization, and code style standards
**Audience**: ALL implementers (domain, application, infrastructure)
**Philosophy**: Consistency = Maintainability

---

## File Naming Conventions

### Domain Layer (file name includes a stem)

| Type | Convention | Example |
|------|------------|---------|
| **Aggregate** | `entity-name.aggregate.ts` | `user-identity.aggregate.ts` |
| **Entity** | `entity-name.entity.ts` | `institutional-announcement.entity.ts` |
| **Value Object** | `name.vo.ts` | `email.vo.ts`, `polish-address.vo.ts` |
| **Domain Event** | `event-name.event.ts` | `user-registered.event.ts` |
| **Specification** | `rule-name.specification.ts` | `address-cooldown.specification.ts` |
| **Policy** | `policy-name.policy.ts` | `address-change.policy.ts` |
| **Domain Service** | `service-name.domain-service.ts` | `address-change.domain-service.ts` |
| **Application Service** | `service-name.service.ts` | `session-management.service.ts` |
| **Repository Interface** | `entity-name.repository.ts` | `user-identity.repository.ts` |
| **Repository Implementation** | `entity-name-kysely.repository.ts` | `user-identity-kysely.repository.ts` |
| **DTO** | `name.dto.ts` | `user-profile.dto.ts` |
| **Controller** | `feature-name.controller.ts` | `authentication.controller.ts` |
| **Mapper** | `entity-name.mapper.ts` | `user-identity-aggregate.mapper.ts` |

### CQRS — folder implies the name (NO folder-prefix)

Command, Query, and Handler files live inside a folder that **already carries the name**. Repeating the name in the filename is redundant noise that makes long imports awkward and obscures diffs.

| Type | ❌ Old (folder-prefixed) | ✅ Current (folder implies name) |
|------|-------------------------|---------------------------------|
| **Command** | `register-user/register-user.command.ts` | `register-user/command.ts` |
| **Query** | `get-user-by-id/get-user-by-id.query.ts` | `get-user-by-id/query.ts` |
| **Handler** | `register-user/register-user.handler.ts` | `register-user/handler.ts` |
| **Handler tests** | `register-user/register-user.handler.spec.ts` | `register-user/__tests__/handler.spec.ts` |
| **Event handler (standalone folder)** | `job-completed/job-completed.integration-handler.ts` | `job-completed/integration-handler.ts` |
| **Event handler (shared folder, keeps stem)** | — | `event-handlers/user-registered.handler.ts` |

**Rule of thumb:**
- If the file lives in a **dedicated folder** whose name already identifies the operation (`commands/register-user/`, `queries/get-user-by-id/`, `event-handlers/job-completed/`) — drop the prefix and use `command.ts` / `query.ts` / `handler.ts` / `integration-handler.ts`.
- If multiple files of the same type share a folder (e.g., `application/event-handlers/` with 5 independent handler files), keep the stem so files are distinguishable.

**Why** (regression history, commit `5b157ecd`): folder-prefixed naming produced imports like `import { RegisterUserCommand } from './commands/register-user/register-user.command'` — the `register-user` appears 3× in one line. The shortened form is `./commands/register-user/command` — unambiguous, scannable in tree view, and survives context-aware autocompletion.

---

## Folder Structure (Bounded Context)

```
src/contexts/{context-name}/
├── domain/
│   ├── aggregates/
│   │   ├── __tests__/
│   │   │   └── user-identity.aggregate.spec.ts
│   │   ├── user-identity.aggregate.ts
│   │   └── index.ts
│   ├── entities/
│   │   ├── __tests__/
│   │   └── entity-name.entity.ts
│   ├── events/
│   │   ├── user-registered.event.ts
│   │   └── index.ts
│   ├── value-objects/
│   │   ├── __tests__/
│   │   ├── email.vo.ts
│   │   └── index.ts
│   ├── specifications/
│   │   ├── __tests__/
│   │   ├── email-unique.specification.ts
│   │   └── index.ts
│   ├── policies/
│   │   ├── __tests__/
│   │   ├── registration.policy.ts
│   │   └── index.ts
│   ├── services/
│   │   ├── __tests__/
│   │   ├── address-change.domain-service.ts
│   │   └── index.ts
│   ├── repositories/
│   │   ├── user-identity.repository.ts  (interface)
│   │   └── index.ts
│   └── errors/
│       ├── user-already-exists.error.ts
│       └── index.ts
├── application/
│   ├── commands/
│   │   ├── register-user/
│   │   │   ├── __tests__/
│   │   │   ├── command.ts
│   │   │   └── handler.ts
│   │   └── index.ts
│   ├── queries/
│   │   ├── get-user-by-id/
│   │   │   ├── __tests__/
│   │   │   ├── query.ts
│   │   │   └── handler.ts
│   │   └── index.ts
│   ├── services/
│   │   ├── session-management.service.ts
│   │   └── index.ts
│   ├── dto/
│   │   ├── user-profile.dto.ts
│   │   └── index.ts
│   └── event-handlers/
│       ├── __tests__/
│       ├── user-registered.handler.ts
│       └── index.ts
├── infrastructure/
│   ├── repositories/
│   │   ├── __tests__/
│   │   ├── user-identity-kysely.repository.ts
│   │   ├── mappers/
│   │   │   └── user-identity-aggregate.mapper.ts
│   │   └── index.ts
│   ├── api/
│   │   ├── controllers/
│   │   │   ├── __tests__/
│   │   │   └── authentication.controller.ts
│   │   ├── schemas/
│   │   │   ├── __tests__/
│   │   │   └── register-user.schema.ts
│   │   └── index.ts
│   └── services/
│       └── external-api.service.ts
├── {context-name}.module.ts
└── index.ts
```

---

## Naming Patterns

### Classes

```typescript
// Aggregates: PascalCase + "Aggregate" suffix
export class UserIdentityAggregate extends AggregateRoot<string> { }

// Entities: PascalCase + "Entity" suffix (optional if clear from context)
export class InstitutionalAnnouncement extends BaseEntity<Props, EntityId> { }

// Value Objects: PascalCase (NO suffix)
export class Email extends ValueObject<string> { }
export class PolishAddress extends ValueObject<AddressProps> { }

// Events: PascalCase + "Event" suffix
export class UserRegisteredEvent extends DomainEvent { }

// Commands: PascalCase + "Command" suffix
export class RegisterUserCommand implements ICommand { }

// Queries: PascalCase + "Query" suffix
export class GetUserByIdQuery implements IQuery { }

// Handlers: PascalCase + "Handler" suffix
export class RegisterUserHandler implements ICommandHandler { }

// Specifications: PascalCase + "Specification" suffix
export class EmailUniqueSpecification extends CompositeSpecification { }

// Domain Services: PascalCase + "DomainService" suffix
export class AddressChangeDomainService { }

// Application Services: PascalCase + "ApplicationService" suffix
export class SessionManagementApplicationService { }
```

### Variables

```typescript
// Private fields: underscore prefix
private _email: Email;
private _password: Password;
private _lastLoginAt: Date | null;

// Public getters: NO underscore
public getEmail(): Email {
  return this._email;
}

// Method parameters: camelCase
public changeEmail(newEmail: Email): Result<void> { }

// Local variables: camelCase
const userId = UserId.create(uuid());
const validationResult = this.validate();
```

### Constants

```typescript
// Domain constants: SCREAMING_SNAKE_CASE
export const MAX_LOGIN_ATTEMPTS = 5;
export const SESSION_EXPIRY_HOURS = 24;
export const COOLDOWN_DAYS = 30;

// Enums: PascalCase for enum, SCREAMING_SNAKE_CASE for values
export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED',
}
```

---

## Import Organization

```typescript
// 1. External dependencies (Node.js, npm packages)
import { Injectable } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result } from '@vytches/ddd';

// 2. Shared domain (cross-context)
import { UserId } from '@/shared/domain/value-objects';
import { BaseError } from '@/shared/domain/errors';

// 3. Current context - domain layer
import { UserIdentityAggregate } from '../../domain/aggregates';
import { Email, Password } from '../../domain/value-objects';
import { UserAlreadyExistsError } from '../../domain/errors';

// 4. Current context - application layer
import { RegisterUserCommand } from './command';

// 5. Current context - infrastructure layer
import { IUserIdentityRepository } from '../../domain/repositories';
```

---

## Index Barrel Exports

**Rule**: If file imports from `./index`, it CANNOT be exported from that `./index` (ADR-0032)

```typescript
// ✅ CORRECT: domain/aggregates/index.ts
export { UserIdentityAggregate } from './user-identity.aggregate';
// UserIdentityAggregate does NOT import from './index'

// ❌ WRONG: domain/aggregates/index.ts
export { UserIdentityAggregate } from './user-identity.aggregate';
// If UserIdentityAggregate contains: import { SomeVO } from '../value-objects'
// And value-objects/index re-exports from aggregates/index → CIRCULAR DEPENDENCY
```

---

## Test File Organization

```typescript
// Test files: same name + .spec.ts or .test.ts
src/contexts/auth/domain/aggregates/user-identity.aggregate.ts
src/contexts/auth/domain/aggregates/__tests__/user-identity.aggregate.spec.ts

// E2E tests: feature + .e2e.spec.ts
test/e2e/auth/registration.e2e.spec.ts

// Rate limit tests: SEPARATE file
test/e2e/auth/registration-rate-limits.e2e.spec.ts
```

---

## Code Style

### Method Ordering (Aggregate/Entity)

```typescript
export class UserIdentityAggregate extends AggregateRoot<string> {
  // 1. Static factory methods
  public static create(...): Result<UserIdentityAggregate> { }
  public static reconstruct(...): UserIdentityAggregate { }

  // 2. Constructor (private)
  private constructor(...) { }

  // 3. Public getters
  public getId(): UserId { }
  public getEmail(): Email { }

  // 4. Public business methods
  public changePassword(newPassword: Password): Result<void> { }
  public suspend(reason: string): Result<void> { }

  // 5. Private validation/helper methods
  private validate(): boolean { }
  private apply(event: DomainEvent): void { }

  // 6. Specification context (if needed)
  public getSpecificationContext(): UserContext { }
}
```

### Handler Pattern

```typescript
@Injectable()
@CommandHandler(RegisterUserCommand)
export class RegisterUserHandler implements ICommandHandler<RegisterUserCommand> {
  constructor(
    private readonly userRepository: IUserIdentityRepository,
    private readonly domainService: RegistrationDomainService,
  ) {}

  @Transactional()
  async execute(command: RegisterUserCommand): Promise<Result<UserId>> {
    try {
      // 1. Load dependencies
      // 2. Domain service validation (if needed)
      // 3. Aggregate method
      // 4. Save
      // 5. Return Result
    } catch (error) {
      return Result.fail(new InfrastructureError(error.message));
    }
  }
}
```

---

## Documentation Standards

### Aggregate/Entity Comments

```typescript
/**
 * User Identity Aggregate
 *
 * Root entity for authentication and user management.
 * Enforces invariants: unique email, password strength, account status.
 *
 * @aggregate
 * @bounded-context auth
 */
export class UserIdentityAggregate extends AggregateRoot<string> {
  /**
   * Register new user
   *
   * @throws UserAlreadyExistsError if email is taken
   * @throws WeakPasswordError if password doesn't meet requirements
   */
  public static create(
    email: Email,
    password: Password
  ): Result<UserIdentityAggregate> { }
}
```

### Method Comments (When Needed)

```typescript
// ✅ Use comments for complex business logic
/**
 * Validate address change cooldown
 *
 * Users can change address max once per 30 days to prevent abuse.
 * Admins can override this restriction.
 */
private canChangeAddress(userId: UserId): boolean { }

// ❌ DON'T comment obvious code
// Get user email
public getEmail(): Email {  // ❌ Unnecessary
  return this._email;
}
```

---

## Checklist

- [ ] File names follow conventions (e.g., `user-identity.aggregate.ts`)
- [ ] Folder structure matches DDD layers (domain/application/infrastructure)
- [ ] Class names use correct suffixes (Aggregate, Event, Command, etc.)
- [ ] Private fields use underscore prefix (`_email`)
- [ ] Constants use SCREAMING_SNAKE_CASE
- [ ] Imports organized by category (external → shared → context)
- [ ] NO circular dependencies (ADR-0032)
- [ ] Test files in `__tests__/` folders
- [ ] Rate limit tests in SEPARATE files
- [ ] Method ordering follows standard pattern
- [ ] Comments ONLY for complex business logic

**References**:
- ADR-0032 (Module Organization)
- `.claude/memory/agent-knowledge/testing-patterns.md`
- `project-orchestration/ddd/patterns/AGENT-IMPLEMENTATION-GUIDE.md`
