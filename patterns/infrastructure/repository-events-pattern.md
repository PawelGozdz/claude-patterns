# Repository Events Pattern

## 🎯 Problem

**Missing domain events in repository eventMap causes runtime errors when reconstructing aggregates from database.**

In repositories extending `BaseKyselyRepository`:
- Aggregates emit domain events during business operations
- Events are persisted to database with aggregate state
- Repository must reconstruct event objects from database JSON
- **Missing event in eventMap → null event → runtime error**
- Error only appears in production when loading aggregates from DB

**Real Production Bug** (2025-12-25):
```
TypeError: event.getChangeReason is not a function
  at UserIdentityAggregate.applyEvent()
  at UserIdentityCommandKyselyRepository.hydrate()
```

**Root Cause**: `UserProfileUpdatedEvent` missing from `eventMap` in repository.

## ✅ Solution

**3-Layer Protection System** ensures ALL domain events are registered:

1. **Layer 1**: Comprehensive imports (ALL events + context enum, alphabetically)
2. **Layer 2**: Complete eventMap registration using enum (TS-EVENTS-002)
3. **Layer 3**: Automated verification test (fails if event missing)

## 🔧 Implementation

### Layer 1: Comprehensive Event Imports

**✅ CORRECT**: Import ALL domain events from context

**Real Project Code** from `engagement/infrastructure/repositories/user-action-command-kysely.repository.ts`:

```typescript
// Import context enum (TS-EVENTS-002)
import { EngagementEventNames } from '../../domain/events/event-names.enum';

// Import ALL domain events alphabetically (even if not yet used)
import {
  ActionPerformedEvent,
  ActionRemovedEvent,
} from '../../domain/events';
```

**More Complex Example** from `auth/infrastructure/repositories/user-identity-command-kysely.repository.ts`:

```typescript
// Import ALL domain events from auth context (alphabetically)
import { DateOfBirthSetEvent } from '../../domain/events/date-of-birth-set.event';
import { EmailChangeInitiatedEvent } from '../../domain/events/email-change-initiated.event';
import { EmailChangedEvent } from '../../domain/events/email-changed.event';
import { EmailVerifiedEvent } from '../../domain/events/email-verified.event';
import { PasswordChangedEvent } from '../../domain/events/password-changed.event';
import { UserDeactivatedEvent } from '../../domain/events/user-deactivated.event';
import { UserProfileUpdatedEvent } from '../../domain/events/user-profile-updated.event';
import { UserRegisteredEvent } from '../../domain/events/user-registered.event';
```

**Why Alphabetical Order**:
- ESLint enforces alphabetical imports
- Easy to spot missing events
- Visual verification during code review

**❌ WRONG**: Incomplete imports

```typescript
// ❌ Only importing events currently used
import { UserRegisteredEvent } from '../../domain/events/user-registered.event';
import { EmailVerifiedEvent } from '../../domain/events/email-verified.event';
// Missing: UserProfileUpdatedEvent, EmailChangedEvent, etc.
```

**Why Bad**: When aggregate later emits new event, easy to forget updating repository imports.

### Layer 2: Complete eventMap Registration

**✅ CORRECT**: Register ALL imported events

**Real Project Code** from `engagement/infrastructure/repositories/user-action-command-kysely.repository.ts`:

```typescript
/**
 * Reconstruct domain event from database JSON
 *
 * CRITICAL: ALL domain events from engagement context MUST be registered here.
 * Missing events cause runtime errors when loading aggregates from database.
 *
 * Pattern: TS-EVENTS-002 (use context enum with computed property syntax)
 * @see Layer 1 imports for complete event list
 */
protected override async reconstructEventByType(plainEvent: any): Promise<any | null> {
  // eventMap: ALL domain events using EngagementEventNames enum (TS-EVENTS-002)
  const eventMap: Record<string, any> = {
    [EngagementEventNames.ACTION_PERFORMED]: ActionPerformedEvent,
    [EngagementEventNames.ACTION_REMOVED]: ActionRemovedEvent,
  };

  const EventClass = eventMap[plainEvent.eventName];

  if (!EventClass) {
    // Log warning for debugging unknown events
    console.warn(
      `[UserActionRepository] Unknown event type: ${plainEvent.eventName}. ` +
      `Available events: ${Object.keys(eventMap).join(', ')}`
    );
    return null;
  }

  try {
    return ProjectDomainEvent.fromPlainObject(EventClass as any, plainEvent);
  } catch (error) {
    console.error(`Failed to reconstruct ${plainEvent.eventName}:`, error);
    return null;
  }
}
```

**Key Points**:
- `eventMap` uses context enum with computed property syntax (TS-EVENTS-002)
- Enum provides type safety and single source of truth
- `ProjectDomainEvent.fromPlainObject()` reconstructs event from JSON
- Warning logged if event type unknown (debugging aid)
- Alphabetical order matches import order

**❌ WRONG**: Hardcoded strings instead of enum (TS-EVENTS-002 violation)

```typescript
// ❌ Hardcoded strings - string duplication, no type safety
protected override async reconstructEventByType(plainEvent: any): Promise<any | null> {
  const eventMap: Record<string, any> = {
    'engagement.action.performed': ActionPerformedEvent, // ❌ Hardcoded string!
    'engagement.action.removed': ActionRemovedEvent,
  };

  const EventClass = eventMap[plainEvent.eventName];

  if (!EventClass) {
    return null;
  }

  return ProjectDomainEvent.fromPlainObject(EventClass as any, plainEvent);
}
```

**Why Bad**:
- String duplication (event class has same string)
- No compile-time validation (typos not caught)
- Hard to refactor (find/replace needed)
- Violates TS-EVENTS-002 pattern

### Layer 3: Automated Verification Test

**✅ CORRECT**: Test validates ALL events registered

```typescript
// src/contexts/engagement/infrastructure/repositories/__tests__/user-action-repository.verification.spec.ts

import { describe, it, expect } from 'vitest';
import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('UserActionCommandKyselyRepository Event Registration', () => {
  it('should have ALL domain events registered in eventMap', async () => {
    // Step 1: Auto-discover ALL domain events in context
    const eventsDir = path.join(__dirname, '../../../domain/events');
    const eventFiles = await glob('*.event.ts', { cwd: eventsDir });

    // Convert filenames to class names (e.g., 'action-performed.event.ts' → 'ActionPerformedEvent')
    const expectedEvents = eventFiles
      .map(file => file.replace('.event.ts', ''))
      .map(file =>
        file
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join('')
      )
      .map(name => `${name}Event`)
      .sort();

    // Step 2: Extract registered events from repository source code
    const repoPath = path.join(__dirname, '../user-action-command-kysely.repository.ts');
    const repoSource = await fs.readFile(repoPath, 'utf-8');

    // Parse eventMap from source code
    const eventMapMatch = repoSource.match(
      /const eventMap: Record<string, any> = \{([^}]+)\}/s
    );

    expect(eventMapMatch).toBeTruthy();

    const registeredEvents = eventMapMatch![1]
      .split(',')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .sort();

    // Step 3: Verify ALL events are registered
    expect(registeredEvents).toEqual(expectedEvents);
  });
});
```

**What This Test Does**:
1. Scans `domain/events/` directory for all event files
2. Extracts registered events from repository source code
3. Compares lists - **test FAILS if ANY event missing**

**Benefits**:
- Automatic detection of missing events
- Runs in CI/CD pipeline
- Prevents production bugs
- Zero manual maintenance

## 📋 Rules

### MUST

- ✅ **MUST** import ALL domain events from context (not just currently used)
- ✅ **MUST** maintain alphabetical order in imports and eventMap
- ✅ **MUST** register ALL imported events in `reconstructEventByType()`
- ✅ **MUST** log warning for unknown event types (debugging)
- ✅ **MUST** create verification test for new repositories
- ✅ **MUST** update eventMap when adding new domain events

### MUST NOT

- ❌ **MUST NOT** skip imports for "unused" events (all events must be imported)
- ❌ **MUST NOT** silently return null without logging (debugging impossible)
- ❌ **MUST NOT** use random order for eventMap (use alphabetical)
- ❌ **MUST NOT** skip verification test (automated protection required)

## ⚠️ Anti-Patterns

### Anti-Pattern 1: Incomplete Event Imports

```typescript
// ❌ WRONG: Only importing events currently emitted by aggregate
import { UserRegisteredEvent } from '../../domain/events/user-registered.event';
import { EmailVerifiedEvent } from '../../domain/events/email-verified.event';
// Missing: UserProfileUpdatedEvent (aggregate emits it, but import forgotten)
```

**Why Bad**: When aggregate emits new event type, easy to forget updating repository.

**Fix**: Import ALL events from context, even if not yet used.

### Anti-Pattern 2: Missing Warning for Unknown Events

```typescript
// ❌ WRONG: Silent failure
protected override async reconstructEventByType(plainEvent: any): Promise<any | null> {
  const eventMap: Record<string, any> = {
    ActionPerformedEvent,
  };

  const EventClass = eventMap[plainEvent.eventName];

  if (!EventClass) {
    return null; // No logging - impossible to debug!
  }

  return ProjectDomainEvent.fromPlainObject(EventClass as any, plainEvent);
}
```

**Why Bad**: Production errors have no context about WHICH event is missing.

**Fix**: Log warning with event type and available events.

### Anti-Pattern 3: No Verification Test

```typescript
// ❌ WRONG: No automated verification
// Repository has eventMap, but no test to verify completeness
// Missing events only discovered in production
```

**Why Bad**: Relies on manual code review, easy to miss during development.

**Fix**: Create verification test that fails if ANY event missing.

### Anti-Pattern 4: Random Event Order

```typescript
// ❌ WRONG: Random order (hard to spot missing events)
const eventMap: Record<string, any> = {
  UserRegisteredEvent,
  PasswordChangedEvent,
  UserDeactivatedEvent,
  EmailVerifiedEvent, // Out of alphabetical order
  UserProfileUpdatedEvent,
};
```

**Why Bad**: Visual verification during code review is difficult.

**Fix**: Maintain alphabetical order (matches import order, enforced by ESLint).

## 📚 References

### ADRs
- **ADR-0025**: Hybrid Event System (domain events vs integration events)

### Related Patterns
- **Domain Events Pattern**: Event sourcing fundamentals
- **BaseKyselyRepository Pattern**: Parent pattern for all repositories

### Implementation Files
- `src/shared/infrastructure/repositories/base-kysely.repository.ts` - Base repository with event handling
- `src/shared/domain/events/project-domain-event.base.ts` - Event reconstruction logic
- `src/contexts/engagement/infrastructure/repositories/user-action-command-kysely.repository.ts` - Example repository

### Real Examples
1. **Auth Context** - 8 events (UserRegisteredEvent, EmailVerifiedEvent, etc.)
2. **Engagement Context** - 2 events (ActionPerformedEvent, ActionRemovedEvent)
3. **Community-Communication Context** - Multiple event types for events/alerts

## 🎯 When to Use

**Use Repository Events Pattern for:**

1. ✅ **ALL repositories extending BaseKyselyRepository**
2. ✅ **Command repositories** (write-side, persists events)
3. ✅ **Aggregates with domain events** (event sourcing)

**Do NOT use for:**

1. ❌ **Query repositories** (read-side, no events)
2. ❌ **Read models** (projections, not aggregates)
3. ❌ **DTOs/Value Objects** (no events)

### Implementation Checklist

**When Creating New Domain Event**:
- [ ] Add event import to repository (alphabetical order)
- [ ] Add event to `eventMap` in `reconstructEventByType()` (alphabetical order)
- [ ] Run verification test (if exists)
- [ ] Run E2E test that triggers the event

**When Creating New Repository**:
- [ ] Import ALL existing domain events from context
- [ ] Create complete `eventMap` with all events (alphabetical order)
- [ ] Add `console.warn` for unknown event types
- [ ] Create event registration verification test
- [ ] Document in repository header comment

**During Code Review**:
- [ ] Verify all domain events from context are imported
- [ ] Verify all imported events are in eventMap
- [ ] Verify alphabetical order maintained
- [ ] Verify verification test exists and passes
- [ ] Check CI/CD logs for unknown event warnings

### Testing Strategy

**L1 Tests (Unit)**: Verification test for event registration

```typescript
it('should have ALL domain events registered in eventMap', async () => {
  const expectedEvents = /* discover from filesystem */;
  const registeredEvents = /* parse from source code */;
  expect(registeredEvents).toEqual(expectedEvents);
});
```

**L2 Tests (Integration)**: Event reconstruction

```typescript
it('should reconstruct ActionPerformedEvent from database JSON', async () => {
  const plainEvent = {
    eventName: 'ActionPerformedEvent',
    aggregateId: 'action-1',
    payload: { actionType: 'LIKE' },
  };

  const event = await repo.reconstructEventByType(plainEvent);

  expect(event).toBeInstanceOf(ActionPerformedEvent);
  expect(event.actionType).toBe('LIKE');
});
```

**L3 Tests (E2E)**: Full aggregate lifecycle

```typescript
it('should persist and reconstruct aggregate with events', async () => {
  // Create aggregate (emits ActionPerformedEvent)
  const action = UserActionAggregate.create(userId, 'LIKE', targetId);
  await repo.save(action.value);

  // Load from database (reconstructs events)
  const loaded = await repo.findById(action.value.id);

  expect(loaded.value).toBeDefined();
  expect(loaded.value.uncommittedEvents).toHaveLength(0); // Events already persisted
});
```

---

**Pattern Type**: Infrastructure (MANDATORY for all BaseKyselyRepository extensions)
**Status**: Production-enforced
**Lines**: 251
