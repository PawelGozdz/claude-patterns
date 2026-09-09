# Zod Schema Validation Pattern

**Tags**: "api:security:validation", "api:api-surface:contract"
**Layer**: Infrastructure
**Status**: production

## When to Use

**Use this pattern for:**
- ✅ every request body, query string and path parameter crossing the HTTP boundary — the schema is the only place format is checked
- ✅ response shapes a controller returns, so `z.infer<typeof schema>` types the handler's output instead of a hand-written DTO
- ✅ reusing one definition of "a valid email", "a valid password", "safe text" across contexts (`commonValidators`, `PASSWORD_REQUIREMENTS`)
- ✅ nested read-model fragments repeated across endpoints (`AuthorSnapshotDto` and its per-context key)

**Do NOT use for:**
- ❌ business rules — "a user under 16 cannot publish" is a domain invariant or specification, not a schema refinement (ADR-0021 draws this line)
- ❌ cross-aggregate or database-dependent checks (uniqueness, existence) — a schema runs before anything is loaded
- ❌ the controller's own shape, decorators and orchestration — that is `controller-schema-pattern.md`
- ❌ throttling and abuse limits — `rate-limit-guard-pattern.md`

---

## Rules

### MUST

1. **`.strict()` on every object schema** — unknown fields are rejected, not silently dropped
2. **UUID validation on every id** — `z.string().uuid()`, not `z.string()`
3. **Text inputs go through the safe-text pattern** — HTML in a free-text field is an XSS vector
4. **Shared validators for shared concepts** — one `commonValidators.email`, not one per context
5. **Response schemas are exported and inferred** — controllers return `Result<z.infer<typeof schema>>`

### MUST NOT

1. **NEVER put a business rule in a schema** — format only; the domain owns meaning
2. **NEVER duplicate a validator inline** when `commonValidators` already has it — the two drift
3. **NEVER leave a schema without `.strict()`** — a typo'd field then passes validation silently

---

## Implementation

### Request and response schemas

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

### Shared validators (`commonValidators` + `PASSWORD_REQUIREMENTS`)

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

### `AuthorSnapshotDto` — nested author data in responses

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


## Anti-Patterns

### Missing XSS protection (allows HTML injection)

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


---

## References

- [`controller-schema-pattern.md`](./controller-schema-pattern.md) — the controller that consumes these schemas
- [`rate-limit-guard-pattern.md`](./rate-limit-guard-pattern.md) — the other half of the API boundary
- ADR-0020 (Zod at the API boundary), ADR-0021 (format validation at the boundary, business rules in the domain)
- Split out of `controller-schema-pattern.md` on 2026-09-07 (that file was 1148 lines covering three separate concerns)
