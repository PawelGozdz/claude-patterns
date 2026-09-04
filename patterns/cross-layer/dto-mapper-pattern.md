# Pattern: Dto Mapper

**Tags**: "api:app"
**Layer**: Cross-layer
**Level**: core
**Status**: experimental

## What This Is

A command handler's success response is assembled in **one named function**
(`toXxxResult(aggregate, ...derivedValues)`), called from the single `Result.ok(...)`
return at the end of `executeBusinessLogic()` — never built inline, field by field, at
every `return Result.ok({...})` a handler happens to have. Any field whose value could be
computed more than one way (a derived boolean, a formatted amount, a status string) is
computed by **exactly one rule**, inside the mapper, so two return paths in the same
handler cannot silently disagree about it.

This is the application-layer counterpart to `infrastructure/mapper-pattern.md`
(`toDomain()`/`toPersistence()` at the repository boundary): same idea — one seam, one
direction of translation, one place a bug in the translation can hide — applied to the
handler→DTO boundary instead of the aggregate→row boundary.

## When to Use

**Use this pattern for:**
- ✅ A command handler has **more than one return path** that reaches
  `Result.ok(...)` — a unified CREATE path with one success return still benefits once any
  field on the DTO is *derived* (not copied 1:1 from the aggregate), because the derivation
  logic itself needs exactly one home.
- ✅ At least one field on the response DTO is **computed**, not merely read off the
  aggregate — a formatted money value, a boolean derived from a comparison, a status string
  mapped from an enum. The moment a field involves a rule, inlining it risks two return
  paths applying two different rules to the same rule.
- ✅ The DTO shape is reused by more than one command (e.g. create and update returning the
  same result shape) — one mapper is the single place both handlers stay in sync from.

**Do NOT use for:**
- ❌ A response that is a pure 1:1 field copy off the aggregate with zero derived values and
  exactly one return path — a mapper adds a named indirection with nothing to consolidate.
  `Result.ok({ id: x.getId().toString() })` inline is fine.
- ❌ Query handler read models — those are typically assembled directly from a
  projection/read-repository row, not from a domain aggregate; see
  `application/query-handler-pattern.md` instead.

## Implementation

Real production shape (`neighborhood-economy/application/shares/commands/create-local-share/create-local-share-result.mapper.ts`),
the exact function `toCreateLocalShareResult()`:

```typescript
import type { LocalShareAggregate } from '@contexts/neighborhood-economy/domain/shares/aggregates/local-share.aggregate';
import type { Money } from '@shared/domain/value-objects/money.vo';

import { formatListingFee } from '../../types/listing-fee.type';

import type { ICreateLocalShareResult } from './handler';

/**
 * TS-ARCH-HANDLER-CONTRACT-001 (ADR-0118 E2): single DTO-assembly point for
 * `CreateLocalShareHandler`, replacing the two inline `Result.ok({...})`
 * literals previously duplicated at the end of each creation branch.
 *
 * `paymentRequired` is derived from ONE rule (`!totalListingFee.isZero()`)
 * for the single, unified creation path — the previous explicit-location
 * branch hardcoded `false` here (a P2 audit finding, TS-ARCH-HANDLER-
 * CONTRACT-001) while the residence-default branch already computed it
 * correctly; unification removes the discrepancy by construction.
 */
export function toCreateLocalShareResult(
  localShare: LocalShareAggregate,
  totalListingFee: Money
): ICreateLocalShareResult {
  const shareId = localShare.getId().toString();

  return {
    id: shareId,
    shareId, // alias for id — backward compat
    listingFee: formatListingFee(totalListingFee),
    status: localShare.isActive ? 'active' : 'draft',
    moderationStatus: localShare.moderationStatus?.status ?? 'draft',
    paymentRequired: !totalListingFee.isZero(),
    paymentUrl: null, // Always null for MVP (fee=0 path; Phase 2 will set payU URL when paymentRequired=true)
  };
}
```

Call site — the handler's ONLY assembly of the success DTO, at its single `Result.ok(...)`:

```typescript
// executeBusinessLogic(), after save() + confirmConsumption() have both succeeded:
return Result.ok(toCreateLocalShareResult(localShare, totalListingFee));
```

**Shape to follow when writing a new mapper:**
1. Plain function, not a class — no state, no DI, pure `(aggregate, ...derivedInputs) => DTO`.
2. Every parameter the function needs to derive a field is passed explicitly
   (`totalListingFee` here) — the mapper never re-derives a value the caller already
   computed by reaching back into the aggregate for a *different* source of truth.
3. Each derived field's rule is a single expression, commented with WHY it's derived this
   way when the rule isn't self-evident (see `paymentRequired` above).
4. Co-located with the command it serves (`create-local-share-result.mapper.ts` sits next
   to `handler.ts`), not in a shared cross-command file — the DTO shape is command-specific
   even when the underlying aggregate is shared with other commands.

## Anti-Patterns

### Anti-Pattern 1: The same derived field computed by two different rules in one handler

The exact bug this pattern was extracted to close (P2 audit finding, TS-ARCH-HANDLER-
CONTRACT-001), from `create-local-share/handler.ts` before the refactor:

```typescript
// ❌ WRONG — two Result.ok(...) literals, two DIFFERENT rules for the same field
// Branch A (explicit location):
return Result.ok({
  id: shareId,
  paymentRequired: false,   // ❌ hardcoded — silently ignores totalListingFee
  // ...
});

// Branch B (residence-default location), same handler:
return Result.ok({
  id: shareId,
  paymentRequired: !totalListingFee.isZero(),   // computed correctly here
  // ...
});
```

Both branches build the *same* response shape, but only one of them actually consulted
`totalListingFee`. A user on the branch-A path could be charged a non-zero listing fee and
still receive `paymentRequired: false` — a payment-state lie the caller has no way to
detect. Consolidating both branches into one call to `toCreateLocalShareResult()` removes
the discrepancy **by construction**: there is now exactly one place `paymentRequired` gets
computed, so the two rules cannot diverge again without touching the same line.

### Anti-Pattern 2: Inline DTO literal duplicated instead of factored into a mapper

```typescript
// ❌ WRONG — response shape assembled by hand at every return
async executeBusinessLogic(command) {
  // ...path 1...
  return Result.ok({ id: x.getId().toString(), status: x.isActive ? 'active' : 'draft', /* 6 more fields */ });
  // ...path 2, 40 lines later...
  return Result.ok({ id: x.getId().toString(), status: x.isActive ? 'active' : 'draft', /* same 6 fields, retyped */ });
}
```

Even when both literals currently agree, they are two independent places that must be kept
in sync by hand on every future field addition — the mapper function is the mechanism that
makes "kept in sync" structural instead of a matter of remembering to update both spots.

### Anti-Pattern 3: Mapper reaching back into infrastructure instead of taking derived inputs as parameters

```typescript
// ❌ WRONG — mapper does I/O / re-derives instead of receiving what it needs
export async function toCreateLocalShareResult(localShare: LocalShareAggregate) {
  const pricing = await pricingAcl.getCurrentFee(localShare.category);   // ❌ mapper doing ACL calls
  return { id: localShare.getId().toString(), paymentRequired: !pricing.isZero() };
}
```

A DTO mapper is a pure, synchronous translation function — the same `AS3`/`AS6` "pure
orchestration, zero I/O" discipline that governs application services
(`application/application-service-pattern.md`) applies here at a smaller scope. Every value
the mapper needs (here, `totalListingFee`) is computed once by the handler and passed in as
a parameter — the mapper never becomes a second place that talks to pricing, the ACL
registry, or the database.
