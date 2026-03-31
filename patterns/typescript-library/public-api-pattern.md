# Public API Surface Management for TypeScript Libraries

**Version**: 1.0
**Created**: 2026-03-30
**Purpose**: Define explicit, type-safe public APIs for shared npm packages in Nx monorepos

---

## When to Use

- Building a shared TypeScript library consumed by multiple apps or other libraries
- You need to control which types, functions, and classes are visible to consumers
- You want to prevent internal refactors from becoming breaking changes
- The library is published to npm or used across Nx workspace boundaries

---

## Implementation

### 1. Barrel Exports -- Explicit, No Wildcards

Every library has a single `index.ts` that explicitly lists every public export. Never use wildcard re-exports (`export *`) because they leak internals and make breaking change detection impossible.

```typescript
// libs/payments/src/index.ts -- THE public API surface

// Types
export type { PaymentIntent, PaymentStatus, PaymentMethod } from './types/payment.types';
export type { RefundRequest, RefundResult } from './types/refund.types';

// Functions
export { createPaymentIntent } from './services/create-payment-intent';
export { processRefund } from './services/process-refund';
export { validatePaymentMethod } from './validation/payment-method.validator';

// Type guards
export { isPaymentComplete, isRefundable } from './guards/payment.guards';

// Constants
export { PAYMENT_STATUS, CURRENCY_CODES } from './constants/payment.constants';

// Errors
export { PaymentError, InsufficientFundsError } from './errors/payment.errors';
```

### 2. Internal vs Public Split

Separate internal implementation from the public surface. Internal modules import freely from each other but are never re-exported through `index.ts`.

```
libs/payments/src/
  index.ts                    # Public API -- only file consumers import from
  internal/
    stripe-adapter.ts         # NEVER exported -- implementation detail
    payment-state-machine.ts  # NEVER exported -- internal orchestration
    retry-logic.ts            # NEVER exported -- internal utility
  services/
    create-payment-intent.ts  # Exported function (uses internal/ freely)
    process-refund.ts         # Exported function
  types/
    payment.types.ts          # Exported types
    internal.types.ts         # NEVER exported -- internal-only types
  guards/
    payment.guards.ts         # Exported type guards
```

Enforce this with an ESLint rule:

```json
{
  "@nx/enforce-module-boundaries": [
    "error",
    {
      "allow": [],
      "depConstraints": [
        {
          "sourceTag": "scope:payments",
          "onlyDependOnLibsWithTags": ["scope:shared", "scope:contracts"]
        }
      ]
    }
  ]
}
```

### 3. Branded Types for Consumer Safety

Use branded types to prevent consumers from accidentally passing raw primitives where domain-specific identifiers are expected.

```typescript
// types/payment.types.ts
declare const __brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type PaymentId = Brand<string, 'PaymentId'>;
export type CurrencyCode = Brand<string, 'CurrencyCode'>;
export type AmountInCents = Brand<number, 'AmountInCents'>;

export interface PaymentIntent {
  readonly id: PaymentId;
  readonly amount: AmountInCents;
  readonly currency: CurrencyCode;
  readonly status: PaymentStatus;
  readonly createdAt: Date;
}

// Factory functions -- the ONLY way consumers create branded values
export function paymentId(raw: string): PaymentId {
  if (!raw.startsWith('pi_')) {
    throw new Error(`Invalid payment ID format: ${raw}`);
  }
  return raw as PaymentId;
}

export function amountInCents(raw: number): AmountInCents {
  if (!Number.isInteger(raw) || raw < 0) {
    throw new Error(`Amount must be a non-negative integer, got: ${raw}`);
  }
  return raw as AmountInCents;
}
```

### 4. Type Guards for Runtime Narrowing

Export type guards so consumers can safely narrow union types without coupling to internal logic.

```typescript
// guards/payment.guards.ts
import type { PaymentIntent, PaymentStatus } from '../types/payment.types';

export function isPaymentComplete(
  intent: PaymentIntent
): intent is PaymentIntent & { status: 'completed' } {
  return intent.status === 'completed';
}

export function isRefundable(
  intent: PaymentIntent
): intent is PaymentIntent & { status: 'completed' | 'partially_refunded' } {
  return intent.status === 'completed' || intent.status === 'partially_refunded';
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return (
    typeof value === 'string' &&
    ['pending', 'processing', 'completed', 'failed', 'cancelled'].includes(value)
  );
}
```

### 5. Overload Signatures for Flexible APIs

Use overloads to provide flexible call signatures while keeping the implementation type-safe.

```typescript
// services/create-payment-intent.ts
import type { PaymentIntent, AmountInCents, CurrencyCode } from '../types/payment.types';

interface CreatePaymentOptions {
  amount: AmountInCents;
  currency: CurrencyCode;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

// Overload 1: full options object
export function createPaymentIntent(
  options: CreatePaymentOptions
): Promise<PaymentIntent>;

// Overload 2: shorthand for common case
export function createPaymentIntent(
  amount: AmountInCents,
  currency: CurrencyCode
): Promise<PaymentIntent>;

// Implementation (not visible to consumers in .d.ts)
export function createPaymentIntent(
  amountOrOptions: AmountInCents | CreatePaymentOptions,
  currency?: CurrencyCode
): Promise<PaymentIntent> {
  const options: CreatePaymentOptions =
    typeof amountOrOptions === 'object'
      ? amountOrOptions
      : { amount: amountOrOptions, currency: currency! };

  return processPaymentIntentCreation(options);
}
```

### 6. Deprecation Pattern

Mark deprecated APIs with JSDoc `@deprecated` (for IDE hints) and a runtime warning (for those who miss the types).

```typescript
// services/process-refund.ts
import type { RefundRequest, RefundResult } from '../types/refund.types';

let deprecationWarned = false;

/**
 * @deprecated Since v2.3.0. Use `processRefundV2()` instead.
 * Will be removed in v3.0.0.
 *
 * Migration: Replace `processRefund(id, amount)` with
 * `processRefundV2({ paymentId: id, amount, reason: 'requested_by_customer' })`
 */
export function processRefund(
  paymentId: string,
  amount: number
): Promise<RefundResult> {
  if (!deprecationWarned) {
    console.warn(
      '[payments] processRefund() is deprecated since v2.3.0. ' +
      'Use processRefundV2() instead. Will be removed in v3.0.0.'
    );
    deprecationWarned = true;
  }

  return processRefundV2({
    paymentId: paymentId as any,
    amount: amount as any,
    reason: 'requested_by_customer',
  });
}

/** Current API -- use this instead of processRefund() */
export function processRefundV2(request: RefundRequest): Promise<RefundResult> {
  // implementation
}
```

---

## Key Rules

1. **Every public export is intentional** -- if it is in `index.ts`, it is part of your API contract
2. **No wildcard re-exports** -- `export * from './module'` leaks internals and breaks tree-shaking analysis
3. **Branded types over raw primitives** -- prevent `string` vs `PaymentId` mix-ups at compile time
4. **Type guards are part of the API** -- consumers should not need `as` casts or internal knowledge
5. **Deprecation is a two-phase process** -- JSDoc `@deprecated` for types, `console.warn` for runtime
6. **Internal directory is sacred** -- nothing in `internal/` ever appears in `index.ts`

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| `export * from './services'` | Leaks every function, including internal helpers | Explicit named exports in `index.ts` |
| Exporting concrete classes | Couples consumers to implementation | Export interfaces + factory functions |
| Raw `string` for IDs | `userId` and `paymentId` become interchangeable | Branded types with factory functions |
| Removing deprecated API in minor | Breaks semver contract | Remove only in next major version |
| `@internal` JSDoc without enforcement | Nothing stops consumers from importing it | Separate `internal/` directory + barrel exports |
| Exporting mutable objects | Consumers can mutate shared state | Export `readonly` types, freeze objects |
