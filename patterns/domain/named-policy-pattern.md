# Pattern: Named Policy

**Tags**: "api:domain"
**Layer**: Domain
**Level**: core
**Status**: experimental

## What This Is

The set of gates that decide "may this actor create/access this class of content" is
composed **once**, into a single named object (a `createXxxPolicy()` factory building a
`PolicyBuilder` `Policy`), and the handler calls it **exactly once**, at the point of the
action. The policy is a gate, not a router: its only observable effect on the caller is a
pass/fail verdict, and the handler's only reaction to a fail is an early `Result.fail()`
return — it never branches on *which* rule failed. Variant behavior (a different gate set
for organizations vs individuals, a different threshold per market class) is resolved
**while constructing** the policy object, never by adding an `if` around the `.check()`
call site.

## When to Use

**Use this pattern for:**
- ✅ **≥2 gates sequentially condition one class of content or action**, and the gates live
  as separate statements spread through a handler — skipping one of them on a single code
  path is easy to do and easy for review to miss, because there is no single place that
  enumerates "all the gates this action requires".
- ✅ **A named, stable anchor is needed for a `BR-*` rule id.** A rule cited from
  `BUSINESS_RULES.yaml` or a product doc needs to point at something a test actually
  exercises — a policy object is that anchor; a rule described only in prose or in a
  Specification nobody calls is not (see Anti-Pattern 2).
- ✅ **The same action needs a different gate set per actor/market class** (e.g.
  organizations exempt from a geo guardrail that individuals must pass) — construct a
  variant policy (`.forActor(marketClass)`) rather than wrapping the single `.check()` call
  in an `if`.

**Do NOT use for:**
- ❌ A single rule, one condition — a plain `CompositeSpecification` called directly is
  enough; wrapping one specification in a `PolicyBuilder` for the sake of "having a policy"
  adds a layer with nothing to compose (`domain/specification-policy-pattern.md`).
- ❌ Variant behavior chosen **per call** (`if (isOrg) { skip this check }` around
  `.check()`) — that reintroduces exactly the "gate absent on one path" failure mode this
  pattern exists to close. The variant belongs in how the policy is *built*, not in how it
  is *applied*.

## Implementation

### 1. The composed policy — one named object per class of content/action

Real production shape (`neighborhood-economy/application/booking/policies/booking-access.policy.ts`)
— two independent `BR-*`-tagged specifications, composed under one name, one `.check()`
call site expected:

```typescript
import { PolicyBuilder } from '@vytches/ddd';

import {
  SpHasBookingEntitlementSpecification,
  type SpBookingEntitlementContext,
} from '../../../domain/booking/specifications/sp-has-booking-entitlement.specification';
import {
  SpIsActiveSpecification,
  type SpIsActiveContext,
} from '../../../domain/booking/specifications/sp-is-active.specification';

export type BookingAccessContext = SpBookingEntitlementContext & SpIsActiveContext;

export function createBookingAccessPolicy() {
  return PolicyBuilder.create<BookingAccessContext>()
    .withId('booking-access')
    .withDomain('neighborhood-economy')
    .withName('Booking Access Policy')

    .must(new SpHasBookingEntitlementSpecification())   // BR-BOOKING-003
    .withCode('BOOKING_ENTITLEMENT_REQUIRED')
    .withMessage('Booking feature requires an active Pro subscription.')
    .withSeverity('ERROR')
    .and()

    .must(new SpIsActiveSpecification())                // BR-BOOKING-005
    .withCode('BOOKING_SP_NOT_ACTIVE')
    .withMessage('Service provider is not currently active.')
    .withSeverity('ERROR')

    .build();
}
```

Each `CompositeSpecification` it composes stays independently unit-testable
(`specification-policy-pattern.md`); the policy is what turns "two specs somewhere in
`domain/`" into one thing a handler can name and call.

### 2. Handler call site — ONE call, a fail is an early return, never a branch

```typescript
const accessResult = await createBookingAccessPolicy().check({
  entity: { entitlements, isActive },
  context: PolicyContextFactory.minimal(clientUserId),
});
if (accessResult.isFailure) {
  return Result.fail(this.mapPolicyViolation(accessResult.error));
}
// no further branching on WHICH rule failed — the handler proceeds uniformly from here
```

`mapPolicyViolation` maps the violation `code` to this context's own domain error class —
the same "shared mechanism, per-context translation" split as `C1`
(`application/application-service-pattern.md`). The policy itself never knows about HTTP
status codes or context-specific error classes.

### 3. Variant construction — the exemption is a visible line, not an absent call

The "organizations are exempt from the geo guardrail in `create-service-offering`"
exemption (`@founder`, 2026-08-30 — pending `BUSINESS_RULES.yaml`/BDR entry) is the
canonical example of a variant this pattern is meant to make visible instead of implicit:

```typescript
export function createServiceOfferingContentPolicy(actingAs: ActingAs) {
  const builder = PolicyBuilder.create<ServiceOfferingContentContext>()
    .withId('service-offering-content')
    .withDomain('neighborhood-economy')
    .withName('Service Offering Content Policy')
    .must(new MediaIsApprovedSpecification())
    .withCode('MEDIA_NOT_APPROVED')
    .withSeverity('ERROR')
    .and()
    .must(new WithinCapabilityQuotaSpecification())
    .withCode('QUOTA_EXCEEDED')
    .withSeverity('ERROR');

  // Variant resolved HERE, at construction — never as an `if` around `.check()` at the
  // call site. Organizations are exempt from the residence guardrail by explicit product
  // decision, not by the guardrail's absence on one code path.
  if (actingAs.type !== 'ORGANIZATION') {
    builder
      .and()
      .must(new CenterResidenceGuardrailSpecification()) // BR-GEO-CENTER-001
      .withCode('OUTSIDE_RESIDENCE_BOUNDARY')
      .withSeverity('ERROR');
  }

  return builder.build();
}
```

The call site stays identical for every actor type — one `.check()`, one early return. The
exemption is a single, named, greppable line inside the factory, not four absent call sites
across the handler.

## Anti-Patterns

### Anti-Pattern 1: A composed policy that exists but nobody calls

`createBookingAccessPolicy()` above (Implementation §1) is exported from
`neighborhood-economy/application/booking/index.ts` and is otherwise **dead code** — no
handler calls it. `create-booking/handler.ts` instead re-derives the same two `BR-*` rules
inline, against a differently-shaped object, with a comment naming the very rules the
unused policy already composes:

```typescript
// 1. Entitlement check (BR-BOOKING-003 + BR-BOOKING-005)
const snapshot = await this.spEntitlementQuery.getSnapshot(command.serviceProviderId);
if (!snapshot) {
  return Result.fail(new SpAvailabilityNotFoundError(command.serviceProviderId));
}
if (!snapshot.hasBooking) {
  return Result.fail(new BookingEntitlementRequiredError());
}
if (!snapshot.isActive) {
  return Result.fail(new SpNotActiveError(command.serviceProviderId));
}
```

This is the pattern's own motivating failure mode caught live, a second time, in the same
codebase that produced it: a composed policy with a real `BR-*` id on each rule, sitting
next to the handler it was built for, silently bypassed by two hand-rolled `if`s that check
a different-shaped snapshot instead. `BR-QJ-QUOTA-001` (cited in two
`BUSINESS_RULES.yaml` files, enforced by a specification production never calls) is the
same failure mode one layer up — a rule with no caller at all, not just an unused
composition. Neither is a hypothetical; both were found by grep, not by reading a
docstring.

### Anti-Pattern 2: Policy as router — branching on the verdict

```typescript
// ❌ WRONG — handler re-derives a decision the policy already made
const result = await policy.check({ entity, context });
if (result.isFailure) {
  if (result.error.code === 'BOOKING_ENTITLEMENT_REQUIRED') {
    return Result.fail(new BookingEntitlementRequiredError());
  }
  if (result.error.code === 'BOOKING_SP_NOT_ACTIVE') {
    return Result.fail(new SpNotActiveError(id));
  }
}
```

A policy that gets branched on this way has stopped being a gate — the handler has quietly
reimplemented the routing the `.withCode()`/error-mapper split exists to avoid. Map the
violation code to a domain error through one small `mapPolicyViolation()` function (§2), not
through a chain of `if`s reconstructing the policy's internal structure at every call site.

### Anti-Pattern 3: Skipping a variant by omission instead of by declaration

```typescript
// ❌ WRONG — the exemption lives in what's ABSENT from one branch
if (actingAs.type === 'ORGANIZATION') {
  // ...create without calling checkResidenceGuardrail at all
} else {
  await this.checkResidenceGuardrail(location);
  // ...create
}
```

The exemption exists, but nothing marks it as intentional — a reviewer (or a guardian
check, D2) sees an absent call, not a decision. This is structurally the same class of bug
as the `setTag()` omission that started this task's audit (TS-ARCH-HANDLER-CONTRACT-001
Geneza): a real product decision, expressed only as the *lack* of a call on one branch.
Implementation §3 shows the fix — the exemption becomes a visible `if` **inside the policy
factory**, so `checkResidenceGuardrail`-equivalent coverage can be verified by grepping the
policy definitions, not by re-reading every handler branch.
