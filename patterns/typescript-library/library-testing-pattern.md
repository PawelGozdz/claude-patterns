# Library Testing Pattern for TypeScript Packages

**Version**: 1.0
**Created**: 2026-03-30
**Purpose**: Testing strategies specific to shared npm libraries -- contract tests, export validation, type tests, and property-based testing

---

## When to Use

- You maintain a shared TypeScript library consumed by other packages
- You need to guarantee the public API contract does not break silently
- You want compile-time type assertion tests (not just runtime)
- You have generic utilities that need exhaustive input coverage
- You need to verify the library works in both ESM and CJS environments

---

## Implementation

### 1. Contract Testing -- Public API Behavior Verification

Contract tests verify that the public API behaves as documented. They test the library the same way a consumer would use it -- importing only from the barrel export.

```typescript
// libs/payments/src/__tests__/contract/create-payment.contract.spec.ts
import { describe, it, expect } from 'vitest';

// IMPORTANT: Always import from the barrel, never from internal paths
import {
  createPaymentIntent,
  paymentId,
  amountInCents,
  currencyCode,
  isPaymentComplete,
  PaymentError,
} from '@scope/payments';

describe('createPaymentIntent contract', () => {
  it('accepts the full options object signature', async () => {
    const intent = await createPaymentIntent({
      amount: amountInCents(1999),
      currency: currencyCode('USD'),
      metadata: { orderId: 'order-123' },
    });

    expect(intent).toMatchObject({
      amount: 1999,
      currency: 'USD',
      status: 'pending',
    });
    expect(intent.id).toBeDefined();
    expect(intent.createdAt).toBeInstanceOf(Date);
  });

  it('accepts the shorthand two-argument signature', async () => {
    const intent = await createPaymentIntent(
      amountInCents(500),
      currencyCode('EUR')
    );

    expect(intent.amount).toBe(500);
    expect(intent.currency).toBe('EUR');
  });

  it('rejects invalid amounts with PaymentError', async () => {
    await expect(
      createPaymentIntent({
        amount: amountInCents(0),
        currency: currencyCode('USD'),
      })
    ).rejects.toThrow(PaymentError);
  });

  it('type guard narrows completed payments', async () => {
    const intent = await createPaymentIntent({
      amount: amountInCents(1000),
      currency: currencyCode('USD'),
    });

    // Simulating a completed payment
    const completed = { ...intent, status: 'completed' as const };

    if (isPaymentComplete(completed)) {
      // TypeScript narrows to { status: 'completed' } here
      expect(completed.status).toBe('completed');
    }
  });
});
```

### 2. Export Validation Testing

Verify that every declared export actually exists, is the right type, and is accessible. This catches accidental removal of exports during refactoring.

```typescript
// libs/payments/src/__tests__/exports.spec.ts
import { describe, it, expect } from 'vitest';
import * as PaymentsLib from '@scope/payments';

describe('@scope/payments exports', () => {
  const expectedExports = {
    // Functions
    createPaymentIntent: 'function',
    processRefund: 'function',
    processRefundV2: 'function',
    validatePaymentMethod: 'function',

    // Type guards (are functions at runtime)
    isPaymentComplete: 'function',
    isRefundable: 'function',
    isPaymentStatus: 'function',

    // Branded type factories
    paymentId: 'function',
    amountInCents: 'function',
    currencyCode: 'function',

    // Constants
    PAYMENT_STATUS: 'object',
    CURRENCY_CODES: 'object',

    // Error classes
    PaymentError: 'function',
    InsufficientFundsError: 'function',
  } as const;

  it.each(Object.entries(expectedExports))(
    'exports %s as %s',
    (name, expectedType) => {
      const exported = (PaymentsLib as Record<string, unknown>)[name];
      expect(exported).toBeDefined();
      expect(typeof exported).toBe(expectedType);
    }
  );

  it('does not export internal implementation details', () => {
    const publicKeys = Object.keys(PaymentsLib);

    // These internal modules must never appear in the public API
    const internalNames = [
      'StripeAdapter',
      'PaymentStateMachine',
      'calculateFees',
      'retryWithBackoff',
      'INTERNAL_CONFIG',
    ];

    for (const name of internalNames) {
      expect(publicKeys).not.toContain(name);
    }
  });

  it('has no unexpected exports (snapshot)', () => {
    const publicKeys = Object.keys(PaymentsLib).sort();
    expect(publicKeys).toMatchSnapshot();
  });
});
```

### 3. Type Testing with expect-type

Use `expect-type` (or `tsd`) to write compile-time assertions about your library's types. These tests fail at type-check time, not runtime.

```typescript
// libs/payments/src/__tests__/types/payment.type-test.ts
import { expectTypeOf } from 'expect-type';
import type {
  PaymentIntent,
  PaymentId,
  PaymentStatus,
  AmountInCents,
  CurrencyCode,
} from '@scope/payments';
import {
  createPaymentIntent,
  paymentId,
  amountInCents,
  isPaymentComplete,
} from '@scope/payments';

// Branded types are NOT assignable from raw primitives
expectTypeOf<string>().not.toMatchTypeOf<PaymentId>();
expectTypeOf<number>().not.toMatchTypeOf<AmountInCents>();

// Factory functions return branded types
expectTypeOf(paymentId('pi_123')).toEqualTypeOf<PaymentId>();
expectTypeOf(amountInCents(100)).toEqualTypeOf<AmountInCents>();

// createPaymentIntent returns Promise<PaymentIntent>
expectTypeOf(createPaymentIntent).returns.toEqualTypeOf<Promise<PaymentIntent>>();

// PaymentIntent has required properties
expectTypeOf<PaymentIntent>().toHaveProperty('id');
expectTypeOf<PaymentIntent>().toHaveProperty('amount');
expectTypeOf<PaymentIntent>().toHaveProperty('currency');
expectTypeOf<PaymentIntent>().toHaveProperty('status');
expectTypeOf<PaymentIntent>().toHaveProperty('createdAt');

// PaymentId is assignable to string (structural subtype)
expectTypeOf<PaymentId>().toMatchTypeOf<string>();

// PaymentStatus includes expected members
expectTypeOf<'pending'>().toMatchTypeOf<PaymentStatus>();
expectTypeOf<'completed'>().toMatchTypeOf<PaymentStatus>();
expectTypeOf<'failed'>().toMatchTypeOf<PaymentStatus>();

// Invalid status is NOT assignable
expectTypeOf<'invalid_status'>().not.toMatchTypeOf<PaymentStatus>();

// Type guard narrows correctly
declare const intent: PaymentIntent;
if (isPaymentComplete(intent)) {
  expectTypeOf(intent.status).toEqualTypeOf<'completed'>();
}

// Overload: accepts both signatures
expectTypeOf(createPaymentIntent).toBeCallableWith({
  amount: amountInCents(100),
  currency: {} as CurrencyCode,
});
```

### 4. Property-Based Testing with fast-check

Use property-based testing for generic utility functions where you need to verify invariants across a wide range of inputs.

```typescript
// libs/shared-utils/src/__tests__/property/money.property.spec.ts
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Money } from '@scope/shared-utils';

describe('Money value object properties', () => {
  const validAmount = fc.integer({ min: 0, max: 999_999_999 });
  const validCurrency = fc.constantFrom('USD', 'EUR', 'GBP', 'JPY');

  it('addition is commutative: a + b === b + a', () => {
    fc.assert(
      fc.property(
        validAmount,
        validAmount,
        validCurrency,
        (a, b, currency) => {
          const moneyA = Money.fromCents(a, currency);
          const moneyB = Money.fromCents(b, currency);

          const resultAB = moneyA.add(moneyB);
          const resultBA = moneyB.add(moneyA);

          expect(resultAB.cents).toBe(resultBA.cents);
        }
      )
    );
  });

  it('addition is associative: (a + b) + c === a + (b + c)', () => {
    fc.assert(
      fc.property(
        validAmount,
        validAmount,
        validAmount,
        validCurrency,
        (a, b, c, currency) => {
          const ma = Money.fromCents(a, currency);
          const mb = Money.fromCents(b, currency);
          const mc = Money.fromCents(c, currency);

          const left = ma.add(mb).add(mc);
          const right = ma.add(mb.add(mc));

          expect(left.cents).toBe(right.cents);
        }
      )
    );
  });

  it('zero is the identity element: a + 0 === a', () => {
    fc.assert(
      fc.property(validAmount, validCurrency, (a, currency) => {
        const money = Money.fromCents(a, currency);
        const zero = Money.fromCents(0, currency);

        expect(money.add(zero).cents).toBe(money.cents);
      })
    );
  });

  it('multiplication distributes: a * (x + y) === a*x + a*y', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        validCurrency,
        (amount, x, y, currency) => {
          const money = Money.fromCents(amount, currency);

          const left = money.multiply(x + y);
          const right = money.multiply(x).add(money.multiply(y));

          expect(left.cents).toBe(right.cents);
        }
      )
    );
  });

  it('cannot mix currencies', () => {
    fc.assert(
      fc.property(validAmount, validAmount, (a, b) => {
        const usd = Money.fromCents(a, 'USD');
        const eur = Money.fromCents(b, 'EUR');

        expect(() => usd.add(eur)).toThrow('Currency mismatch');
      })
    );
  });
});
```

### 5. Cross-Version Compatibility Testing

Verify that serialized data from older versions can be deserialized by the current version.

```typescript
// libs/payments/src/__tests__/compat/v2-compat.spec.ts
import { describe, it, expect } from 'vitest';
import { deserializePaymentIntent } from '@scope/payments';

// Fixtures captured from v2.x serialized output
const V2_FIXTURES = {
  basic: {
    id: 'pi_abc123',
    amount: 1999,
    currency: 'USD',
    status: 'completed',
    created_at: '2025-06-15T10:30:00.000Z',
    // v2 did not have 'metadata' field
    // v2 used snake_case for created_at
  },
  withLegacyStatus: {
    id: 'pi_def456',
    amount: 500,
    currency: 'EUR',
    status: 'succeeded',  // v2 used 'succeeded', v3 uses 'completed'
    created_at: '2025-07-20T14:00:00.000Z',
  },
};

describe('v2 backward compatibility', () => {
  it('deserializes v2 payment without metadata', () => {
    const result = deserializePaymentIntent(V2_FIXTURES.basic);

    expect(result.id).toBe('pi_abc123');
    expect(result.metadata).toEqual({});  // default for missing field
    expect(result.createdAt).toBeInstanceOf(Date);  // converted from snake_case
  });

  it('maps legacy status values to current enum', () => {
    const result = deserializePaymentIntent(V2_FIXTURES.withLegacyStatus);

    expect(result.status).toBe('completed');  // 'succeeded' mapped to 'completed'
  });
});
```

### 6. Bundle Testing -- CJS and ESM

Verify that the built library can be imported in both module systems.

```typescript
// libs/payments/src/__tests__/bundle/module-compat.spec.ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEMP_DIR = join(__dirname, '.tmp-bundle-test');
const DIST_PATH = join(__dirname, '../../../../dist/libs/payments');

describe('bundle compatibility', () => {
  beforeAll(() => {
    mkdirSync(TEMP_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEMP_DIR, { recursive: true, force: true });
  });

  it('can be required as CommonJS', () => {
    const testFile = join(TEMP_DIR, 'test-cjs.cjs');
    writeFileSync(
      testFile,
      `
      const payments = require('${DIST_PATH}/cjs/index.cjs');
      if (typeof payments.createPaymentIntent !== 'function') {
        process.exit(1);
      }
      console.log('CJS OK');
      `
    );

    const output = execSync(`node ${testFile}`, { encoding: 'utf-8' });
    expect(output.trim()).toBe('CJS OK');
  });

  it('can be imported as ESM', () => {
    const testFile = join(TEMP_DIR, 'test-esm.mjs');
    writeFileSync(
      testFile,
      `
      import { createPaymentIntent } from '${DIST_PATH}/esm/index.mjs';
      if (typeof createPaymentIntent !== 'function') {
        process.exit(1);
      }
      console.log('ESM OK');
      `
    );

    const output = execSync(`node ${testFile}`, { encoding: 'utf-8' });
    expect(output.trim()).toBe('ESM OK');
  });

  it('TypeScript declarations are present', () => {
    const output = execSync(`ls ${DIST_PATH}/types/index.d.ts`, {
      encoding: 'utf-8',
    });
    expect(output.trim()).toContain('index.d.ts');
  });
});
```

---

## Key Rules

1. **Contract tests import from the barrel only** -- test the library the way consumers use it
2. **Export tests are a safety net** -- snapshot all public exports, catch accidental removals in CI
3. **Type tests run at compile time** -- use `expect-type` or `tsd`, not runtime assertions for types
4. **Property-based tests cover invariants** -- use for value objects, pure functions, serialization
5. **Compatibility fixtures are immutable** -- once captured from a version, never modify them
6. **Bundle tests run against dist output** -- verify the built artifacts, not the source

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| Importing from `../internal/state-machine` in tests | Tests pass but consumers cannot access that path | Always import from `@scope/package-name` |
| Testing types with `as any` casts | Bypasses the type system entirely | Use `expect-type` for compile-time assertions |
| Only testing happy path in contract tests | Error handling is part of the contract too | Test error types, error messages, edge cases |
| Mocking the library's own internals | Tests become tautological | Mock external dependencies only (DB, HTTP) |
| Skipping bundle tests | Library works in dev but fails when consumed | Test CJS, ESM, and .d.ts in CI after build |
| Property tests with unbounded generators | Tests timeout or hit edge cases unrelated to logic | Constrain generators to valid input ranges |
