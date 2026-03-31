# Backward Compatibility Pattern for TypeScript Libraries

**Version**: 1.0
**Created**: 2026-03-30
**Purpose**: Maintain backward compatibility in shared npm packages across semver lifecycle

---

## When to Use

- You maintain a shared library consumed by multiple teams or applications
- You need to evolve APIs without breaking existing consumers
- You are planning a major version bump and need a migration path
- You want to add features to existing interfaces without forcing updates

---

## Implementation

### 1. Semver Rules -- Non-Negotiable

Every change to a shared library must follow strict semver:

```
MAJOR (3.0.0) -- Breaking changes. Consumer code WILL break.
MINOR (2.1.0) -- New features. Consumer code WILL NOT break.
PATCH (2.0.1) -- Bug fixes. Consumer code WILL NOT break.
```

Decision tree for every PR:

```typescript
// Does any existing consumer code stop compiling or behave differently?
//   YES -> MAJOR
//   NO  -> Does the change add new functionality?
//     YES -> MINOR
//     NO  -> PATCH
```

### 2. Adding Optional Parameters to Existing Functions

When extending a function signature, always add parameters as optional with sensible defaults. Never change the position or type of existing parameters.

```typescript
// v1.0.0 -- original API
export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}

// v1.1.0 -- extended with optional params (MINOR bump)
export interface FormatCurrencyOptions {
  locale?: string;
  showSymbol?: boolean;
  minimumFractionDigits?: number;
}

export function formatCurrency(
  amount: number,
  currency: string,
  options?: FormatCurrencyOptions     // <-- optional, defaults applied
): string {
  const {
    locale = 'en-US',
    showSymbol = true,
    minimumFractionDigits = 2,
  } = options ?? {};

  return new Intl.NumberFormat(locale, {
    style: showSymbol ? 'currency' : 'decimal',
    currency,
    minimumFractionDigits,
  }).format(amount / 100);
}

// All existing calls still work:
// formatCurrency(1999, 'USD') -> "$19.99"
// New calls get extra features:
// formatCurrency(1999, 'EUR', { locale: 'de-DE' }) -> "19,99 €"
```

### 3. Extending Interfaces Without Breaking

Use intersection types and `Partial` to extend existing interfaces. Never remove or narrow existing properties.

```typescript
// v1.0.0 -- original interface
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
}

// v1.1.0 -- SAFE extension (MINOR bump)
// Strategy: add optional properties only
export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;          // <-- added as optional
  preferences?: UserPreferences; // <-- added as optional
}

// NEVER DO THIS in a minor:
// - Remove a property
// - Make an optional property required
// - Change a property type from string to string | number
// - Narrow a union type (e.g., 'a' | 'b' | 'c' -> 'a' | 'b')
```

When you need a fundamentally different shape, create a new interface:

```typescript
// v1.2.0 -- new interface alongside old one
export interface UserProfileV2 extends UserProfile {
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Provide a converter
export function toUserProfileV2(
  profile: UserProfile,
  defaults?: Partial<Omit<UserProfileV2, keyof UserProfile>>
): UserProfileV2 {
  return {
    ...profile,
    metadata: defaults?.metadata ?? {},
    createdAt: defaults?.createdAt ?? new Date(),
    updatedAt: defaults?.updatedAt ?? new Date(),
  };
}
```

### 4. Deprecation Workflow: Mark, Warn, Remove

A three-phase deprecation process across major versions:

```typescript
// === PHASE 1: Mark (v2.3.0 - MINOR) ===
// Add @deprecated JSDoc + runtime warning. Old API still works perfectly.

let warned = false;

/**
 * @deprecated Since v2.3.0. Use `createUser()` instead.
 * Will be removed in v3.0.0.
 *
 * Migration guide:
 * ```
 * // Before:
 * const user = await registerUser('john@example.com', 'John');
 *
 * // After:
 * const user = await createUser({
 *   email: 'john@example.com',
 *   displayName: 'John',
 *   role: 'member',
 * });
 * ```
 */
export async function registerUser(
  email: string,
  displayName: string
): Promise<UserProfile> {
  if (!warned) {
    console.warn(
      '[user-service] registerUser() is deprecated since v2.3.0. ' +
      'Use createUser() instead. Removal planned for v3.0.0.'
    );
    warned = true;
  }
  return createUser({ email, displayName, role: 'member' });
}

// === PHASE 2: Loud Warning (v2.5.0 - MINOR) ===
// Increase warning frequency if adoption of new API is low.
// Optionally warn every call (not just first) in development.
export async function registerUser(
  email: string,
  displayName: string
): Promise<UserProfile> {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[user-service] DEPRECATION: registerUser() will be removed in v3.0.0. ' +
      'Migrate to createUser() now. See migration guide in CHANGELOG.md.'
    );
  }
  return createUser({ email, displayName, role: 'member' });
}

// === PHASE 3: Remove (v3.0.0 - MAJOR) ===
// Delete registerUser entirely. It no longer exists in index.ts.
// CHANGELOG documents the removal and links to the migration guide.
```

### 5. Type-Level Backward Compatibility

Never narrow existing types in a minor or patch release. You can widen (add to unions, make required props optional), but never narrow.

```typescript
// v1.0.0
export type PaymentStatus = 'pending' | 'completed' | 'failed';

// v1.1.0 -- SAFE: widening the union (MINOR)
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

// BREAKING (requires MAJOR):
// Removing 'failed' from the union
// Changing from string literal union to enum
// Making a generic parameter more restrictive

// v1.0.0
export type EventHandler<T = unknown> = (event: T) => void;

// v1.1.0 -- SAFE: T still defaults to unknown
export type EventHandler<T = unknown> = (event: T) => void | Promise<void>;

// BREAKING (requires MAJOR):
// Changing default from unknown to a specific type
// Adding a required second generic parameter
```

### 6. Migration Helpers for Breaking Changes

When a major version is unavoidable, ship migration utilities alongside the new version.

```typescript
// libs/payments/src/migration/v2-to-v3.ts
import type { PaymentIntentV2 } from '../legacy/v2.types';
import type { PaymentIntent } from '../types/payment.types';

/**
 * Migrate a v2 PaymentIntent to v3 format.
 * Use this when upgrading from @scope/payments@2.x to @scope/payments@3.x.
 *
 * Changes in v3:
 * - `amount` is now AmountInCents (branded number) instead of raw number
 * - `status` uses new PaymentStatus union (added 'cancelled', 'refunded')
 * - `metadata` is now required (defaults to empty object)
 */
export function migratePaymentIntentV2toV3(
  legacy: PaymentIntentV2
): PaymentIntent {
  return {
    id: paymentId(legacy.id),
    amount: amountInCents(legacy.amount),
    currency: currencyCode(legacy.currency),
    status: legacy.status as PaymentStatus,
    metadata: legacy.metadata ?? {},
    createdAt: legacy.createdAt,
    updatedAt: legacy.updatedAt ?? legacy.createdAt,
  };
}

/**
 * Batch migration for arrays of payment intents.
 * Logs warnings for any items that fail migration.
 */
export function migratePaymentIntentsV2toV3(
  legacyItems: PaymentIntentV2[]
): { migrated: PaymentIntent[]; errors: Array<{ item: PaymentIntentV2; error: Error }> } {
  const migrated: PaymentIntent[] = [];
  const errors: Array<{ item: PaymentIntentV2; error: Error }> = [];

  for (const item of legacyItems) {
    try {
      migrated.push(migratePaymentIntentV2toV3(item));
    } catch (error) {
      errors.push({ item, error: error as Error });
    }
  }

  return { migrated, errors };
}
```

### 7. Codemods for Automated Migration

For large-scale breaking changes, provide a codemod that consumers can run:

```typescript
// tools/codemods/v2-to-v3.ts (shipped as a separate package or script)
import type { API, FileInfo } from 'jscodeshift';

export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift;
  const root = j(file.source);

  // Rename: registerUser(...) -> createUser({ ... })
  root
    .find(j.CallExpression, {
      callee: { name: 'registerUser' },
    })
    .forEach((path) => {
      const [emailArg, nameArg] = path.node.arguments;
      path.replace(
        j.callExpression(j.identifier('createUser'), [
          j.objectExpression([
            j.property('init', j.identifier('email'), emailArg as any),
            j.property('init', j.identifier('displayName'), nameArg as any),
            j.property('init', j.identifier('role'), j.literal('member')),
          ]),
        ])
      );
    });

  return root.toSource({ quote: 'single' });
}
```

---

## Key Rules

1. **Semver is a contract, not a suggestion** -- every consumer relies on it for safe upgrades
2. **New parameters are always optional** -- provide defaults, never change existing parameter order
3. **Interfaces grow, they never shrink** -- add optional properties, never remove or require existing ones
4. **Deprecation has three phases** -- mark, warn louder, remove in next major only
5. **Type widening is safe, narrowing is breaking** -- adding union members is fine, removing them is major
6. **Migration helpers ship with the breaking version** -- consumers should never have to guess the mapping
7. **Codemods for non-trivial migrations** -- if more than 10 call sites would change, automate it

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| Removing a function in a minor release | Breaks all consumers on `npm update` | Deprecate in minor, remove in major |
| Adding required properties to interfaces | Existing spread/destructure code breaks | Add as optional with defaults |
| Changing return types in patch | Consumers type-checking against old shape fail | New return type = minor (widen) or major (narrow) |
| Deprecation without migration path | Consumers know what is wrong but not how to fix it | Always document the replacement and provide examples |
| `@deprecated` JSDoc without runtime warning | Many consumers do not use IDE type checking | Combine JSDoc + console.warn |
| Shipping breaking change with only a CHANGELOG note | Nobody reads changelogs proactively | Deprecation warnings drive adoption before removal |
