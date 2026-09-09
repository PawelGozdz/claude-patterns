# Rate Limit Guard Pattern

**Tags**: "api:security:rate-limit"
**Layer**: Infrastructure
**Status**: production

## When to Use

**Use this pattern for:**
- ✅ every write endpoint — create, update, delete, and anything that sends mail or SMS
- ✅ authentication endpoints, where the limit is the primary defence against credential stuffing
- ✅ endpoints whose cost is asymmetric: cheap to call, expensive to serve (search, geo queries, exports)
- ✅ keeping per-endpoint limits in one reviewable `*.rate-limits.ts` file per context instead of scattered decorator arguments

**Do NOT use for:**
- ❌ deciding whether a caller may act at all — a rate limit caps how often, never whether; that is authorization (`golden-rule-endpoints.md`)
- ❌ per-tenant quotas and billing limits — those are business rules with their own persistence, not a guard
- ❌ input shape checks — `zod-schema-validation-pattern.md`
- ❌ queue back-pressure and worker concurrency — `bullmq-queue-pattern.md`

---

## Rules

### MUST

1. **`@RateLimit` on every endpoint** (ADR-0022) — including reads that are expensive to serve
2. **Limits live in `*.rate-limits.ts`**, one file per context, imported by the controller
3. **Auth endpoints get a `blockDuration`** — exhausting the limit locks the caller out, it does not just slow them
4. **The limit key is the authenticated actor where one exists**, the client address otherwise

### MUST NOT

1. **NEVER ship a write endpoint without a limit** — the anti-pattern below is what that costs
2. **NEVER inline the numbers in the decorator** — they stop being reviewable as a set

---

## Implementation

### The rate-limit file

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


## Anti-Patterns

### No rate limit on a write endpoint (DoS)

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


---

## References

- [`controller-schema-pattern.md`](./controller-schema-pattern.md) — the controller that carries the decorator
- [`rate-limit-testing-pattern.md`](../testing/rate-limit-testing-pattern.md) — how to test a limit without sleeping through it
- ADR-0022 (rate limiting)
- Split out of `controller-schema-pattern.md` on 2026-09-07 (that file was 1148 lines covering three separate concerns)
