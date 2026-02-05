# Audit Handler Pattern

## 🎯 Problem

**Challenges with audit logging implementation**:
- Missing audit handlers in new contexts → GDPR Article 30 compliance gaps
- Inconsistent tier classification → some Tier 1 events not audited
- Handlers not registered in module → audit entries never created
- Wrong priority (runs BEFORE business logic instead of AFTER)
- Missing GDPR metadata (legal basis, retention period, data categories)

**Real-world pain points**:
- **Authorization context missing entirely**: 7 Tier 1 events with no audit trail → GDPR violation
- **Trust context gaps**: UserSuspended events not audited → no compliance record for account actions
- **Auth context gaps**: UserDeletedEvent, UserAnonymizedEvent not audited → GDPR Right to Erasure not documented

---

## ✅ Solution

**Audit Handler pattern with**:
- Context-specific handler extending `BaseAuditHandler`
- ADR-0027 tier classification for all events
- Manual handler registration in `onModuleInit()` with **priority 1 (lowest)**
- GDPR-compliant metadata per event (legal basis, retention, data categories)
- Circuit breaker protection for graceful degradation

---

## 🔧 Implementation

### Example 1: AuthAuditHandler (Core Pattern)

**File**: `src/contexts/auth/application/event-handlers/audit.handler.ts`

**Key characteristics**:
- Extends `BaseAuditHandler` from Shared Kernel
- Returns `BoundedContextName` and `AuditEventCategory`
- Handler methods per Tier 1 event
- GDPR metadata in every `createAuditEntry()` call

```typescript
import { Injectable } from '@nestjs/common';

import {
  BaseAuditHandler,
  type BoundedContextName,
  type AuditEventCategory,
} from '@shared/application/audit';

import {
  EmailVerifiedEvent,
  PasswordChangedEvent,
  SocialAccountLinkedEvent,
  SocialAccountUnlinkedEvent,
  UserDeactivatedEvent,
  UserRegisteredEvent,
} from '../../domain/events';

/**
 * Auth Context Audit Handler
 * Part of TS-ASYNC-003: Audit Logging Queue Consumer
 *
 * Event Handlers (per ADR-0027):
 * - Tier 1 MANDATORY: UserRegistered, EmailVerified, PasswordChanged, UserDeactivated
 * - Tier 2 SELECTIVE: SocialAccountLinked, SocialAccountUnlinked
 *
 * Registration: Manual in auth.module.ts via VytchesDDD event bus
 * Priority: 1 (lowest) - ensures audit runs AFTER business logic
 */
@Injectable()
export class AuthAuditHandler extends BaseAuditHandler {
  /**
   * Bounded context identifier for audit trail
   */
  protected getBoundedContext(): BoundedContextName {
    return 'Auth';
  }

  /**
   * Event category for GDPR Article 30 compliance
   */
  protected getEventCategory(): AuditEventCategory {
    return 'AUTHENTICATION';
  }

  /**
   * Handle UserRegistered events for audit
   * TIER 1 MANDATORY - GDPR Article 6(1)(b) contract basis
   */
  async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
    const anonymizedData = event.getAnonymizedData();

    await this.createAuditEntry('USER_REGISTERED', {
      userId: event.aggregateId,
      email: anonymizedData?.hashedUserSegment, // Anonymized (no raw PII)
      registrationMethod: event.getRegistrationMethod(),
      timestamp: event.getRegistrationTimestamp(),
      legalBasis: 'CONTRACT', // User registration is contractual
      dataCategories: ['identity', 'contact'],
      retentionPeriod: '7_YEARS', // Polish legal requirement
    });
  }

  /**
   * Handle PasswordChanged events for audit
   * TIER 1 MANDATORY - Security-critical operation
   */
  async handlePasswordChanged(event: PasswordChangedEvent): Promise<void> {
    await this.createAuditEntry('PASSWORD_CHANGED', {
      userId: event.aggregateId,
      changeMethod: event.getChangeMethod(),
      timestamp: event.getChangedAt(),
      legalBasis: 'LEGITIMATE_INTERESTS', // Security measures
      dataCategories: ['security', 'access_logs'],
      retentionPeriod: '6_YEARS',
      securityEvent: true,
    });
  }

  /**
   * Handle UserDeactivated events for audit
   * TIER 1 MANDATORY - Account lifecycle change
   */
  async handleUserDeactivated(event: UserDeactivatedEvent): Promise<void> {
    await this.createAuditEntry('USER_DEACTIVATED', {
      userId: event.aggregateId,
      email: event.getUserEmail(),
      deactivationReason: event.getDeactivationReason(),
      deactivatedBy: event.getDeactivatedBy(),
      retainData: event.shouldRetainData(),
      timestamp: event.getDeactivatedAt(),
      legalBasis: 'LEGITIMATE_INTERESTS',
      dataCategories: ['identity', 'compliance'],
      retentionPeriod: '10_YEARS', // Compliance records
      complianceEvent: true,
    });
  }
}
```

---

### Example 2: Module Registration (CRITICAL)

**File**: `src/contexts/auth/auth.module.ts`

**Key characteristics**:
- Handler injected via constructor `@Inject()`
- Registration in `onModuleInit()` with **priority 1 (lowest)**
- ALL Tier 1 events registered

```typescript
import { Injectable, Module, type OnModuleInit, Inject } from '@nestjs/common';
import { EventBus } from '@vytches/ddd';

import { AuthAuditHandler } from './application/event-handlers/audit.handler';
import {
  UserRegisteredEvent,
  EmailVerifiedEvent,
  PasswordChangedEvent,
  UserDeactivatedEvent,
  SocialAccountLinkedEvent,
  SocialAccountUnlinkedEvent,
} from './domain/events';

@Module({
  providers: [
    AuthAuditHandler,
    // ... other providers
  ],
  exports: [AuthAuditHandler],
})
@Injectable()
export class AuthModule implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    @Inject(AuthAuditHandler) private readonly auditHandler: AuthAuditHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    // ✅ PRIORITY 1 = LOWEST (runs AFTER business handlers)
    // Tier 1 MANDATORY events
    this.eventBus.subscribe(
      UserRegisteredEvent,
      this.auditHandler.handleUserRegistered.bind(this.auditHandler),
      1, // Priority 1 = lowest
    );
    this.eventBus.subscribe(
      EmailVerifiedEvent,
      this.auditHandler.handleEmailVerified.bind(this.auditHandler),
      1,
    );
    this.eventBus.subscribe(
      PasswordChangedEvent,
      this.auditHandler.handlePasswordChanged.bind(this.auditHandler),
      1,
    );
    this.eventBus.subscribe(
      UserDeactivatedEvent,
      this.auditHandler.handleUserDeactivated.bind(this.auditHandler),
      1,
    );

    // Tier 2 SELECTIVE events (enabled by default for social auth tracking)
    this.eventBus.subscribe(
      SocialAccountLinkedEvent,
      this.auditHandler.handleSocialAccountLinked.bind(this.auditHandler),
      1,
    );
    this.eventBus.subscribe(
      SocialAccountUnlinkedEvent,
      this.auditHandler.handleSocialAccountUnlinked.bind(this.auditHandler),
      1,
    );
  }
}
```

---

## 📋 ADR-0027 Tier Classification

### Tier 1: MANDATORY AUDIT (Always Log)

**Criteria**: Events that process personal data OR pose security risks

| Category | Events | Legal Basis |
|----------|--------|-------------|
| **Authentication** | UserRegistered, EmailVerified, PasswordChanged, UserDeactivated, UserDeleted, UserAnonymized, AllSessionsRevoked | CONTRACT / LEGAL_OBLIGATION |
| **Authorization** | RoleAssigned, RoleRevoked, CustomPermissionGranted, CustomPermissionRevoked, PermissionExpired | LEGITIMATE_INTERESTS |
| **PII Operations** | EmailChanged, UserProfileUpdated, UserPreferencesUpdated | CONTRACT |
| **Security** | TokenBlacklisted, TokenRotated, SessionRevoked, AccountLockedOut | LEGITIMATE_INTERESTS |
| **Moderation** | CommentModerated, EventModerated, ContentRejected | LEGITIMATE_INTERESTS |
| **Trust/Suspensions** | UserSuspended, UserSuspensionLifted, AppealSubmitted, AppealApproved, AppealRejected | LEGITIMATE_INTERESTS / LEGAL_OBLIGATION |

### Tier 2: SELECTIVE AUDIT (Context-Dependent)

**Criteria**: Events that MAY need audit trail based on configuration

| Category | Events | Default |
|----------|--------|---------|
| **Social Auth** | SocialAccountLinked, SocialAccountUnlinked | ON (third-party risk) |
| **Read Operations** | UserProfileViewed, PermissionChecked | OFF (performance) |
| **Engagement** | ActionPerformed, ActionRemoved | ON (content tracking) |

### Tier 3: NO AUDIT (Never Log)

**Criteria**: Events with no personal data, security impact, or compliance requirement

- SessionCreated, SessionRenewed, SessionExpired (ephemeral)
- RecurringEventGenerated (automatic)
- OrganizerRatingRecalculated (calculated)
- Technical events (cache, queue processing)

---

## 📋 Rules

### MUST

1. **Extend `BaseAuditHandler`** - provides BullMQ queue, GDPR metadata, circuit breaker
2. **Implement `getBoundedContext()`** - returns context name (e.g., 'Auth', 'Trust')
3. **Implement `getEventCategory()`** - returns GDPR category (e.g., 'AUTHENTICATION')
4. **Register with priority 1** - audit runs AFTER business handlers
5. **Include all Tier 1 events** - mandatory per ADR-0027
6. **Set GDPR metadata** - `legalBasis`, `dataCategories`, `retentionPeriod` in every entry
7. **Use anonymized data** - never raw PII in audit entries
8. **Flag security/compliance events** - `securityEvent: true`, `complianceEvent: true`

### MUST NOT

1. **NEVER skip Tier 1 events** - GDPR compliance violation
2. **NEVER use priority 0** - audit would run before business logic (wrong order)
3. **NEVER store raw PII** - use hashed/anonymized data from events
4. **NEVER throw from handler** - audit failures should never break business flow
5. **NEVER forget module registration** - handler won't receive events

---

## ⚠️ Anti-Patterns

### 1. Missing Handler for Entire Context (GDPR Gap)

```typescript
// ❌ WRONG: Context has domain events but NO audit handler
// authorization.module.ts
@Module({
  providers: [
    RoleService,
    PermissionRepository,
    // ❌ No AuthorizationAuditHandler!
  ],
})
export class AuthorizationModule {}

// Result: RoleAssignedEvent, CustomPermissionGrantedEvent never audited
// GDPR Article 30 violation!

// ✅ CORRECT: Create audit handler for every context with Tier 1 events
@Module({
  providers: [
    RoleService,
    PermissionRepository,
    AuthorizationAuditHandler, // ✅ Audit handler added
  ],
  exports: [AuthorizationAuditHandler],
})
export class AuthorizationModule implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    @Inject(AuthorizationAuditHandler)
    private readonly auditHandler: AuthorizationAuditHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    // ✅ ALL Tier 1 events registered
    this.eventBus.subscribe(RoleAssignedEvent, this.auditHandler.handleRoleAssigned.bind(this.auditHandler), 1);
    this.eventBus.subscribe(RoleRevokedEvent, this.auditHandler.handleRoleRevoked.bind(this.auditHandler), 1);
    // ... all other Tier 1 events
  }
}
```

---

### 2. Wrong Priority (Audit Before Business Logic)

```typescript
// ❌ WRONG: Priority 0 = highest (runs FIRST)
this.eventBus.subscribe(
  UserRegisteredEvent,
  this.auditHandler.handleUserRegistered.bind(this.auditHandler),
  0, // ❌ Wrong! Audit runs before business handlers
);

// Result: If business handler fails, audit entry still created (inconsistent)

// ✅ CORRECT: Priority 1 = lowest (runs LAST)
this.eventBus.subscribe(
  UserRegisteredEvent,
  this.auditHandler.handleUserRegistered.bind(this.auditHandler),
  1, // ✅ Correct! Audit runs AFTER all business handlers
);
```

---

### 3. Missing Tier 1 Events (Partial Coverage)

```typescript
// ❌ WRONG: Only some Tier 1 events audited
@Injectable()
export class AuthAuditHandler extends BaseAuditHandler {
  // Has: handleUserRegistered, handlePasswordChanged
  // ❌ Missing: handleUserDeleted, handleUserAnonymized, handleAccountLockedOut
}

// Result: GDPR Right to Erasure (Article 17) not documented!

// ✅ CORRECT: ALL Tier 1 events from ADR-0027 audited
@Injectable()
export class AuthAuditHandler extends BaseAuditHandler {
  async handleUserRegistered(event: UserRegisteredEvent) { /* ... */ }
  async handleEmailVerified(event: EmailVerifiedEvent) { /* ... */ }
  async handlePasswordChanged(event: PasswordChangedEvent) { /* ... */ }
  async handleUserDeactivated(event: UserDeactivatedEvent) { /* ... */ }
  async handleUserDeleted(event: UserDeletedEvent) { /* ... */ } // ✅ Added
  async handleUserAnonymized(event: UserAnonymizedEvent) { /* ... */ } // ✅ Added
  async handleAccountLockedOut(event: AccountLockedOutEvent) { /* ... */ } // ✅ Added
  async handleAllSessionsRevoked(event: AllUserSessionsRevokedEvent) { /* ... */ } // ✅ Added
}
```

---

### 4. Raw PII in Audit Entry (GDPR Violation)

```typescript
// ❌ WRONG: Raw email in audit entry
async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
  const piiData = event.getPiiData();

  await this.createAuditEntry('USER_REGISTERED', {
    userId: event.aggregateId,
    email: piiData.email, // ❌ Raw PII stored!
    // ...
  });
}

// Result: GDPR Article 5(1)(c) data minimization violation

// ✅ CORRECT: Use anonymized data
async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
  const anonymizedData = event.getAnonymizedData();

  await this.createAuditEntry('USER_REGISTERED', {
    userId: event.aggregateId,
    email: anonymizedData?.hashedUserSegment, // ✅ Anonymized segment (e.g., Base64 domain)
    // ...
  });
}
```

---

### 5. Handler Not Registered in Module

```typescript
// ❌ WRONG: Handler in providers but not registered
@Module({
  providers: [AuthAuditHandler], // ✅ In providers
})
export class AuthModule implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    // ❌ No eventBus.subscribe() calls!
    // Handler exists but never receives events
  }
}

// ✅ CORRECT: Handler registered in onModuleInit
@Module({
  providers: [AuthAuditHandler],
})
export class AuthModule implements OnModuleInit {
  constructor(
    private readonly eventBus: EventBus,
    @Inject(AuthAuditHandler) private readonly auditHandler: AuthAuditHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    // ✅ All events registered
    this.eventBus.subscribe(UserRegisteredEvent, this.auditHandler.handleUserRegistered.bind(this.auditHandler), 1);
    // ... all other events
  }
}
```

---

## 📚 References

### ADRs
- **ADR-0027**: Audit Event Selection Strategy - Tier classification (CRITICAL)
- **ADR-0025**: Hybrid Event System - Domain events within transaction
- **GDPR Article 30**: Records of processing activities

### Implementation Files
- `src/shared/application/audit/base-audit.handler.ts` - Base class
- `src/shared/application/audit/audit-event-data.interface.ts` - Type definitions
- `src/contexts/auth/application/event-handlers/audit.handler.ts` - Auth example
- `src/contexts/engagement/application/event-handlers/audit.handler.ts` - Engagement example
- `src/contexts/organization/application/event-handlers/audit.handler.ts` - Organization example
- `src/contexts/geographic-auth/application/event-handlers/geographic-auth-audit.handler.ts` - Geographic example

### Related Patterns
- **domain-event-pattern.md** - Domain events trigger audit handlers
- **command-handler-pattern.md** - Handler registration in onModuleInit
- **bullmq-queue-pattern.md** - Async audit log processing

---

## 🎯 When to Use

### Create Audit Handler When

✅ **New bounded context** - every context with Tier 1 events needs handler
✅ **Adding Tier 1 domain events** - new events need audit handler methods
✅ **Security/compliance events** - suspensions, permissions, PII operations
✅ **GDPR erasure events** - UserDeleted, UserAnonymized, ContentDeleted

### Don't Create Audit Handler When

❌ **Context has only Tier 3 events** - no compliance value
❌ **Technical/infrastructure module** - cache, queue, metrics (no user data)

---

## 🔄 Implementation Checklist

When implementing a new feature with domain events, **ALWAYS**:

- [ ] Classify events per ADR-0027 (Tier 1/2/3)
- [ ] Create/update audit handler if Tier 1 events exist
- [ ] Add handler method for each Tier 1 event
- [ ] Register handlers in `onModuleInit()` with priority 1
- [ ] Set correct GDPR metadata (legalBasis, retention, categories)
- [ ] Use anonymized data (never raw PII)
- [ ] Update BUSINESS_RULES.md with audit rules

---

**Version**: 1.0
**Created**: 2026-01-13
**Last Updated**: 2026-01-13
**Maintained By**: @localhero-project-orchestrator
**Primary Users**: domain-application-implementer, infrastructure-testing-implementer
**Task Reference**: TS-AUDIT-001
