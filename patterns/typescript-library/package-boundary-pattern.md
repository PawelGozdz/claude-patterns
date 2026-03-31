# Package Boundary Pattern for Nx Monorepos

**Version**: 1.0
**Created**: 2026-03-30
**Purpose**: Enforce clean package boundaries, dependency rules, and module isolation in Nx workspaces

---

## When to Use

- You have multiple TypeScript libraries in an Nx monorepo
- Teams own different packages and you need to prevent uncontrolled coupling
- You need to share types across packages without creating circular dependencies
- You want to enforce an acyclic dependency graph at build time

---

## Implementation

### 1. Package Dependency Rules -- Acyclic Graph

Every package in the monorepo must fit into a layered dependency graph. Higher layers depend on lower layers, never the reverse.

```
┌──────────────────────────────┐
│  apps/web, apps/api          │  Applications (consume libraries)
├──────────────────────────────┤
│  libs/features/*             │  Feature libraries (orchestrate domain)
├──────────────────────────────┤
│  libs/domain/*               │  Domain libraries (business logic)
├──────────────────────────────┤
│  libs/infrastructure/*       │  Infrastructure (adapters, clients)
├──────────────────────────────┤
│  libs/contracts              │  Shared contracts (types, interfaces)
├──────────────────────────────┤
│  libs/shared/*               │  Shared utilities (pure functions)
└──────────────────────────────┘
```

Enforce with Nx tags in each library's `project.json`:

```json
// libs/domain/payments/project.json
{
  "name": "@scope/domain-payments",
  "tags": ["scope:payments", "type:domain"],
  "targets": {
    "build": {
      "executor": "@nx/js:tsc",
      "options": {
        "outputPath": "dist/libs/domain/payments",
        "main": "libs/domain/payments/src/index.ts",
        "tsConfig": "libs/domain/payments/tsconfig.lib.json"
      }
    },
    "test": {
      "executor": "@nx/vite:test",
      "options": {
        "config": "libs/domain/payments/vitest.config.ts"
      }
    }
  }
}
```

Define allowed dependency rules in `.eslintrc.json` at the workspace root:

```json
{
  "overrides": [
    {
      "files": ["*.ts"],
      "rules": {
        "@nx/enforce-module-boundaries": [
          "error",
          {
            "enforceBuildableLibDependency": true,
            "allow": [],
            "depConstraints": [
              {
                "sourceTag": "type:app",
                "onlyDependOnLibsWithTags": ["type:feature", "type:domain", "type:infra", "type:contracts", "type:shared"]
              },
              {
                "sourceTag": "type:feature",
                "onlyDependOnLibsWithTags": ["type:domain", "type:infra", "type:contracts", "type:shared"]
              },
              {
                "sourceTag": "type:domain",
                "onlyDependOnLibsWithTags": ["type:contracts", "type:shared"]
              },
              {
                "sourceTag": "type:infra",
                "onlyDependOnLibsWithTags": ["type:contracts", "type:shared"]
              },
              {
                "sourceTag": "type:contracts",
                "onlyDependOnLibsWithTags": ["type:shared"]
              },
              {
                "sourceTag": "type:shared",
                "onlyDependOnLibsWithTags": ["type:shared"]
              }
            ]
          }
        ]
      }
    }
  ]
}
```

### 2. Shared Contracts Package

Create a dedicated contracts package that holds cross-package types. This is the only package that domain libraries can share types through.

```typescript
// libs/contracts/src/index.ts
// -- Payment contracts
export type { PaymentId, PaymentIntent, PaymentStatus } from './payment/payment.types';
export type { RefundRequest, RefundResult } from './payment/refund.types';

// -- User contracts
export type { UserId, UserProfile, UserRole } from './user/user.types';

// -- Shared events (cross-domain)
export type { DomainEvent, EventMetadata } from './events/domain-event.types';
export type { PaymentCompletedEvent } from './events/payment.events';
export type { UserRegisteredEvent } from './events/user.events';

// -- Shared value objects
export { Money } from './value-objects/money';
export { EmailAddress } from './value-objects/email-address';
```

Rules for the contracts package:
- **Types and interfaces only** (plus simple value objects)
- **No implementation logic** -- no services, no adapters, no database access
- **No external dependencies** -- contracts depend on nothing except TypeScript itself
- **Append-only in minor versions** -- removing types is a major change

### 3. Internal vs External Exports

Each library has two boundaries: what it exports to the monorepo, and what stays internal.

```typescript
// libs/domain/payments/src/index.ts  -- PUBLIC API
export type { PaymentAggregate } from './aggregates/payment.aggregate';
export { createPayment } from './commands/create-payment';
export { PaymentPolicy } from './policies/payment.policy';

// libs/domain/payments/src/internal/index.ts  -- INTERNAL ONLY
// This file is NEVER re-exported from the top-level index.ts
export { PaymentStateMachine } from './state-machine';
export { calculateFees } from './fee-calculator';
export { validatePaymentRules } from './rule-engine';
```

Enforce with `package.json` exports field:

```json
// libs/domain/payments/package.json
{
  "name": "@scope/domain-payments",
  "version": "2.1.0",
  "exports": {
    ".": {
      "import": "./src/index.ts",
      "types": "./src/index.ts"
    }
  },
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

No `./internal` path is exposed, so other packages physically cannot import internal modules through the package name.

### 4. Dependency Injection Across Packages

When a higher-layer package needs functionality from a lower layer, use dependency injection to avoid coupling to concrete implementations.

```typescript
// libs/contracts/src/ports/payment-gateway.port.ts
export interface PaymentGateway {
  charge(amount: Money, method: PaymentMethod): Promise<PaymentResult>;
  refund(paymentId: PaymentId, amount: Money): Promise<RefundResult>;
}

// libs/domain/payments/src/commands/create-payment.ts
// Domain depends on the PORT (interface), not the adapter
import type { PaymentGateway } from '@scope/contracts';
import type { Money } from '@scope/contracts';

export function createPaymentHandler(gateway: PaymentGateway) {
  return async (amount: Money, method: PaymentMethod): Promise<PaymentIntent> => {
    // Domain logic here -- no knowledge of Stripe, PayPal, etc.
    const result = await gateway.charge(amount, method);
    return mapToPaymentIntent(result);
  };
}

// libs/infrastructure/stripe/src/stripe-gateway.ts
// Infrastructure implements the port
import type { PaymentGateway } from '@scope/contracts';
import Stripe from 'stripe';

export class StripeGateway implements PaymentGateway {
  constructor(private readonly stripe: Stripe) {}

  async charge(amount: Money, method: PaymentMethod): Promise<PaymentResult> {
    const intent = await this.stripe.paymentIntents.create({
      amount: amount.cents,
      currency: amount.currency,
    });
    return mapStripeResult(intent);
  }

  async refund(paymentId: PaymentId, amount: Money): Promise<RefundResult> {
    const refund = await this.stripe.refunds.create({
      payment_intent: paymentId,
      amount: amount.cents,
    });
    return mapStripeRefund(refund);
  }
}

// apps/api/src/modules/payment.module.ts
// App wires concrete to abstract
import { StripeGateway } from '@scope/infra-stripe';
import { createPaymentHandler } from '@scope/domain-payments';

const gateway = new StripeGateway(stripeClient);
const handleCreatePayment = createPaymentHandler(gateway);
```

### 5. Circular Dependency Prevention

Circular dependencies are the most common monorepo failure mode. Prevent them with these strategies:

**Strategy A: Extract shared types to contracts**

```
BEFORE (circular):
  @scope/domain-users -> imports UserPaymentHistory from @scope/domain-payments
  @scope/domain-payments -> imports UserId from @scope/domain-users

AFTER (acyclic):
  @scope/domain-users -> imports UserId, UserPaymentHistory from @scope/contracts
  @scope/domain-payments -> imports UserId from @scope/contracts
  @scope/contracts -> depends on nothing
```

**Strategy B: Event-driven decoupling**

```typescript
// Instead of direct imports between domain packages, use events

// libs/domain/payments/src/events/payment-completed.event.ts
import type { DomainEvent, PaymentId, UserId } from '@scope/contracts';

export interface PaymentCompletedEvent extends DomainEvent {
  type: 'payment.completed';
  payload: {
    paymentId: PaymentId;
    userId: UserId;
    amount: number;
  };
}

// libs/domain/users/src/handlers/on-payment-completed.handler.ts
// Users package handles the event -- no import from payments package
import type { PaymentCompletedEvent } from '@scope/contracts';

export function onPaymentCompleted(event: PaymentCompletedEvent): void {
  // Update user's payment history using only the event data
}
```

### 6. Package Scope Conventions

```
@scope/contracts          -- shared types, interfaces, events
@scope/shared-utils       -- pure utility functions
@scope/domain-payments    -- payment domain logic
@scope/domain-users       -- user domain logic
@scope/infra-stripe       -- Stripe adapter
@scope/infra-postgres     -- database adapter
@scope/feature-checkout   -- checkout feature (orchestrates domain + infra)
```

---

## Key Rules

1. **Dependencies flow downward only** -- apps depend on features, features on domain, domain on contracts
2. **Contracts package has zero dependencies** -- it is the leaf node of the graph
3. **No cross-domain direct imports** -- use contracts or events to communicate
4. **Internal modules are never re-exported** -- enforce via `package.json` exports field
5. **Nx tags enforce boundaries at lint time** -- CI fails if boundaries are violated
6. **Circular dependencies are always resolvable** -- extract to contracts or use events

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| Domain package imports from infrastructure | Inverts dependency direction, couples logic to adapters | Define port in contracts, implement in infra |
| Shared "utils" package that grows unbounded | Becomes a dependency magnet, everything depends on it | Split into focused packages (shared-date, shared-validation) |
| Two domain packages importing from each other | Circular dependency breaks builds and reasoning | Extract shared types to contracts, use events |
| `paths` aliases that bypass package boundaries | ESLint cannot catch the violation | Always import via `@scope/package-name` |
| Single `types.ts` file for entire monorepo | Every package depends on it, any change triggers full rebuild | Scope types to their owning package or contracts |
| Importing from `dist/` paths | Fragile, breaks on build config changes | Always import from package entry point |
