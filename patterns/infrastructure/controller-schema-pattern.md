# Controller & Schema Pattern

## 🎯 Problem

**Challenges with API controller implementation**:
- userId in request body → user impersonation attacks (ADR-0021)
- Manual validation → inconsistent error messages
- No type safety → runtime errors from invalid inputs
- Duplicate validation logic → controllers and domain both validate
- Missing rate limiting → DoS attacks
- Inconsistent error responses → poor developer experience
- No OpenAPI documentation → manual API docs maintenance

**Real-world pain points**:
- **Production security bug**: userId from request body → user impersonated admin (gained full access)
- **Missing validation**: No UUID check for IDs → SQL injection attempts
- **Inconsistent errors**: Different endpoints return different error formats → broken client apps
- **Missing rate limiting**: Comment spam → 1000 comments/second → database overload

---

## ✅ Solution

**Controller & Schema pattern with**:
- **Zod schemas** at API boundary (ADR-0020) → format validation ONLY
- **@CurrentUser decorator** (TS-MULTI-ACTOR-001) → userId from JWT, NEVER request body
- **@AuthEndpointSchema decorator** → automatic OpenAPI docs, error handling
- **@RateLimit decorator** (ADR-0022) → DoS protection on all endpoints
- **Response type safety**: Controllers return `Result<z.infer<typeof schema>>`, NOT raw DTOs
- **Rate limit file separation**: `*.rate-limits.ts` files for endpoint limits
- **Business logic in domain**: Controllers ONLY orchestrate (call command/query bus)
- **Result pattern**: ALL operations return `Result<T, Error>`

---

## 🔧 Implementation

### Example 1: EngagementController (Complete CRUD Pattern)

**File**: `src/app/api/engagement/engagement.controller.ts` (~400 lines)

**Key characteristics**:
- @CurrentUser decorator extracts userId from JWT
- Zod schema validation at API boundary
- @AuthEndpointSchema for automatic OpenAPI docs
- @RateLimit on all operations
- Command/Query bus orchestration

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ICommandBus, IQueryBus, Result } from '@vytches/ddd';
import { z } from 'zod';

// Guards and authentication
import { RequirePermissions } from '@contexts/authorization/infrastructure/decorators/permissions.decorator';
import { PermissionGuard } from '@contexts/authorization/infrastructure/guards/permission.guard';
import type { ActionTypeEnum, DeletionType, TargetTypeEnum } from '@contexts/engagement/application';
import {
  DeleteCommentCommand,
  EditCommentCommand,
  PerformActionCommand,
  PostCommentCommand,
  RemoveActionCommand,
  ReplyToCommentCommand,
} from '@contexts/engagement/application/commands';
import type { CommentDto } from '@contexts/engagement/application/dto/comment.dto';
import type { UserActionDto } from '@contexts/engagement/application/dto/user-action.dto';
import {
  GetActionCountsQuery,
  GetCommentsForTargetQuery,
  GetUserActionsOnTargetQuery,
} from '@contexts/engagement/application/queries';
import { Action } from '@shared/domain/authorization/action.enum';
import { Subject } from '@shared/domain/authorization/subject.enum';
import { AuthenticatedGuard, CurrentUser, type UserContext } from '@shared/infrastructure/auth';
import { ILoggerService, LOGGER_SERVICE } from '@shared/infrastructure/logging';
import { AuthEndpointSchema } from '@shared/response';
import {
  BusinessLogicError,
  NotFoundError,
  ValidationError,
} from '@shared/response/errors/base-response-error';
import { RateLimit } from '@shared/security/rate-limiting/decorators/rate-limit.decorator';

// Zod schemas
import {
  actionCountsResponseSchema,
  commentResponseSchema,
  commentsListResponseSchema,
  deleteCommentBodySchema,
  deleteCommentParamsSchema,
  deleteCommentResponseSchema,
  editCommentSchema,
  getActionCountsQuerySchema,
  getCommentsQuerySchema,
  getUserActionsQuerySchema,
  performActionSchema,
  postCommentSchema,
  removeActionParamsSchema,
  replyToCommentSchema,
  userActionResponseSchema,
  userActionsOnTargetResponseSchema,
  type ActionCountsResponse,
  type CommentResponse,
  type CommentsListResponse,
  type DeleteCommentBody,
  type DeleteCommentParams,
  type DeleteCommentResponse,
  type EditCommentInput,
  type GetActionCountsQuery as GetActionCountsQueryInput,
  type GetCommentsQuery,
  type GetUserActionsQuery,
  type PerformActionInput,
  type PostCommentInput,
  type RemoveActionParams,
  type ReplyToCommentInput,
  type UserActionResponse,
  type UserActionsOnTargetResponse,
} from '@shared/validation/schemas/engagement';

// Rate limits
import { EngagementRateLimits } from './engagement.rate-limits';

/**
 * EngagementController
 *
 * REST API controller for engagement operations.
 * Provides endpoints for user actions and comments.
 *
 * All endpoints follow consistent patterns:
 * - Zod schema validation at API boundary (ADR-0020)
 * - Rate limiting on all operations (ADR-0022)
 * - Result pattern for error handling (ADR-0013)
 * - User ID extracted from JWT (TS-MULTI-ACTOR-001)
 */
@Controller('engagement')
@ApiTags('Engagement')
@ApiBearerAuth()
@UseGuards(AuthenticatedGuard, PermissionGuard)
export class EngagementController {
  private readonly logger: ILoggerService;

  constructor(
    @Inject(LOGGER_SERVICE) logger: ILoggerService,
    @Inject(ICommandBus) private readonly commandBus: ICommandBus,
    @Inject(IQueryBus) private readonly queryBus: IQueryBus
  ) {
    this.logger = logger.createChildLogger(EngagementController.name);
  }

  // ============================================================================
  // ACTION ENDPOINTS
  // ============================================================================

  /**
   * Perform Action
   *
   * User performs engagement action (like, bookmark, share, report, follow).
   *
   * Security Pattern (TS-MULTI-ACTOR-001):
   * - userId extracted from JWT token
   * - Prevents user impersonation attacks
   */
  @Post('actions')
  @RequirePermissions({ action: Action.CREATE, subject: Subject.USER_ACTION })
  @RateLimit(EngagementRateLimits.performAction)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Perform engagement action',
    description: 'User performs action (like, bookmark, share, report, follow) on target',
  })
  @AuthEndpointSchema({
    request: {
      body: performActionSchema, // ✅ Zod schema for request validation
    },
    response: {
      schema: userActionResponseSchema, // ✅ Zod schema for response type
      status: HttpStatus.CREATED,
      description: 'Action performed successfully',
    },
    errors: [ValidationError, BusinessLogicError],
    options: {
      operationType: 'perform-action',
    },
  })
  async performAction(
    @Body() body: PerformActionInput, // ✅ Type: z.infer<typeof performActionSchema>
    @CurrentUser() user: UserContext // ✅ userId from JWT, NOT request body
  ): Promise<Result<UserActionResponse>> { // ✅ Return type: Result<z.infer<typeof userActionResponseSchema>>
    // ============================================
    // Step 1: Logging (audit trail)
    // ============================================
    this.logger.debug('Performing action', {
      userId: user.id,
      actionType: body.actionType,
      targetType: body.targetType,
      targetId: body.targetId,
    });

    // ============================================
    // Step 2: Create command (userId from JWT, NOT request body)
    // ============================================
    const command = new PerformActionCommand(
      body.actionType as ActionTypeEnum,
      body.targetType as TargetTypeEnum,
      body.targetId,
      body.targetOwnerId ?? undefined,
      body.reportReason ?? undefined,
      body.reportCategory ?? undefined
    );

    // ============================================
    // Step 3: Execute command via command bus
    // ============================================
    const result = await this.commandBus.execute<PerformActionCommand, Result<UserActionDto>>(
      command
    );

    if (result.isFailure) {
      return Result.fail(result.error);
    }

    // ============================================
    // Step 4: Map DTO to response schema type
    // ============================================
    const dto = result.value;
    return Result.ok({
      id: dto.id,
      userId: dto.userId,
      actionType: dto.actionType,
      targetType: dto.targetType,
      targetId: dto.targetId,
      createdAt: dto.createdAt.toISOString(),
    });
  }

  /**
   * Remove Action
   *
   * User removes previously performed action.
   *
   * Security Pattern (TS-MULTI-ACTOR-001):
   * - userId extracted from JWT token
   * - User can only remove own actions
   */
  @Delete('actions/:actionId')
  @RequirePermissions({ action: Action.DELETE, subject: Subject.USER_ACTION })
  @RateLimit(EngagementRateLimits.removeAction)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove engagement action',
    description: 'User removes previously performed action',
  })
  @AuthEndpointSchema({
    request: {
      params: removeActionParamsSchema, // ✅ Path params validation
    },
    response: {
      status: HttpStatus.NO_CONTENT,
      description: 'Action removed successfully',
    },
    errors: [ValidationError, NotFoundError, BusinessLogicError],
    options: {
      operationType: 'remove-action',
    },
  })
  async removeAction(
    @Param() params: RemoveActionParams,
    @CurrentUser() user: UserContext
  ): Promise<Result<void>> {
    this.logger.debug('Removing action', {
      userId: user.id,
      actionId: params.actionId,
    });

    const command = new RemoveActionCommand(params.actionId);

    const result = await this.commandBus.execute<RemoveActionCommand, Result<void>>(command);

    return result;
  }

  // ============================================================================
  // COMMENT ENDPOINTS
  // ============================================================================

  /**
   * Post Comment
   *
   * User posts top-level comment on target entity.
   *
   * Security Pattern (TS-MULTI-ACTOR-001):
   * - userId extracted from JWT token
   * - Prevents user impersonation attacks
   */
  @Post('comments')
  @RequirePermissions({ action: Action.CREATE, subject: Subject.COMMENT })
  @RateLimit(EngagementRateLimits.postComment)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Post comment',
    description: 'User posts top-level comment on target entity',
  })
  @AuthEndpointSchema({
    request: {
      body: postCommentSchema,
    },
    response: {
      schema: commentResponseSchema,
      status: HttpStatus.CREATED,
      description: 'Comment posted successfully',
    },
    errors: [ValidationError, BusinessLogicError],
    options: {
      operationType: 'post-comment',
    },
  })
  async postComment(
    @Body() body: PostCommentInput,
    @CurrentUser() user: UserContext
  ): Promise<Result<CommentResponse>> {
    this.logger.debug('Posting comment', {
      userId: user.id,
      targetType: body.targetType,
      targetId: body.targetId,
      contentLength: body.content.length,
    });

    const command = new PostCommentCommand(
      body.content,
      body.targetType as TargetTypeEnum,
      body.targetId,
      body.targetOwnerId ?? undefined,
      body.targetCity ?? undefined // TS-RES-005: For visitor comment limits
    );

    const result = await this.commandBus.execute<PostCommentCommand, Result<CommentDto>>(command);

    if (result.isFailure) {
      return Result.fail(result.error);
    }

    const dto = result.value;
    return Result.ok({
      id: dto.id,
      userId: dto.userId,
      content: dto.content,
      targetType: dto.targetType,
      targetId: dto.targetId,
      nestingLevel: dto.nestingLevel,
      moderationStatus: dto.moderationStatus,
      editCount: dto.editCount,
      createdAt: dto.createdAt.toISOString(),
      updatedAt: dto.updatedAt.toISOString(),
    });
  }
}
```

---

### Example 2: Zod Schemas (Validation Layer)

**File**: `src/shared/validation/schemas/engagement/engagement.schemas.ts` (~600 lines)

**Key characteristics**:
- Strict enums prevent injection attacks
- Conditional validation (refine)
- Safe text patterns (no HTML/script tags)
- UUID validation for all IDs
- Transform methods for normalization
- OpenAPI integration

```typescript
import { z } from 'zod';

// ============================================
// Enums (must match domain value objects)
// ============================================

/**
 * Action type enum - matches ActionTypeEnum in domain
 */
export const actionTypeSchema = z
  .enum(['like', 'bookmark', 'share', 'report', 'follow'])
  .openapi({
    description: 'Type of user engagement action',
    example: 'like',
  });

/**
 * Report category enum - STRICT enumeration of allowed report categories
 * SECURITY: Only predefined categories allowed to prevent injection attacks
 */
export const reportCategorySchema = z
  .enum([
    'spam',
    'harassment',
    'hate_speech',
    'misinformation',
    'inappropriate_content',
    'fraud',
    'impersonation',
    'violence',
    'copyright',
    'other',
  ])
  .openapi({
    description: 'Category of content report (strict enumeration)',
    example: 'spam',
  });

/**
 * Target type enum - matches TargetTypeEnum in domain
 */
export const targetTypeSchema = z
  .enum([
    'community_event',
    'community_alert',
    'job_request',
    'comment',
    'user_profile',
    'organization',
    'local_share',
  ])
  .openapi({
    description: 'Type of target entity for engagement',
    example: 'community_event',
  });

// ============================================
// ACTION Request Schemas
// ============================================

/**
 * Regex pattern for safe text content (no HTML/script tags)
 * SECURITY: Prevents XSS via content injection
 */
const SAFE_TEXT_PATTERN = /^[^<>]*$/;

/**
 * Perform action request body
 *
 * Security Note (TS-MULTI-ACTOR-001):
 * - userId is NOT in request body
 * - userId extracted from JWT token in controller
 * - targetOwnerId is optional - used for self-action prevention
 *
 * Security Note (ADR-0021):
 * - Strict enum for reportCategory - prevents injection
 * - Conditional validation: reportCategory required when actionType='report'
 * - reportReason validated for dangerous characters
 */
export const performActionSchema = z
  .object({
    actionType: actionTypeSchema,
    targetType: targetTypeSchema,
    targetId: z.string().uuid('Target ID must be a valid UUID'), // ✅ UUID validation
    targetOwnerId: z
      .string()
      .uuid('Target owner ID must be a valid UUID')
      .optional()
      .nullable()
      .describe('Owner of the target content (for self-action prevention)'),
    reportCategory: reportCategorySchema
      .optional()
      .nullable()
      .describe('Required when actionType is report'),
    reportReason: z
      .string()
      .min(10, 'Report reason must be at least 10 characters')
      .max(500, 'Report reason must be at most 500 characters')
      .regex(SAFE_TEXT_PATTERN, 'Report reason contains invalid characters') // ✅ XSS prevention
      .optional()
      .nullable()
      .transform(val => val?.trim()) // ✅ Normalization
      .describe('Optional detailed reason for reports'),
  })
  .strict() // ✅ No extra fields allowed
  .refine(
    data => {
      // ✅ Conditional validation: reportCategory required when actionType='report'
      if (data.actionType === 'report') {
        return data.reportCategory != null;
      }
      return true;
    },
    {
      message: 'Kategoria zgłoszenia jest wymagana dla akcji typu report',
      path: ['reportCategory'],
    }
  )
  .openapi({
    description: 'Perform user action (like, bookmark, share, report, follow)',
    example: {
      actionType: 'like',
      targetType: 'community_event',
      targetId: '550e8400-e29b-41d4-a716-446655440000',
      targetOwnerId: null,
    },
  });

// ============================================
// Response Schemas
// ============================================

/**
 * User action response schema
 *
 * Used by controller return type: Result<UserActionResponse>
 * where UserActionResponse = z.infer<typeof userActionResponseSchema>
 */
export const userActionResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  actionType: actionTypeSchema,
  targetType: targetTypeSchema,
  targetId: z.string().uuid(),
  createdAt: z.string().datetime(), // ✅ ISO 8601 format
});

/**
 * Type inference for controller return types
 */
export type UserActionResponse = z.infer<typeof userActionResponseSchema>;
export type PerformActionInput = z.infer<typeof performActionSchema>;
```

---

### Example 2b: Shared Validators (`commonValidators` + `PASSWORD_REQUIREMENTS`)

**File**: `src/shared/validation/common.validators.ts`

Shared Zod primitives prevent drift across 40+ schema files. Every schema that touches email, password, UUID, coordinates, or bounded integers MUST delegate to shared validators — inline magic numbers and ad-hoc regex are forbidden.

**Invariants:**

| Primitive | Rule |
|---|---|
| `commonValidators.email` | `z.string().email().trim().toLowerCase()` — email is always normalized at the boundary. Domain `Email` VO trusts normalized input. |
| `PASSWORD_REQUIREMENTS` | Single source of truth for min/max length and character classes. Used by both register and change-password schemas (prevents min-8 vs min-12 drift). |
| `commonValidators.challengeToken` | `z.string().uuid()` — challenge tokens (email verification, phone OTP) must be UUID. |
| `commonValidators.sessionId` | `.min(32).max(128)` format bound — logout and revocation schemas. |
| `commonValidators.displayName` | `.trim()` is mandatory — prevents whitespace-only names and hidden-prefix impersonation. |
| `commonValidators.latitude` / `longitude` | `.min(-90).max(90)` / `.min(-180).max(180)` with `.openapi()` metadata. |
| `commonValidators.coerceLatitude` / `coerceLongitude` | Query-string variants using `z.coerce.number()`. |
| `commonValidators.polishLatitude` / `polishLongitude` | Bounded to `POLAND_BOUNDS` for country-scoped geographic endpoints. |
| `expiresAtSchema` | `z.string().datetime().refine(d => new Date(d) > new Date(), 'must be in future')` — roles, permissions, subscriptions, groups. |

```typescript
// ✅ CORRECT — delegate everywhere
import { commonValidators, PASSWORD_REQUIREMENTS, POLAND_BOUNDS } from '@shared/validation/common.validators';

export const registerUserSchema = z.object({
  email: commonValidators.email,              // Normalized trim+lowercase
  password: z.string()
    .min(PASSWORD_REQUIREMENTS.minLength)
    .max(PASSWORD_REQUIREMENTS.maxLength)
    .regex(PASSWORD_REQUIREMENTS.pattern),
  displayName: commonValidators.displayName,
});

export const verifyEmailSchema = z.object({
  challengeToken: commonValidators.challengeToken, // UUID
});

export const logoutSchema = z.object({
  sessionId: commonValidators.sessionId,           // min-32/max-128
});

export const resolveFromGpsSchema = z.object({
  latitude: commonValidators.polishLatitude,
  longitude: commonValidators.polishLongitude,
});

export const createRoleSchema = z.object({
  name: commonValidators.roleName,
  expiresAt: expiresAtSchema,                      // Must be future date
});

// ❌ WRONG — inline magic numbers, drift risk
export const BAD_registerUserSchema = z.object({
  email: z.string().email(),                       // Forgot .trim().toLowerCase()!
  password: z.string().min(8),                     // Inconsistent with PASSWORD_REQUIREMENTS.minLength=12
  latitude: z.number().min(-90).max(90),           // Not bounded to Poland when required
});
```

**When to add a new primitive to `commonValidators`:** the same validation appears in 2+ schemas. One-off validators stay local to the schema.

---

### Example 2c: `AuthorSnapshotDto` — Nested Author Data in Responses

**Rule**: Response DTOs expose author/organizer/creator data as a **nested object** `AuthorSnapshotDto { userId, displayName, avatarUrl }`, never as flat fields (`authorId`, `authorName`, `authorAvatarUrl`).

**Rationale:**
1. Mobile clients consume the same shape everywhere → zero de-duplication logic.
2. Adding a future author field (e.g., `verificationLevel`) becomes a single-location change.
3. Avoids naming drift — one context wrote `creatorName`, another `userName`, a third `authorDisplayName`. All mean the same thing.

**Shared schema** (Zod + OpenAPI):

```typescript
// src/shared/response/openapi/author-schemas.ts
export const authorSnapshotSchema = z
  .object({
    userId: z.string().uuid(),
    displayName: z.string(),
    avatarUrl: z.string().url().nullable(),
  })
  .openapi({ description: 'Snapshot of author/organizer/creator identity data' });
```

**Response DTOs delegate (NEVER inline the shape):**

```typescript
// ✅ CORRECT — nested AuthorSnapshotDto
export const eventResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  organizer: authorSnapshotSchema,        // Nested — no flat fields
  // ...
});

export const groupMemberResponseSchema = z.object({
  user: authorSnapshotSchema,             // Nested
  roleLabel: z.string(),
});

export const localShareResponseSchema = z.object({
  giver: authorSnapshotSchema,            // Nested (previously creatorId + creatorName)
  itemTitle: z.string(),
});

// For schemas that need extra author fields, use .extend()
export const groupPostAuthorSchema = authorSnapshotSchema.extend({
  membershipBadge: z.enum(['owner', 'moderator', 'member']),
});

// ❌ WRONG — flat author fields
export const BAD_eventResponseSchema = z.object({
  organizerId: z.string().uuid(),         // Flat → drift + inconsistency
  organizerDisplayName: z.string(),
  organizerAvatarUrl: z.string().nullable(),
});
```

**Naming per context** (the nested key reflects the role):
- Events → `organizer`
- Group members → `user`
- Announcements → `author`
- Local shares → `giver`
- Claims → `claimer`
- Posts/comments → `author`

The **shape** is always `AuthorSnapshotDto`; only the **key** changes.

---

### Example 3: Rate Limits (Separate File)

**File**: `src/app/api/engagement/engagement.rate-limits.ts` (~50 lines)

**Key characteristics**:
- Separate file from controller
- Consistent rate limit config
- Follows ADR-0022 (Unified Rate Limiting)

```typescript
/**
 * Engagement Rate Limits
 *
 * Rate limit configurations for engagement API endpoints.
 * Following ADR-0022 (Unified Rate Limiting Strategy).
 *
 * @module EngagementRateLimits
 */

import { RateLimitConfig } from '@shared/security/rate-limiting/types';

/**
 * Rate limit configurations for engagement endpoints
 */
export const EngagementRateLimits: Record<string, RateLimitConfig> = {
  // ============================================
  // Action Endpoints
  // ============================================

  /**
   * Perform action (like, bookmark, share, report, follow)
   *
   * Limit: 100 requests per 15 minutes
   * Prevents: Action spam (excessive liking, reporting)
   */
  performAction: {
    points: 100,
    duration: 15 * 60, // 15 minutes
    blockDuration: 15 * 60, // 15 minutes
  },

  /**
   * Remove action
   *
   * Limit: 50 requests per 15 minutes
   * Prevents: Spam removal attempts
   */
  removeAction: {
    points: 50,
    duration: 15 * 60,
    blockDuration: 15 * 60,
  },

  // ============================================
  // Comment Endpoints
  // ============================================

  /**
   * Post comment
   *
   * Limit: 20 requests per 15 minutes
   * Prevents: Comment spam
   */
  postComment: {
    points: 20,
    duration: 15 * 60,
    blockDuration: 15 * 60,
  },

  /**
   * Edit comment
   *
   * Limit: 30 requests per 15 minutes
   * Prevents: Excessive editing spam
   */
  editComment: {
    points: 30,
    duration: 15 * 60,
    blockDuration: 15 * 60,
  },
};
```

---

## 📋 Rules

### MUST

1. **MUST use @CurrentUser decorator** - Extract userId from JWT, NEVER request body (TS-MULTI-ACTOR-001)
2. **MUST validate with Zod schemas** - All inputs validated at API boundary (ADR-0020)
3. **MUST return Result<z.infer<typeof schema>>** - Type safety for responses
4. **MUST apply @RateLimit** - DoS protection on all endpoints (ADR-0022)
5. **MUST use @AuthEndpointSchema** - Automatic OpenAPI docs, error handling
6. **MUST separate rate limits** - `*.rate-limits.ts` files for endpoint limits
7. **MUST use command/query bus** - Controllers ONLY orchestrate, NO business logic
8. **MUST log operations** - Audit trail for all operations
9. **MUST use strict mode** - `.strict()` on all Zod schemas (no extra fields)
10. **MUST use UUID validation** - All IDs validated as UUIDs

### MUST NOT

1. **NEVER accept userId from request body** - Security vulnerability (ADR-0021)
2. **NEVER business logic in controllers** - Delegate to command/query handlers
3. **NEVER skip rate limiting** - DoS vulnerability
4. **NEVER skip schema validation** - Data integrity issues
5. **NEVER return raw DTOs** - Use `z.infer<typeof schema>` types
6. **NEVER throw exceptions** - Always return Result
7. **NEVER allow HTML in text inputs** - XSS vulnerability (use SAFE_TEXT_PATTERN)

---

## ⚠️ Anti-Patterns

### 1. userId from Request Body (CRITICAL SECURITY FLAW)

```typescript
// ❌ WRONG: userId from request body
export const performActionSchema = z.object({
  userId: z.string().uuid(), // ❌ CRITICAL SECURITY FLAW!
  actionType: actionTypeSchema,
  targetId: z.string().uuid(),
});

async performAction(@Body() body: PerformActionInput): Promise<Result<UserActionResponse>> {
  const command = new PerformActionCommand(
    body.userId, // ❌ User can impersonate anyone!
    body.actionType,
    body.targetId
  );
  // ...
}

// ✅ CORRECT: userId from JWT token
export const performActionSchema = z.object({
  // ✅ NO userId field!
  actionType: actionTypeSchema,
  targetId: z.string().uuid(),
});

async performAction(
  @Body() body: PerformActionInput,
  @CurrentUser() user: UserContext // ✅ userId from JWT, cannot fake
): Promise<Result<UserActionResponse>> {
  const command = new PerformActionCommand(
    body.actionType,
    body.targetId
  );
  // Command handler extracts userId from RequestContextService
}
```

---

### 2. Missing Rate Limiting (DoS Vulnerability)

```typescript
// ❌ WRONG: No rate limiting
@Post('comments')
@RequirePermissions({ action: Action.CREATE, subject: Subject.COMMENT })
// Missing: @RateLimit decorator
async postComment(@Body() body: PostCommentInput): Promise<Result<CommentResponse>> {
  // Problem: Attacker can POST 1000 comments/second → database overload
}

// ✅ CORRECT: Rate limiting applied
@Post('comments')
@RequirePermissions({ action: Action.CREATE, subject: Subject.COMMENT })
@RateLimit(EngagementRateLimits.postComment) // ✅ 20 requests per 15 minutes
async postComment(@Body() body: PostCommentInput): Promise<Result<CommentResponse>> {
  // Rate limiter blocks excessive requests
}
```

---

### 3. Business Logic in Controller (Should be in Handler)

```typescript
// ❌ WRONG: Business logic in controller
async postComment(
  @Body() body: PostCommentInput,
  @CurrentUser() user: UserContext
): Promise<Result<CommentResponse>> {
  // ❌ Business rule in controller!
  if (body.content.length < 5) {
    return Result.fail(new ValidationError('Content too short'));
  }

  // ❌ Trust level check in controller!
  const trustLevel = await this.trustService.getUserTrustLevel(user.id);
  if (trustLevel < 40) {
    return Result.fail(new BusinessLogicError('Insufficient trust'));
  }

  // ... create comment
}

// ✅ CORRECT: Business logic in handler
async postComment(
  @Body() body: PostCommentInput,
  @CurrentUser() user: UserContext
): Promise<Result<CommentResponse>> {
  // ✅ Controller ONLY orchestrates
  const command = new PostCommentCommand(
    body.content,
    body.targetType as TargetTypeEnum,
    body.targetId
  );

  const result = await this.commandBus.execute<PostCommentCommand, Result<CommentDto>>(command);
  // ✅ Handler validates business rules (content length, trust level)

  return result.isFailure ? Result.fail(result.error) : Result.ok(this.mapToResponse(result.value));
}
```

---

### 4. Missing XSS Protection (Allows HTML Injection)

```typescript
// ❌ WRONG: No XSS protection
export const postCommentSchema = z.object({
  content: z
    .string()
    .min(5)
    .max(2000),
  // Missing: HTML tag validation
});

// Attacker POSTs: { "content": "<script>alert('XSS')</script>" }
// Result: XSS attack stored in database, executed when rendered

// ✅ CORRECT: XSS protection with regex
const SAFE_TEXT_PATTERN = /^[^<>]*$/; // No < or > characters

export const postCommentSchema = z.object({
  content: z
    .string()
    .min(5, 'Content must be at least 5 characters')
    .max(2000, 'Content must be at most 2000 characters')
    .regex(SAFE_TEXT_PATTERN, 'Content contains invalid characters'), // ✅ XSS prevention
});

// Attacker POSTs: { "content": "<script>alert('XSS')</script>" }
// Result: Zod validation fails → 400 Bad Request
```

---

### 5. Returning Raw DTOs (No Type Safety)

```typescript
// ❌ WRONG: Returning raw DTO (no type safety)
async performAction(
  @Body() body: PerformActionInput,
  @CurrentUser() user: UserContext
): Promise<UserActionDto> { // ❌ Raw DTO type
  const result = await this.commandBus.execute<PerformActionCommand, Result<UserActionDto>>(command);

  return result.value; // ❌ No Result pattern, no schema validation
}

// Problem: If UserActionDto changes, TypeScript doesn't detect schema mismatch

// ✅ CORRECT: Returning z.infer<typeof schema> (type safety)
async performAction(
  @Body() body: PerformActionInput,
  @CurrentUser() user: UserContext
): Promise<Result<UserActionResponse>> { // ✅ z.infer<typeof userActionResponseSchema>
  const result = await this.commandBus.execute<PerformActionCommand, Result<UserActionDto>>(command);

  if (result.isFailure) {
    return Result.fail(result.error);
  }

  // ✅ Explicit mapping to schema type
  return Result.ok({
    id: result.value.id,
    userId: result.value.userId,
    actionType: result.value.actionType,
    targetType: result.value.targetType,
    targetId: result.value.targetId,
    createdAt: result.value.createdAt.toISOString(),
  });
}
```

---

### 6. Using Generic `new Error()` (Wrong Error Type)

```typescript
// ❌ WRONG: Generic error (loses type information)
async applyModerationDecision(
  @Body() body: ApplyModerationDecisionDto,
): Promise<Result<{ message: string }>> {
  const moderatorId = this.requestContext.getUserId();

  if (!moderatorId) {
    return Result.fail(new Error('Unauthorized: User not authenticated')); // ❌ Generic Error!
  }

  // Problem: Error mapper can't determine HTTP status → defaults to 500
}

// ✅ CORRECT: Infrastructure-specific errors
import { AuthenticationError, BusinessLogicError } from '@shared/response/errors/base-response-error';

async applyModerationDecision(
  @Body() body: ApplyModerationDecisionDto,
): Promise<Result<{ message: string }>> {
  const moderatorId = this.requestContext.getUserId();

  if (!moderatorId) {
    return Result.fail(new AuthenticationError('User not authenticated')); // ✅ Proper error type → 401
  }

  // Error mapper automatically converts AuthenticationError → HTTP 401
}
```

**Available Infrastructure Errors**:
- `AuthenticationError` → 401 Unauthorized
- `AuthorizationError` → 403 Forbidden
- `ValidationError` → 400 Bad Request
- `BusinessLogicError` → 422 Unprocessable Entity
- `NotFoundError` → 404 Not Found
- `ConflictError` → 409 Conflict

**Reference**: `src/app/api/moderation/moderation.controller.ts:145` (bug example)

---

### 7. Adding `success` Field (Duplicates JSend)

```typescript
// ❌ WRONG: Manual success field (duplicates JSend interceptor)
async applyModerationDecision(
  @Body() body: ApplyModerationDecisionDto,
): Promise<Result<{ success: boolean; message: string }>> {
  // ... apply decision

  return Result.ok({
    success: true, // ❌ DUPLICATE! JSend adds this automatically
    message: 'Moderation decision applied successfully',
  });
}

// Result: Response has BOTH 'success: true' AND 'status: "success"'
// {
//   "status": "success",    // ← Added by JSend interceptor
//   "data": {
//     "success": true,      // ← DUPLICATE from controller
//     "message": "..."
//   }
// }

// ✅ CORRECT: Let JSend handle status (NO success field)
async applyModerationDecision(
  @Body() body: ApplyModerationDecisionDto,
): Promise<Result<{ message: string }>> {
  // ... apply decision

  return Result.ok({
    message: 'Moderation decision applied successfully', // ✅ No 'success' field
  });
}

// Result: Clean response with JSend status wrapper
// {
//   "status": "success",    // ← Added automatically by JSend
//   "data": {
//     "message": "Moderation decision applied successfully"
//   }
// }
```

**JSend Automatic Response Wrapping**:
```typescript
// Your controller returns:
Result.ok({ message: 'Success' })

// JSend interceptor transforms to:
{
  status: "success",  // Added automatically
  data: {
    message: 'Success'
  }
}

// Your controller returns error:
Result.fail(new ValidationError('Invalid input'))

// JSend interceptor transforms to:
{
  status: "fail",     // Added automatically
  message: "Invalid input",
  code: "VALIDATION_ERROR"
}
```

**Reference**: `src/app/api/moderation/moderation.controller.ts:226-229` (bug example)

---

## 📚 References

### ADRs
- **ADR-0013**: Hybrid Error Handling - Result pattern in application layer
- **ADR-0020**: Zod Schema Architecture - Validation at API boundary
- **ADR-0021**: Validation Layer Separation - Format validation at API, business rules in domain
- **ADR-0022**: Unified Rate Limiting Strategy - Consistent rate limiting across endpoints

### Implementation Files
- `src/app/api/engagement/engagement.controller.ts` (~400L)
- `src/app/api/engagement/engagement.rate-limits.ts` (~50L)
- `src/shared/validation/schemas/engagement/engagement.schemas.ts` (~600L)

### Related Patterns
- **command-handler-pattern.md** - Handlers orchestrated by controllers
- **query-handler-pattern.md** - Queries orchestrated by controllers
- **dual-identity-pattern.md** - @CurrentUser decorator pattern
- **geographic-filtering-pattern.md** - Geographic query filters (TERYT + GPS radius) for moderation queues

---

## 🎯 When to Use

### Use Controller & Schema Pattern for

✅ **REST API endpoints**: All HTTP endpoints
✅ **User-facing operations**: Actions requiring authentication
✅ **CRUD operations**: Create, Read, Update, Delete
✅ **Query endpoints**: Filtered lists, search, pagination

### Controller Responsibilities

- **Request validation**: Zod schema validation at API boundary
- **Authentication/Authorization**: Guards, decorators
- **Rate limiting**: DoS protection
- **Orchestration**: Call command/query bus
- **Response mapping**: DTO → Response schema type
- **Error handling**: Return Result pattern
- **Logging**: Audit trail for operations

### Controller Does NOT Handle

❌ **Business rules**: Delegate to handlers
❌ **Data persistence**: Delegate to repositories
❌ **Complex validation**: Delegate to domain
❌ **Cross-aggregate coordination**: Delegate to handlers

---

**Version**: 1.1
**Created**: 2026-01-04
**Last Updated**: 2026-01-05
**Maintained By**: @project-project-orchestrator
**Primary Users**: infrastructure-testing-implementer, code-quality-verifier

**Pattern Type**: Infrastructure (MANDATORY for all REST API endpoints)
**Status**: Production-enforced

**v1.1 Changes** (2026-01-05):
- Added Anti-Pattern #6: Generic `new Error()` instead of infrastructure errors
- Added Anti-Pattern #7: Manual `success` field duplicating JSend interceptor
- Added explicit documentation of JSend automatic response wrapping
- References to actual bugs in `moderation.controller.ts`
**Lines**: ~600
