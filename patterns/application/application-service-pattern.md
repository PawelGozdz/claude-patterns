# DDD Application Services Reference

**Purpose**: Orchestration layer between API and domain
**Audience**: domain-application-implementer
**Philosophy**: Code + concise rules, NO verbose explanations

---

## Core Rules

1. **@Injectable()**: NestJS services in application layer
2. **Orchestration ONLY**: Coordinates domain + infrastructure, ZERO business logic
3. **Uses CommandBus/QueryBus**: Delegates to handlers
4. **Transaction boundary**: Manages @Transactional scope
5. **Infrastructure aware**: Can inject repos, APIs, message queues

---

## When to Use Application Service

| Scenario | Use Application Service? |
|----------|-------------------------|
| Simple CRUD (single command/query) | NO - use handler directly |
| Complex workflow (multiple commands) | YES |
| Saga pattern (multi-step transaction) | YES |
| Integration events (cross-context) | YES |
| Multiple infrastructure operations | YES |

---

## Simple Application Service (Wraps Handler)

```typescript
import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Result } from '@vytches/ddd';

@Injectable()
export class UserManagementApplicationService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /**
   * Register new user
   *
   * Wraps RegisterUserCommand for API layer convenience
   */
  async registerUser(
    email: string,
    password: string
  ): Promise<Result<UserId>> {
    const command = new RegisterUserCommand(email, password);
    return this.commandBus.execute<RegisterUserCommand, Result<UserId>>(command);
  }

  /**
   * Get user preferences
   *
   * Wraps GetUserPreferencesQuery for API layer
   */
  async getUserPreferences(userId: string): Promise<Result<UserPreferencesDTO>> {
    const query = new GetUserPreferencesQuery(userId);
    return this.queryBus.execute<GetUserPreferencesQuery, Result<UserPreferencesDTO>>(query);
  }
}
```

---

## Complex Application Service (Multi-Step Workflow)

```typescript
@Injectable()
export class SessionManagementApplicationService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly eventBus: EventBus,
    private readonly tokenService: ITokenService,
    private readonly deviceService: IDeviceService,
  ) {}

  /**
   * Complete authentication workflow
   *
   * Multi-step: validate credentials → create session → generate tokens → publish event
   */
  @Transactional()
  async authenticateUser(
    email: string,
    password: string,
    deviceInfo: DeviceInfo
  ): Promise<Result<AuthenticationResult>> {
    try {
      // 1. Validate credentials (command)
      const validateCommand = new ValidateCredentialsCommand(email, password);
      const validationResult = await this.commandBus.execute(validateCommand);
      if (validationResult.isFailure) {
        return Result.fail(validationResult.error);
      }

      const userId = validationResult.value;

      // 2. Create session (command)
      const createSessionCommand = new CreateSessionCommand(userId, deviceInfo);
      const sessionResult = await this.commandBus.execute(createSessionCommand);
      if (sessionResult.isFailure) {
        return Result.fail(sessionResult.error);
      }

      const sessionId = sessionResult.value;

      // 3. Generate tokens (infrastructure)
      const tokens = await this.tokenService.generateTokenPair(userId, sessionId);

      // 4. Publish integration event (cross-context)
      await this.eventBus.publish(
        new UserAuthenticatedIntegrationEvent(userId, sessionId, deviceInfo)
      );

      // 5. Return combined result
      const result: AuthenticationResult = {
        userId,
        sessionId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      };

      return Result.ok(result);

    } catch (error) {
      return Result.fail(new InfrastructureError(error.message));
    }
  }
}
```

---

## Saga Pattern Example

```typescript
@Injectable()
export class UserOnboardingApplicationService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly emailService: IEmailService,
    private readonly analyticsService: IAnalyticsService,
    private readonly logger: ILogger,
  ) {}

  /**
   * Complete user onboarding saga
   *
   * Compensating transactions if any step fails
   */
  @Transactional()
  async onboardUser(
    registrationData: RegistrationData
  ): Promise<Result<OnboardingResult>> {
    const compensations: (() => Promise<void>)[] = [];

    try {
      // Step 1: Create user account
      const createUserCommand = new RegisterUserCommand(
        registrationData.email,
        registrationData.password
      );
      const userResult = await this.commandBus.execute(createUserCommand);
      if (userResult.isFailure) {
        return Result.fail(userResult.error);
      }

      const userId = userResult.value;
      compensations.push(() => this.deleteUser(userId));

      // Step 2: Create user residence
      const createResidenceCommand = new CreateUserResidenceCommand(
        userId,
        registrationData.address
      );
      const residenceResult = await this.commandBus.execute(createResidenceCommand);
      if (residenceResult.isFailure) {
        await this.compensate(compensations);
        return Result.fail(residenceResult.error);
      }

      const residenceId = residenceResult.value;
      compensations.push(() => this.deleteResidence(residenceId));

      // Step 3: Send welcome email (infrastructure)
      await this.emailService.sendWelcome(registrationData.email);

      // Step 4: Track analytics (infrastructure)
      await this.analyticsService.track('user_onboarded', {
        userId,
        registrationMethod: registrationData.method,
      });

      return Result.ok({ userId, residenceId });

    } catch (error) {
      // Compensate on failure
      await this.compensate(compensations);
      this.logger.error('Onboarding failed', error);
      return Result.fail(new OnboardingError(error.message));
    }
  }

  private async compensate(compensations: (() => Promise<void>)[]): Promise<void> {
    // Execute compensations in reverse order
    for (const compensation of compensations.reverse()) {
      try {
        await compensation();
      } catch (error) {
        this.logger.error('Compensation failed', error);
      }
    }
  }

  private async deleteUser(userId: UserId): Promise<void> {
    await this.commandBus.execute(new DeleteUserCommand(userId));
  }

  private async deleteResidence(residenceId: ResidenceId): Promise<void> {
    await this.commandBus.execute(new DeleteResidenceCommand(residenceId));
  }
}
```

---

## Integration Events (Cross-Context)

```typescript
@Injectable()
export class CommunityEventApplicationService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly integrationEventBus: IIntegrationEventBus,
  ) {}

  /**
   * Create community event + notify other contexts
   *
   * Publishes integration event for cross-context communication
   */
  @Transactional()
  async createCommunityEvent(
    createEventData: CreateEventData
  ): Promise<Result<EventId>> {
    try {
      // 1. Create event (domain command)
      const command = new CreateCommunityEventCommand(createEventData);
      const result = await this.commandBus.execute(command);
      if (result.isFailure) {
        return result;
      }

      const eventId = result.value;

      // 2. Publish integration event (cross-context)
      // → Notification context listens for this
      // → Engagement context listens for this
      await this.integrationEventBus.publish(
        new CommunityEventCreatedIntegrationEvent({
          eventId,
          organizerId: createEventData.organizerId,
          districtCode: createEventData.districtCode,
          title: createEventData.title,
          scheduledAt: createEventData.scheduledAt,
        })
      );

      return Result.ok(eventId);

    } catch (error) {
      return Result.fail(new InfrastructureError(error.message));
    }
  }
}
```

---

## Application Service vs Domain Service

| Concern | Application Service | Domain Service |
|---------|---------------------|----------------|
| **Layer** | Application layer | Domain layer |
| **Dependencies** | Infrastructure (repos, APIs) | Only domain objects |
| **Purpose** | Orchestration | Business rules |
| **Testability** | Integration tests | Unit tests (pure) |
| **Transaction** | Manages @Transactional | Called within transaction |
| **Example** | Register + send email + track | Validate address change |

---

## Anti-Patterns

### Business Logic in Application Service
```typescript
// ❌ WRONG: business rule in application service
@Injectable()
export class UserManagementApplicationService {
  async registerUser(email: string, password: string) {
    // ❌ Business rule: password strength
    if (password.length < 8) {
      return Result.fail(new WeakPasswordError());
    }

    // ❌ Business rule: email domain validation
    if (!['gmail.com', 'outlook.com'].includes(email.split('@')[1])) {
      return Result.fail(new InvalidEmailDomainError());
    }

    // ...
  }
}

// ✅ CORRECT: delegate to domain
@Injectable()
export class UserManagementApplicationService {
  async registerUser(email: string, password: string) {
    // Domain handles business rules via specifications/policies
    const command = new RegisterUserCommand(email, password);
    return this.commandBus.execute(command);
  }
}
```

### Direct Repository Usage in Application Service
```typescript
// ❌ WRONG: repository in application service (bypasses handler)
@Injectable()
export class UserManagementApplicationService {
  constructor(private readonly userRepository: IUserRepository) {}

  async registerUser(email: string, password: string) {
    const user = UserIdentityAggregate.create(email, password);
    await this.userRepository.save(user);  // ❌ Bypasses command handler
  }
}

// ✅ CORRECT: use CommandBus (goes through handler)
@Injectable()
export class UserManagementApplicationService {
  constructor(private readonly commandBus: CommandBus) {}

  async registerUser(email: string, password: string) {
    const command = new RegisterUserCommand(email, password);
    return this.commandBus.execute(command);  // ✅ Uses handler
  }
}
```

---

## Checklist

- [ ] `@Injectable()` decorator
- [ ] Uses CommandBus/QueryBus for domain operations
- [ ] ZERO business logic (delegates to domain)
- [ ] Manages infrastructure (email, analytics, etc.)
- [ ] `@Transactional()` for multi-step workflows
- [ ] Publishes integration events if cross-context
- [ ] Returns `Result<T, E>`
- [ ] Integration tests (with infrastructure)

**References**:
- `src/contexts/auth/application/services/session-management.service.ts`
- `.claude/knowledge/reference/ddd/handlers.md`
- `.claude/knowledge/learned/application-layer-patterns.md`
