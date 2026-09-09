# Command Handler Pattern

**Tags**: "api:app"
**Level**: exhaustive

**Layer**: Application
**Status**: production
**Assumes**: ddd/core   <!-- wzorzec operuje pojęciami modelu domenowego -->

## 🎯 Problem

**Challenges with command handler implementation**:
- Direct repository access in aggregates → async domain methods
- userId from request body → security vulnerability (ADR-0021)
- Missing @Transactional → manual transaction management errors
- Business logic in handlers → should be in aggregates/policies
- Missing error handling → unhandled exceptions crash application
- No logging/correlation → debugging impossible

**Real-world pain points**:
- **Production security bug**: userId accepted from request body → user impersonation attack
- **Transaction leak**: Forgot to commit transaction → database connection pool exhaustion
- **Missing correlation ID**: Cannot trace request across contexts → 2-hour debugging session
- **Business logic in handler**: Age validation in handler instead of specification → impossible to unit test

---

## ✅ Solution

**Command Handler pattern with**:
- `BaseCommandHandler<Command, Result<DTO, Error>>` extension
- `@CommandHandler(CommandClass)` decorator
- `@Injectable()` NestJS decorator
- `executeBusinessLogic()` implementation - ONLY orchestration
- Dual Identity Pattern: Extract userId from `RequestContextService`, NEVER from command
- `@Transactional()` on execute() method (inherited from BaseCommandHandler)
- Optional `prepare(command): Promise<TPrepared>` hook — runs BEFORE `@Transactional()` opens, for I/O that must complete outside the transaction boundary (ADR-0117)
- Result pattern: ALL methods return `Result<T, Error>`
- ACL Registry for cross-context calls
- LOGGER_SERVICE injection for structured logging
- `getOperationName()` and `getBoundedContext()` for telemetry

---

## 🔧 Implementation

### Example 1: PostCommentHandler (Standard CQRS Pattern)

**File**: `src/contexts/engagement/application/commands/post-comment/handler.ts` (~250 lines)

**Key characteristics**:
- Dual Identity: userId from RequestContext, NOT command
- ACL Registry: Cross-context call to geographic-auth
- Local trust replica: engagement_user_trust for BR-COMMENT-003
- Visitor comment limit: Non-resident restrictions (BR-RES-005)
- Transaction support: @Transactional inherited from BaseCommandHandler

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, Result } from '@vytches/ddd';
import { BaseCommandHandler } from '@shared/application/base/base-command-handler';
import { UserId } from '@shared/domain';
import { ACL_REGISTRY_SERVICE, type ACLRegistryService } from '@shared/infrastructure/acl';
import { ILoggerService, LOGGER_SERVICE } from '@shared/infrastructure/logging';
import { RequestContextService } from '@shared/infrastructure/request-context';
import { CommentAggregate } from '../../../domain/aggregates/comment.aggregate';
import { EngagementValidationError } from '../../../domain/errors/engagement-validation.error';
import type { ICommentCommandRepository } from '../../../domain/repositories/comment-command.repository';
import { CommentContent, TargetReference } from '../../../domain/value-objects';
import type { CommentDto } from '../../dto/comment.dto';
import { PostCommentCommand } from './command';

// ✅ ACL interface (defined locally per ACL pattern)
interface IGeographicAuthAPI {
  getAddressComponents(userId: string): Promise<{
    city: string;
    street: string;
    gmina: string;
    voivodeship: string;
    tercCode: string;
  }>;
}

@Injectable()
@CommandHandler(PostCommentCommand)
export class PostCommentHandler extends BaseCommandHandler<
  PostCommentCommand,
  Result<CommentDto, EngagementValidationError>
> {
  constructor(
    // 1. ✅ Required base dependencies
    @Inject(LOGGER_SERVICE) logger: ILoggerService,
    @Inject(RequestContextService) requestContext: RequestContextService,
    @Inject(REDACTION_SERVICE) redactionService: RedactionService,

    // 2. ✅ Handler-specific dependencies
    @Inject(COMMENT_COMMAND_REPOSITORY)
    private readonly commentRepository: ICommentCommandRepository,
    @Inject(ENGAGEMENT_USER_TRUST_REPOSITORY)
    private readonly trustRepository: IEngagementUserTrustRepository,
    @Inject(VISITOR_COMMENT_LIMIT_REPOSITORY)
    private readonly visitorLimitRepository: IVisitorCommentLimitRepository,
    @Inject(ACL_REGISTRY_SERVICE)
    private readonly aclRegistry: ACLRegistryService
  ) {
    super(logger, requestContext, redactionService);
  }

  // 3. ✅ Telemetry methods
  protected getOperationName(): string {
    return 'PostComment';
  }

  protected getBoundedContext(): string {
    return 'Engagement';
  }

  // 4. ✅ Business logic orchestration (NO business rules!)
  public async executeBusinessLogic(
    command: PostCommentCommand
  ): Promise<Result<CommentDto, EngagementValidationError>> {
    // ============================================
    // Step 1: Extract userId from RequestContext (Dual Identity Pattern)
    // ============================================
    const userId = this.requestContext.getUserId();
    if (!userId) {
      return Result.fail(EngagementValidationError.authenticationRequired());
    }

    // ============================================
    // Step 2: Load user data from local replica
    // ============================================
    const verificationLevel = await this.trustRepository.getVerificationLevel(userId);
    const isBanned = await this.trustRepository.isCommentBanned(userId);

    if (isBanned) {
      return Result.fail(EngagementValidationError.userBannedFromCommenting());
    }

    // ============================================
    // Step 3: Cross-context validation via ACL (if needed)
    // ============================================
    let isVisitor = false;
    if (command.targetCity) {
      try {
        // ✅ ACL Registry for cross-context call
        const geoAuthACL = this.aclRegistry.getGlobalRequired<IGeographicAuthAPI>('geographic-auth');
        const addressComponents = await geoAuthACL.getAddressComponents(userId);
        const homeCity = addressComponents.city;

        // Check if user is non-resident
        if (isNonResident(homeCity, command.targetCity)) {
          isVisitor = true;

          // Check visitor comment limit (BR-RES-005)
          const countResult = await this.visitorLimitRepository.getCommentCount(
            userId,
            command.targetId
          );

          if (countResult.isSuccess && countResult.value.isLimitExceeded) {
            return Result.fail(
              EngagementValidationError.visitorCommentLimitExceeded(50, command.targetId)
            );
          }
        }
      } catch (error) {
        // Fail open: if residence unknown, treat as resident (no limits)
        this.logger.warn('Could not determine user residence for visitor limit check', {
          userId,
          targetCity: command.targetCity,
          error: error.message,
        });
      }
    }

    // ============================================
    // Step 4: Create value objects (format validation)
    // ============================================
    const contentResult = CommentContent.create(command.content);
    if (contentResult.isFailure) {
      return Result.fail(contentResult.error as EngagementValidationError);
    }

    const targetResult = TargetReference.create(command.targetType, command.targetId);
    if (targetResult.isFailure) {
      return Result.fail(targetResult.error as EngagementValidationError);
    }

    // ============================================
    // Step 5: Call aggregate factory (business rules)
    // ============================================
    const commentResult = CommentAggregate.create(
      UserId.create(userId),
      contentResult.value,
      targetResult.value,
      command.targetOwnerId,
      verificationLevel
    );

    if (commentResult.isFailure) {
      return Result.fail(commentResult.error);
    }

    // ============================================
    // Step 6: Persist aggregate (transaction auto-handled)
    // ============================================
    await this.commentRepository.save(commentResult.value);

    // ============================================
    // Step 7: Update visitor counter if applicable
    // ============================================
    if (isVisitor) {
      await this.visitorLimitRepository.incrementCommentCount(userId, command.targetId);
    }

    // ============================================
    // Step 8: Map to DTO and return
    // ============================================
    const dto: CommentDto = {
      id: commentResult.value.id.value,
      userId: commentResult.value.userId.value,
      content: commentResult.value.content.getContent(),
      targetType: commentResult.value.target.type,
      targetId: commentResult.value.target.id,
      nestingLevel: commentResult.value.nestingLevel.getLevel(),
      moderationStatus: commentResult.value.moderationStatus.status,
      verificationLevel: commentResult.value.verificationLevel,
      editCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return Result.ok(dto);
  }
}
```

---

### Pre-Transaction Hook: `prepare()` (ADR-0117)

**Problem**: some I/O must complete BEFORE the transaction opens — e.g. a cross-context ACL call resolving geo/reach data, where a timeout / `Promise.race()` cannot actually cancel a hung request. Calling that I/O from inside `executeBusinessLogic()` runs it *inside* the open `@Transactional()` block, holding a DB connection for the duration of an external call. An earlier ad-hoc fix (override `execute()` + cache the ACL result in a `WeakMap`/CLS key) shipped two incompatible caching mechanisms across contexts and a silent fallback that let the ACL re-enter mid-transaction — it produced a real bug in `create-event` and was rejected in review.

**Solution**: `BaseCommandHandler<TCommand, TResult, TPrepared = void>` exposes an optional `prepare(command): Promise<TPrepared>` hook. It runs inside `runWithContext()` (so `RequestContextService` is available) but BEFORE `executeTransactional()` — the only method carrying `@Transactional()`. Its return value is passed as the second argument to `executeBusinessLogic(command, prepared)`. Default implementation is a no-op returning `undefined`, so the ~40 existing handlers with single-argument `executeBusinessLogic(command)` are unaffected (`TPrepared` defaults to `void`).

```typescript
// TPrepared shape (abridged — see create-local-share/handler.ts for the full type)
type PreparedGeography = Result<
  {
    // ...pola geo... (category, shareLatitude, shareLongitude, city,
    // isNonResidentPosting, nonResidentFee, resolvedLocation)
    tokenReservationId: string | null; // ✅ seeded null by prepare() — see compensate() below
    compensationReason: string | null; // ✅ seeded null by prepare() — see compensate() below
  },
  LocalSharesDomainError
>;

export class CreateLocalShareHandler extends BaseCommandHandler<
  CreateLocalShareCommand,
  Result<LocalShareDto, LocalSharesDomainError>,
  PreparedGeography // ✅ TPrepared
> {
  // ✅ Runs BEFORE the transaction opens
  protected async prepare(command: CreateLocalShareCommand): Promise<PreparedGeography> {
    // ACL call to geographic-auth / pricing — outside the tx boundary
    const geoResult = await this.resolveGeography(command);
    if (geoResult.isFailure) return geoResult;
    // tokenReservationId/compensationReason start null — nothing reserved yet
    return Result.ok({ ...geoResult.value, tokenReservationId: null, compensationReason: null });
  }

  // ✅ Receives the already-resolved value, never re-calls the ACL itself
  public async executeBusinessLogic(
    command: CreateLocalShareCommand,
    prepared: PreparedGeography
  ): Promise<Result<LocalShareDto, LocalSharesDomainError>> {
    if (prepared.isFailure) {
      return Result.fail(prepared.error); // ✅ propagate, do NOT retry the ACL here
    }
    // ... aggregate creation using prepared.value
  }
}
```

**MUST**:
- Use `prepare()` for I/O that has to finish before the transaction opens (typically an ACL Registry call whose failure mode can't be safely retried mid-transaction)
- `executeBusinessLogic()` MUST consume the value `prepare()` already resolved — NEVER call the same ACL again inside the transaction "just in case"

**MUST NOT**:
- NEVER put transactional persistence logic in `prepare()` — it runs outside `@Transactional()`, so writes there are NOT rolled back on failure
- NEVER silently swallow a `prepare()` failure — propagate it as `Result.fail()` from `executeBusinessLogic()`

**Reference implementations**: `create-local-share/handler.ts`, `create-job-request/handler.ts` (neighborhood-economy); `create-group/handler.ts`, `update-group/handler.ts`, `set-group-reach/handler.ts`, `create-event/handler.ts`, `create-group-event/handler.ts`, `publish-event/handler.ts` (community-communication). **Known exception**: `publish-event/handler.ts` documents a fallback for a `prepare()`/`executeBusinessLogic()` race window — read ADR-0117's "Watch" section before copying that shape elsewhere. **UPDATE-shape reference**: `boost-local-share/handler.ts` (neighborhood-economy) — a deliberately NARROW `prepare()` (zero I/O) that only initializes the compensation carrier; see "Post-Rollback Compensation Hook" and "UPDATE-shape" below.

**Full rationale + rejected alternatives**: ADR-0117.

---

### Post-Rollback Compensation Hook: `compensate()` (ADR-0118, B4)

**Problem**: side effects that live OUTSIDE the `@Transactional()` boundary — most commonly a token-economy reservation made via a synchronous ACL call — do NOT roll back automatically when the transaction does. `@Transactional()` only undoes the DB writes inside `executeBusinessLogic()`; a token reservation confirmed/left dangling by an external service needs its own, explicit release.

**Mechanism**: `BaseCommandHandler.compensate(command, prepared, error)` is called from `executeWithContext()`'s catch block, AFTER the transaction has already rolled back — and ONLY when `prepare()` itself ran to completion (tracked internally via a `prepareCompleted` flag, not "prepared is truthy", since `TPrepared` may legitimately be `void`). A failure INSIDE `prepare()` has nothing to compensate — nothing was reserved yet — so `compensate()` is skipped in that case. The only channel `compensate()` has to learn what happened during the transaction is the SAME `prepared` object `prepare()` returned and `executeBusinessLogic()` mutated — there is no other parameter carrying state forward.

**Key consequence (falsified during Faza 2/3, drives a new rule)**: because `compensate()` is never invoked when `prepare()` itself fails, any operation that would need compensation on ITS OWN failure (e.g. reserving tokens) MUST run inside `executeBusinessLogic()` (the transactional core), never in `prepare()` — even when it's a pure ACL call with no DB access of its own. Putting it in `prepare()` would create a reservation with no way to release it if that very call is what fails. This is the new rule **CH12/N9** below.

**Reference implementation** (`boost-local-share/handler.ts` — simpler than `create-local-share/handler.ts`, which additionally has a `CONFIRM_FAILED` exception path, see below):

```typescript
interface PreparedBoost {
  tokenReservationId: string | null;
  compensationReason: string | null;
}

protected override async prepare(_command: BoostLocalShareCommand): Promise<PreparedBoost> {
  return { tokenReservationId: null, compensationReason: null };
}

// ...in executeBusinessLogic(), after each failure that follows a successful reservation:
//   prepared.compensationReason = 'DOMAIN_VALIDATION_FAILED'; // (or another specific reason)
//   return Result.fail(...);

protected override async compensate(
  _command: BoostLocalShareCommand,
  prepared: PreparedBoost,
  _error: Error
): Promise<void> {
  const { tokenReservationId: reservationId, compensationReason: reason } = prepared;
  if (!reservationId || !reason) return;
  await this.tokenReservationService.releaseReservation({
    reservationId,
    actionType: TOKEN_ACTION_TYPE,
    radiusBucket: TOKEN_RESERVATION_BUCKET_SENTINEL,
    reason,
  });
}
```

**Known exception**: `create-local-share/handler.ts` has one path (`CONFIRM_FAILED`) where compensation is done MANUALLY instead of going through this hook — it has a hard ordering requirement with a Tier-2 audit entry (the audit call must happen AFTER the reservation is released but BEFORE the rollback; `compensate()` by definition runs AFTER the rollback, which is too late for that ordering). Read that handler's `CONFIRM_FAILED` branch as the documented boundary of this pattern before assuming `compensate()` covers every release path.

**MUST**:
- Seed the mutable `prepared` carrier's compensation fields (e.g. `tokenReservationId`, `compensationReason`) to `null`/unset in `prepare()`
- Set `compensationReason` (or equivalent) in EVERY `executeBusinessLogic()` failure branch that follows a successful external reservation
- Keep `compensate()`'s scope to ONLY what this handler itself called directly — never a queue/fan-out/event publish (that consumer owns its own retry semantics)

**MUST NOT**:
- NEVER reserve an external resource that needs compensation-on-failure inside `prepare()` — see CH12/N9 below
- NEVER let a `compensate()` error shadow the original business failure already being returned — log and continue, as `BaseCommandHandler` does

---

### CREATE-shape vs. UPDATE-shape (ADR-0118 A2–A4)

The three-phase split (`prepare()` / `executeBusinessLogic()` / `compensate()`) looks different depending on whether the handler creates a NEW aggregate or mutates an EXISTING one. Deciding which phase an operation belongs to comes down to one question: **does it need an ID created inside this transaction, or does it have to roll back together with the save?** Yes → the transactional core. No → `prepare()`.

#### CREATE-shape

`prepare()` is typically NON-EMPTY: it resolves I/O that has to finish before the transaction opens — geo/pricing ACL calls, target-area geometry, non-resident eligibility — because none of that depends on an aggregate ID that doesn't exist yet. `executeBusinessLogic()` then builds a brand-new aggregate from the already-resolved bundle. **Reference**: `create-local-share/handler.ts`.

A CREATE-shape handler with more than one input path (e.g. explicit `command.location` vs. a server-synthesized default) is exactly where "Branch Side-Effect Parity" (below) applies — and where branching is legitimate vs. where it's a hidden duplication bug depends on WHY the branch exists. Four recurring classes, each with its own resolution:

| Class | Example | Resolution |
|---|---|---|
| 1. Optional input | `if (command.location)` | A resolver that returns the SAME type in both cases; assign the result to a variable, don't fork the flow |
| 2. Disjoint union | `actingAs.type === 'SP' \| 'ORGANIZATION'` | An exhaustive `switch` returning a shared shape + a `const x: never` default to catch an unhandled case at compile time |
| 3. Aggregate state | `if (event.isPublished)` | An aggregate method that itself rejects the disallowed transition — never an `if` in the handler |
| 4. Product policy | organization vs. individual actor | A NAMED policy with an explicit variant (`PolicyBuilder`/`.forActor(...)`), never an inline conditional scattered across the handler |

A conditional **value** (one decision, one variable, used identically afterward) is fine anywhere, including inside the transaction. A conditional **flow** (two branches each with their own `create`/`save`/side-effects/`return`) is what "Branch Side-Effect Parity" exists to catch.

#### UPDATE-shape

`prepare()` is typically EMPTY or NARROW — an empty `prepare()` is CORRECT here, not a gap to fill. Do NOT add a "preview" read just to satisfy the general "I/O before the transaction" instinct; there is nothing to resolve before the transaction when the operation's only job is to mutate an aggregate that already exists. The mutated aggregate is ALWAYS loaded WITH a lock (`findByIdWithLock()`) INSIDE the transactional core — NEVER in `prepare()`, which has no lock semantics and would let a concurrent write race the load. When the handler also needs a compensable side effect (e.g. a token reservation for a paid update), `prepare()` stays narrow: it seeds the mutable compensation carrier (`{ tokenReservationId: null, compensationReason: null }`) with zero I/O — see `compensate()` above for why the reservation call itself still has to happen inside `executeBusinessLogic()`. **Reference**: `boost-local-share/handler.ts` — the lock (`findByIdWithLock`) happens BEFORE the pricing quote/reservation, and both live inside the transactional core.

---

### Branch Side-Effect Parity

**Problem**: a handler with more than one code path that creates/finalizes the SAME aggregate (e.g. `if (command.location) { ... } else { ... }` for an explicit vs. a server-synthesized location) duplicates the entire creation flow across both branches instead of sharing one. When a mandatory side-effect is added later — a repository side-channel write (`setTag`, `setCategorySlug`), an audit call, an event emission, a token confirm/release — it is easy to add it to only the branch under active edit and forget the other. This is not hypothetical: `create-local-share/handler.ts`'s `setTag()` call (BR-LS-TAG-001 — "every local share carries EXACTLY ONE transaction-type tag") was added to the explicit-location branch only, and survived 39 subsequent commits — including one that later restructured the OTHER branch without noticing the gap — because nothing in the review chain (implementer scope, `code-quality-verifier`'s structural checklist, test coverage) ever compared the two branches' side-effects against each other. Neither branch had a test asserting `setTag` was called at all (found 2026-08-29, `juz-ide-api-3`).

**Solution**: when a handler has multiple branches that create/finalize the same aggregate, either (a) unify them into one shared finalization path so there is structurally only one place to add a side-effect, or — if the branches must stay separate for now — (b) enumerate every mandatory side-effect (repo side-channel writes, audit calls, event emissions, token confirm/release) and verify it is present, at the equivalent point in the lifecycle, in EVERY branch. Reading one branch at a time cannot catch this — it requires reading the branches side-by-side and diffing their side-effects, and a test per side-effect per branch (not just per branch's happy path).

**MUST**:
- When adding a mandatory side-effect (audit call, tag/side-channel repo write, event emission, token confirm/release) to one branch of a multi-branch aggregate-creation handler, add the SAME call to every other branch that creates/finalizes the same aggregate
- Prefer extracting a shared private/collaborator finalization method once ≥2 branches need to stay in sync, so there's structurally only one place left to edit

**MUST NOT**:
- NEVER treat "the branch I'm currently editing" as the full scope when the change enforces a mandatory business invariant (`BR-*`) rather than a branch-local detail
- NEVER consider a multi-branch handler's test coverage complete without at least one test per branch asserting each mandatory side-effect was called (not just that the branch returns success)

**Reference incident**: `create-local-share/handler.ts` (`juz-ide-api-3`), BR-LS-TAG-001 — residence-default branch never called `setTag()`; fixed as a `TS-SEC-MAP-PIN-001` follow-up, 2026-08-29.

---

## 📋 Rules

### MUST

1. **Extend `BaseCommandHandler<Command, Result<DTO, Error>>`**
2. **Decorators**: `@Injectable()` and `@CommandHandler(CommandClass)`
3. **Constructor injection**: logger, requestContext, redactionService, repositories, services
4. **Dual Identity**: Extract userId from `RequestContextService.getUserId()`, NEVER from command
5. **Implement telemetry**: `getOperationName()`, `getBoundedContext()`
6. **Result pattern**: `executeBusinessLogic()` returns `Result<DTO, Error>`
7. **Orchestration ONLY**: Load data, call aggregate methods, persist - NO business rules
8. **ACL Registry**: Cross-context calls via `aclRegistry.getGlobalRequired<T>()`
9. **@Transactional**: Inherited from BaseCommandHandler, auto-commit on success, auto-rollback on error. Pre-transaction I/O (e.g. ACL calls) belongs in `prepare()`, which runs before the transaction opens (ADR-0117) — NEVER inside `executeBusinessLogic()`
10. **Error handling**: Return `Result.fail(error)`, NEVER throw exceptions
11. **Branch side-effect parity**: if `executeBusinessLogic()`/`prepare()` has multiple branches that create/finalize the same aggregate, every mandatory side-effect (audit call, side-channel repo write, event emission, token confirm/release) MUST be present in EVERY branch, at the equivalent lifecycle point — see "Branch Side-Effect Parity" above
12. **External operation needing compensation-on-failure belongs in `executeBusinessLogic()`**: a reservation of an external resource (e.g. a token-economy reservation) that would need `compensate()` to release it on failure MUST be made inside `executeBusinessLogic()` (the transactional core), NEVER in `prepare()` — `compensate()` is never invoked when `prepare()` itself fails (ADR-0118 B4), so nothing reserved there has any way to be released if that same call is what fails — see "Post-Rollback Compensation Hook" above

### MUST NOT

1. **NEVER accept userId from command** - always from RequestContext (ADR-0021)
2. **NEVER business rules in handler** - delegate to aggregates/policies/specifications
3. **NEVER throw exceptions** - always return Result
4. **NEVER async domain methods** - keep aggregates synchronous
5. **NEVER direct context imports** - use ACL Registry for cross-context calls
6. **NEVER manual transaction management** - @Transactional handles it
7. **NEVER forget correlation ID** - auto-added by BaseCommandHandler
8. **NEVER re-run pre-transaction I/O inside `executeBusinessLogic()`** - if it must finish before the transaction opens, it belongs in `prepare()`, and its result is consumed, not re-fetched (ADR-0117)
9. **NEVER add a mandatory side-effect to only the branch you're editing** - a multi-branch aggregate-creation handler needs the same audit/tag/event/token call in every branch that creates the aggregate, not just the one under active change
10. **NEVER reserve an external resource that needs `compensate()` on failure inside `prepare()`** - there is no channel to release it if THAT reservation is what fails, since `compensate()` only runs when `prepare()` completed (ADR-0118 B4)

---

## ⚠️ Anti-Patterns

### 1. userId from Command (Security Vulnerability)

```typescript
// ❌ WRONG: userId from command (user can fake it!)
export class PostCommentCommand {
  constructor(
    public readonly userId: string, // ❌ CRITICAL SECURITY FLAW!
    public readonly content: string,
    public readonly targetId: string
  ) {}
}

// Handler accepts userId from request body
public async executeBusinessLogic(command: PostCommentCommand) {
  const userId = command.userId; // ❌ User can impersonate anyone!
  // ...
}

// ✅ CORRECT: userId from RequestContext (from JWT token)
export class PostCommentCommand {
  constructor(
    // ❌ NO userId field!
    public readonly content: string,
    public readonly targetId: string
  ) {}
}

// Handler extracts userId from JWT token
public async executeBusinessLogic(command: PostCommentCommand) {
  const userId = this.requestContext.getUserId(); // ✅ From JWT, cannot fake
  if (!userId) {
    return Result.fail(EngagementValidationError.authenticationRequired());
  }
  // ...
}
```

---

### 2. Business Rules in Handler (Should be in Aggregate)

```typescript
// ❌ WRONG: Age validation in handler
public async executeBusinessLogic(command: RegisterUserCommand) {
  const userId = this.requestContext.getUserId();

  // ❌ Business rule in handler!
  const age = this.calculateAge(command.dateOfBirth);
  if (age < 16) {
    return Result.fail(new MinimumAgeError());
  }

  // Create aggregate...
}

// ✅ CORRECT: Business rule in aggregate (via specification)
// In handler:
public async executeBusinessLogic(command: RegisterUserCommand) {
  const userId = this.requestContext.getUserId();

  // ✅ Aggregate handles business rules
  const userResult = UserIdentityAggregate.create(
    email,
    password,
    dateOfBirth // Aggregate validates via specification
  );

  if (userResult.isFailure) {
    return Result.fail(userResult.error);
  }

  await this.repository.save(userResult.value);
  return Result.ok(dto);
}

// In aggregate:
public static create(...): Result<UserIdentityAggregate, Error> {
  // ✅ Business rule validated by specification
  const ageSpec = new MeetsMinimumAgeSpecification(16);
  if (!ageSpec.isSatisfiedBy({ dateOfBirth })) {
    return Result.fail(new MinimumAgeError());
  }
  // ...
}
```

---

### 3. Throwing Exceptions (Should Return Result)

```typescript
// ❌ WRONG: Throwing exception
public async executeBusinessLogic(command: PostCommentCommand) {
  const userId = this.requestContext.getUserId();
  if (!userId) {
    throw new UnauthorizedException(); // ❌ Exception!
  }
  // ...
}

// ✅ CORRECT: Returning Result.fail
public async executeBusinessLogic(command: PostCommentCommand) {
  const userId = this.requestContext.getUserId();
  if (!userId) {
    return Result.fail(EngagementValidationError.authenticationRequired()); // ✅ Result pattern
  }
  // ...
}
```

---

### 4. Direct Cross-Context Imports (Should Use ACL)

```typescript
// ❌ WRONG: Direct import from another context
import { GeographicAuthService } from '@contexts/geographic-auth/application/services';

public async executeBusinessLogic(command: PostCommentCommand) {
  // ❌ Direct dependency on another context!
  const addressComponents = await this.geoAuthService.getAddressComponents(userId);
  // ...
}

// ✅ CORRECT: ACL Registry for cross-context calls
// Define interface locally (no imports from other contexts)
interface IGeographicAuthAPI {
  getAddressComponents(userId: string): Promise<AddressComponents>;
}

public async executeBusinessLogic(command: PostCommentCommand) {
  // ✅ ACL Registry retrieves cross-context service
  const geoAuthACL = this.aclRegistry.getGlobalRequired<IGeographicAuthAPI>('geographic-auth');
  const addressComponents = await geoAuthACL.getAddressComponents(userId);
  // ...
}
```

---

### 5. Manual Transaction Management (Use @Transactional)

```typescript
// ❌ WRONG: Manual transaction management
public async executeBusinessLogic(command: PostCommentCommand) {
  const transaction = await this.db.beginTransaction(); // ❌ Manual!

  try {
    const comment = CommentAggregate.create(...);
    await this.repository.save(comment, transaction);
    await transaction.commit(); // ❌ Manual commit
    return Result.ok(dto);
  } catch (error) {
    await transaction.rollback(); // ❌ Manual rollback
    return Result.fail(error);
  }
}

// ✅ CORRECT: @Transactional inherited from BaseCommandHandler
public async executeBusinessLogic(command: PostCommentCommand) {
  // ✅ Transaction automatically started by BaseCommandHandler
  const commentResult = CommentAggregate.create(...);

  if (commentResult.isFailure) {
    return Result.fail(commentResult.error); // ✅ Auto-rollback
  }

  await this.repository.save(commentResult.value); // ✅ Within transaction
  return Result.ok(dto); // ✅ Auto-commit on success
}
```

---

## 🔧 Module Registration (Auto-Discovery)

Command handlers use the `@CommandHandler(CommandClass)` decorator for **automatic registration**.
VytchesExplorerService discovers all decorated handler classes and registers them with the command bus.

### Registration Pattern

**File**: `src/contexts/neighborhood-economy/neighborhood-economy.module.ts`

```typescript
import { Module } from '@nestjs/common';

@Module({
  providers: [
    // ✅ Just add handlers to providers - auto-discovery handles the rest
    CreateJobRequestHandler,
    UpdateJobRequestHandler,
    CompleteJobRequestHandler,
    // ... all command handlers
  ],
})
export class NeighborhoodEconomyModule {
  // ✅ NO commandBus injection needed
  // ✅ NO manual commandBus.register() calls needed
  // ✅ NO registerCommandHandlers() method needed
  // @CommandHandler(CommandClass) decorator on handler class enables auto-discovery
}
```

### Registration Steps

**For EVERY new command handler**:

1. ✅ **Add `@CommandHandler(CommandClass)` decorator** on the handler class
2. ✅ **Add `@Injectable()` decorator** on the handler class
3. ✅ **Add to `providers`** array in `@Module()` decorator
4. ✅ That's it — VytchesExplorerService handles the rest

### Complete Module Structure

**Typical module with command handlers**:

```typescript
@Module({
  imports: [SharedModule, DatabaseModule],
  providers: [
    // COMMAND HANDLERS - alphabetical order
    ActivateAccountHandler,
    CreateAccountHandler,
    UpdateAccountHandler,
    // ... repositories, services, etc.
  ],
})
export class AccountModule implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    // Command handlers auto-registered via @CommandHandler decorator
    // Only error mappers and ACL adapters need manual registration here
    this.registerErrorMappers();
  }
}
```

### Registration Rules

**MUST**:
- ✅ Add `@CommandHandler(CommandClass)` decorator on handler class
- ✅ Add `@Injectable()` decorator on handler class
- ✅ Add handler to `providers` array
- ✅ Handler must extend `BaseCommandHandler<Command, Result<DTO, Error>>`

**MUST NOT**:
- ❌ Manually call `commandBus.register()` (auto-discovery handles it)
- ❌ Inject CommandBus in module constructor (not needed)
- ❌ Export handlers in `exports` array (not needed for auto-discovery)
- ❌ Inject handlers in module constructor (not needed)

### Anti-Pattern: Missing Decorator

```typescript
// ❌ WRONG: Handler in providers but NO @CommandHandler decorator
@Injectable()  // ✅ Has @Injectable
// ❌ MISSING @CommandHandler(CreateJobRequestCommand)
export class CreateJobRequestHandler extends BaseCommandHandler<...> {
  // ...
}

@Module({
  providers: [CreateJobRequestHandler], // ✅ In providers
})
export class NeighborhoodEconomyModule {}

// Result: Runtime error when executing command
await commandBus.execute(new CreateJobRequestCommand(...));
// Error: No handler found for command "CreateJobRequestCommand"
```

**Fix**: Add `@CommandHandler(CreateJobRequestCommand)` decorator to handler class.

### Testing Registration

**Test**: Verify all commands have registered handlers

```typescript
describe('NeighborhoodEconomyModule - Handler Registration', () => {
  it('should register all command handlers in CommandBus', async () => {
    const module = await Test.createTestingModule({
      imports: [NeighborhoodEconomyModule],
    }).compile();

    const commandBus = module.get<ICommandBus>(ICommandBus);

    // Verify each command has a handler
    const commands = [
      CreateJobRequestCommand,
      UpdateJobRequestCommand,
      CompleteJobRequestCommand,
    ];

    for (const commandClass of commands) {
      const command = new commandClass({ /* test data */ });

      // Should NOT throw "No handler found"
      await expect(commandBus.execute(command)).resolves.toBeDefined();
    }
  });
});
```

---

## ✅ L2 Integration Tests for Handlers (ADR-0035)

### CRITICAL: Handler tests = L2 Integration Tests with real DB

**Handler tests MUST use `createStandardTestSetup()` with a real NestJS app and real database.**
**DO NOT mock repositories with `vi.fn()` — that is a unit test, not L2.**

```typescript
/**
 * CreateUserProfileHandler Integration Tests (L2)
 *
 * @see ADR-0035 - L2 Integration Test (Handler)
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppUtils } from '@app/shared';
import { UserIdentityFixture } from '@test/shared/fixtures/auth/user-identity-fixture.class';
import {
  createStandardTestSetup,
  type ExtendedTestAppContext,
} from 'test/shared/nestjs-test-setup';
import { withUserContext } from 'test/shared/utils/test-context';
import { DatabaseService } from '@shared/database/database.service';
import { CreateUserProfileHandler } from '../create-user-profile.handler';
import { CreateUserProfileCommand } from '../create-user-profile.command';

describe('CreateUserProfileHandler (L2 Integration)', () => {
  let context: ExtendedTestAppContext;
  let handler: CreateUserProfileHandler;
  let dbService: DatabaseService;

  beforeAll(async () => {
    context = await createStandardTestSetup({
      enableMockedProviders: true,
      testing: {
        skipAuthRateLimiting: true,
        skipApiRateLimiting: true,
        skipGlobalRateLimiting: true,
        skipEndpointRateLimiting: true,
      },
    }).setup();

    handler = context.app.get(CreateUserProfileHandler);
    dbService = context.app.get(DatabaseService);
  });

  afterAll(async () => {
    if (context) await context.app.close();
  });

  beforeEach(async () => {
    await context.cleaner.cleanAll(context.app);
  });

  it('should create profile for new user (BR-UP-007)', async () => {
    // Given: User exists in auth context
    const db = dbService.getDatabase();
    const userId = await UserIdentityFixture.createAsync(db, { isEmailVerified: true });

    // When: Command executed
    const result = await withUserContext(context.app, userId, async () => {
      return handler.execute(new CreateUserProfileCommand(userId));
    });

    // Then: Result.ok(value) / Result.empty() (success)
    expect(result.isSuccess).toBe(true);

    // Then: Profile exists in DB
    const profile = await db
      .selectFrom('user_profiles')
      .select(['user_id', 'profile_status'])
      .where('user_id', '=', userId)
      .executeTakeFirst();

    expect(profile).toBeDefined();
    expect(profile!.profile_status).toBe('active');
  });

  it('should be idempotent (BR-UP-007)', async () => {
    // Given: Profile already exists
    const db = dbService.getDatabase();
    const userId = await UserIdentityFixture.createAsync(db, { isEmailVerified: true });
    await handler.execute(new CreateUserProfileCommand(userId));

    // When: Command executed again
    const result = await withUserContext(context.app, userId, async () => {
      return handler.execute(new CreateUserProfileCommand(userId));
    });

    // Then: Still ok, no duplicate
    expect(result.isSuccess).toBe(true);

    const count = await db
      .selectFrom('user_profiles')
      .select(db.fn.count('user_id').as('count'))
      .where('user_id', '=', userId)
      .executeTakeFirst();
    expect(Number(count!.count)).toBe(1);
  });
});
```

### Anti-Pattern: Mock-based "L2" handler tests

```typescript
// ❌ WRONG: Using vi.fn() in "L2" handler test — this is actually a L1 UNIT test
describe('CreateUserProfileHandler (L2)', () => {
  const mockRepo = { findByUserId: vi.fn(), save: vi.fn() }; // ← WRONG for L2
  const handler = new CreateUserProfileHandler(mockRepo, ...);

  it('should create profile', async () => {
    mockRepo.findByUserId.mockResolvedValue(null);
    mockRepo.save.mockResolvedValue(undefined);
    const result = await handler.execute(...);
    expect(result.isSuccess).toBe(true);
  });
});
```

**Why this is wrong**:
- Mock repos test handler orchestration logic in isolation (L1 unit test)
- L2 should test that the handler + DB works together correctly
- Mock tests miss: real SQL errors, constraint violations, migration issues

**What L2 handler tests verify**:
- Actual DB persistence (not mocked)
- Idempotency via real ON CONFLICT behavior
- Domain events emitted to `domain_events` table
- Integration with real transaction management

---

## 📚 References

### ADRs
- **ADR-0012**: CQRS Structure - Command/Query separation
- **ADR-0013**: Hybrid Error Handling - Result pattern in application layer
- **ADR-0021**: Validation Layer Separation - Format validation at API, business rules in domain
- **ADR-0117**: Pre-Transaction `prepare()` Hook - I/O that must complete before the transaction boundary opens
- **ADR-0118**: Command Handler Lifecycle Contract - `compensate()` post-rollback hook (B4), CREATE-shape/UPDATE-shape (A2-A4)

### Implementation Files
- `src/contexts/engagement/application/commands/post-comment/handler.ts` (~250L)
- `src/contexts/auth/application/commands/register-user/handler.ts`
- `src/shared/application/base/base-command-handler.ts` (base class)

### Related Patterns
- [aggregate-pattern.md](../domain/aggregate-pattern.md) - Aggregates handle business rules
- [dual-identity-pattern.md](../architecture/dual-identity-pattern.md) - userId from RequestContext, NEVER command
- [transactional-pattern.md](../architecture/transactional-pattern.md) - @Transactional for transaction management
- [acl-registry-pattern.md](../architecture/acl-registry-pattern.md) - Cross-context calls via ACL Registry
- [domain-errors-pattern.md](../cross-layer/domain-errors-pattern.md) - ProjectErrorCode for errors
- [query-handler-pattern.md](query-handler-pattern.md) - Read-side CQRS handlers

---

## When to Use

### Use Command Handlers When

✅ **Write operations**: Create, update, delete entities
✅ **State changes**: Status transitions, business process steps
✅ **Business workflows**: Multi-step processes requiring orchestration
✅ **Cross-aggregate coordination**: Multiple aggregates involved
✅ **Transaction required**: Multiple database operations must be atomic

### Use Query Handlers Instead When

❌ **Read operations**: Fetching data without state changes
❌ **Reporting**: Analytics, dashboards, metrics
❌ **Search**: Filtering, pagination, sorting

### Use Domain Services Instead When

❌ **Complex business rules**: Validation spanning multiple aggregates
❌ **Policy evaluation**: PolicyBuilder with multiple specifications
❌ **Cross-aggregate business logic**: Logic that doesn't belong to one aggregate

---

**Version**: 2.3
**Created**: 2026-01-04
**Last Updated**: 2026-08-31
**Maintained By**: @project-orchestrator
**Primary Users**: domain-application-implementer, code-quality-verifier

**v2.3 Changes** (2026-08-31):
- Added "CREATE-shape vs. UPDATE-shape" subsection (ADR-0118 A2–A4) — prepare()/executeBusinessLogic()/compensate() phase assignment criterion, plus the 4-class branch taxonomy table (optional input / disjoint union / aggregate state / product policy) for handlers with multiple aggregate-creation paths
- Added "Post-Rollback Compensation Hook: `compensate()`" subsection (ADR-0118 B4) — mechanism, `prepareCompleted` gating, and the reference `boost-local-share/handler.ts` implementation
  - New MUST rule 12 and MUST NOT rule 10: an external operation needing compensation-on-failure MUST live in `executeBusinessLogic()`, NEVER `prepare()` — `compensate()` is never invoked when `prepare()` itself fails
  - Corresponding Rule Card ID `CH12`/`N9` added to `command-handler-pattern_summary.md`
- Refreshed the `prepare()` code example to the current (post-Faza-2) `PreparedGeography` shape — `tokenReservationId`/`compensationReason` fields, abridged type
- Added `boost-local-share/handler.ts` (neighborhood-economy) to "Reference implementations" as the UPDATE-shape example — narrow `prepare()`, lock-before-quote/reserve inside the transactional core
- Added ADR-0118 to References

**v2.2 Changes** (2026-08-29):
- Added "Branch Side-Effect Parity" subsection — a multi-branch aggregate-creation handler must apply every mandatory side-effect (audit, side-channel repo write, event emission, token confirm/release) identically across ALL branches, not just the one being edited
  - New MUST rule 11 and MUST NOT rule 9
  - Root-caused from a real incident: `create-local-share/handler.ts` (`juz-ide-api-3`) never called `setTag()` on its residence-default branch, silently violating BR-LS-TAG-001 for every share created without an explicit location — survived 39 commits because no reviewer or test ever diffed the two branches' side-effects
  - Corresponding Rule Card ID `CH11` added to `command-handler-pattern_summary.md`

**v2.1 Changes** (2026-08-29):
- Documented the `prepare()` pre-transaction hook (`TPrepared` generic on `BaseCommandHandler`) — ADR-0117, introduced in `TS-REACH-GEOMETRY-002`
  - New "Pre-Transaction Hook: `prepare()`" subsection with MUST/MUST NOT and reference implementations
  - Added corresponding MUST/MUST NOT entries in Rules, referenced ADR-0117 in References
  - Fixed `transactional-pattern.md` reference to a real relative link (`../architecture/transactional-pattern.md`)

**v2.0 Changes** (2026-02-05):
- **MAJOR**: Module Registration section rewritten for `@CommandHandler` auto-discovery
  - Removed manual `commandBus.register()` pattern (kept as anti-pattern reference)
  - Simplified registration: just add `@CommandHandler` decorator + providers array
  - VytchesExplorerService handles automatic discovery and registration
  - No more `onModuleInit` boilerplate for handler registration
