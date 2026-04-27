# Global Patterns Repository

**Comprehensive DDD/CQRS patterns organized by architectural layer**

This knowledge base contains production-enforced patterns for DDD/CQRS projects. Each pattern is derived from real implementations (2-3 verified code examples) and includes comprehensive anti-patterns sections.

**Version**: 3.1
**Last Updated**: 2026-04-03
**Status**: PRODUCTION (38 core patterns + 29 stack-specific)

---

## 📂 Directory Structure (Layered Organization)

```
patterns/
├── domain/              # Domain Layer (core business logic) - 6 patterns
├── application/         # Application Layer (CQRS handlers) - 4 patterns
├── infrastructure/      # Infrastructure Layer (persistence, API) - 4 patterns
├── architecture/        # Cross-cutting architecture patterns - 11 patterns
├── testing/            # Testing patterns - 9 patterns
├── cross-layer/        # Used everywhere (errors, logging, error handlers) - 4 patterns
├── orchestration/      # Project management and team coordination - 1 pattern
│
├── flutter/            # Flutter-specific patterns - 7 patterns (per-project)
├── nextjs/             # Next.js-specific patterns - 7 patterns (per-project)
├── python/             # Python-specific patterns - 5 patterns (per-project)
├── sveltekit/          # SvelteKit-specific patterns - 5 patterns (per-project)
└── typescript-library/ # TS library-specific patterns - 5 patterns (per-project)
```

---

## 📋 Pattern Index

### Domain Layer (6 patterns)

Core business logic patterns following DDD principles.

| Pattern | Lines | Status | Description | Primary Users |
|---------|-------|--------|-------------|---------------|
| **[aggregate-pattern.md](domain/aggregate-pattern.md)** | 640 | Production | Aggregates with factory methods, GDPR event segregation, Result pattern | domain-application-implementer |
| **[value-object-pattern.md](domain/value-object-pattern.md)** | ~600 | Production | Text content, enum-based, calculation patterns; immutability enforcement | domain-application-implementer |
| **[domain-event-pattern.md](domain/domain-event-pattern.md)** | ~600 | Production | GDPR 4-part segregation, correlation IDs, eventMap registration | domain-application-implementer |
| **[entity-pattern.md](domain/entity-pattern.md)** | ~550 | Production | Entities with identity-based equality, NO domain events, simple CRUD | domain-application-implementer |
| **[specification-policy-pattern.md](domain/specification-policy-pattern.md)** | 319 | Production | PolicyBuilder.must() pattern, Specifications as single source of truth | domain-application-implementer |
| **[domain-service-pattern.md](domain/domain-service-pattern.md)** | 320 | Production | Cross-aggregate business logic, stateless services, pure domain (NO infrastructure) | domain-application-implementer |

**Domain Layer Key Principles**:
- Factory methods: `create()` vs `reconstituteFromPersistence()`
- GDPR event segregation: `piiData`, `anonymizedData`, `businessData`, `cryptoShredding`
- Result pattern: ALL methods return `Result<T, Error>`
- Format validation ONLY - business rules in aggregates
- Entity vs Aggregate: Simple CRUD = Entity, Complex invariants + events = Aggregate
- Specifications: Single source of truth for business rules (NEVER inline logic)
- PolicyBuilder: ALWAYS use `.must()`, NEVER `BusinessRuleValidator.addRule()`

---

### Application Layer (4 patterns)

CQRS command and query handlers, application services for complex workflows.

| Pattern | Lines | Status | Description | Primary Users |
|---------|-------|--------|-------------|---------------|
| **[command-handler-pattern.md](application/command-handler-pattern.md)** | ~500 | Production | Write-side CQRS, Dual Identity, ACL Registry, @Transactional | domain-application-implementer |
| **[query-handler-pattern.md](application/query-handler-pattern.md)** | ~400 | Production | Read-side CQRS, pagination, user context, read models | domain-application-implementer |
| **[application-service-pattern.md](application/application-service-pattern.md)** | 375 | Production | Multi-step workflows, saga pattern, integration events, cross-context orchestration | domain-application-implementer |
| **[audit-handler-pattern.md](application/audit-handler-pattern.md)** | ~450 | Production | GDPR audit logging, tier classification, BaseAuditHandler extension | domain-application-implementer, infrastructure-testing-implementer |

**Application Layer Key Principles**:
- Dual Identity Pattern: userId from `RequestContextService`, NEVER from command
- Orchestration ONLY: Load data, call aggregate methods, persist - NO business rules
- ACL Registry: Cross-context calls via `aclRegistry.getGlobalRequired<T>()`
- Pagination REQUIRED: ALL list queries support `page` and `limit`
- @Transactional inherited from base handlers
- Application Services: Use for multi-step workflows, sagas, integration events (NOT simple CRUD)

---

### Infrastructure Layer (4 patterns)

Persistence, API, and technical implementation patterns.

| Pattern | Lines | Status | Description | Primary Users |
|---------|-------|--------|-------------|---------------|
| **[repository-pattern.md](infrastructure/repository-pattern.md)** | ~700 | Production | BaseKyselyRepository, CQRS separation, optimistic locking, upsert | infrastructure-testing-implementer |
| **[repository-events-pattern.md](infrastructure/repository-events-pattern.md)** | 400 | Production | 3-layer event protection (imports, eventMap, verification test) | infrastructure-testing-implementer |
| **[mapper-pattern.md](infrastructure/mapper-pattern.md)** | ~600 | Production | toDomain(), toPersistence(), value object reconstruction | infrastructure-testing-implementer |
| **[controller-schema-pattern.md](infrastructure/controller-schema-pattern.md)** | ~600 | Production | Zod validation, @CurrentUser, rate limiting, Result pattern | infrastructure-testing-implementer |

**Infrastructure Layer Key Principles**:
- CQRS separation: Command repositories (BaseKyselyRepository) vs Query repositories (direct Kysely)
- Optimistic locking: `aggregate_versions` table join pattern
- 3-layer event protection: MANDATORY for all command repositories
- Zod schemas: Format validation at API boundary
- Rate limiting: DoS protection on ALL endpoints

---

### Architecture Layer (11 patterns)

Cross-cutting architectural patterns spanning multiple layers.

| Pattern | Lines | Status | Description | Primary Users |
|---------|-------|--------|-------------|---------------|
| **[acl-registry-pattern.md](architecture/acl-registry-pattern.md)** | 364 | Production | Cross-context communication without circular dependencies | infrastructure-testing-implementer |
| **[user-projection-pattern.md](architecture/user-projection-pattern.md)** | 432 | Production | Each context has own `{context}_users` table, NO cross-context JOINs | infrastructure-testing-implementer |
| **[dual-identity-pattern.md](architecture/dual-identity-pattern.md)** | 493 | Production | userId from JWT (RequestContext), NEVER from request body (SECURITY) | domain-application-implementer, infrastructure-testing-implementer |
| **[transactional-pattern.md](architecture/transactional-pattern.md)** | 412 | Production | @Transactional decorator, auto-commit/rollback | domain-application-implementer |
| **[bullmq-queue-pattern.md](architecture/bullmq-queue-pattern.md)** | 490 | Production | Async job processing with BullMQ | infrastructure-testing-implementer |
| **[integration-event-pattern.md](architecture/integration-event-pattern.md)** | ~800 | Production | Cross-context events via Outbox Pattern, NO PII, priority-based processing | domain-application-implementer, infrastructure-testing-implementer |
| **[entity-event-emission-pattern.md](architecture/entity-event-emission-pattern.md)** | 480 | Production | Manual domain event emission for Entities (non-Aggregates), eventPersistenceHandler + eventDispatcher | domain-application-implementer |
| **[golden-rule-endpoints.md](architecture/golden-rule-endpoints.md)** | ~120 | Production | GET /{resource} = public (approved only), GET /{resource}/my = owner (all statuses). ADR-0071 | infrastructure-testing-implementer, domain-application-implementer |
| **[cross-context-communication.md](architecture/cross-context-communication.md)** | ~200 | Production | Decision guide: ACL vs Integration Events vs queues for cross-context communication | All implementers |
| **[token-optimization-pattern.md](architecture/token-optimization-pattern.md)** | ~300 | Production | Token reduction settings, session quality, model selection strategy | All users |
| **[fresh-context-pattern.md](architecture/fresh-context-pattern.md)** | 553 | Production | Keep orchestrator lean (~15%), subagents fresh (~100% relevant), context rot detection | project-orchestrator, all agents |

**Architecture Layer Key Principles**:
- ACL Registry: `aclRegistry.getGlobalRequired<T>('context-name')` for cross-context calls
- User Projections: Each context maintains own user data (no circular dependencies)
- Dual Identity: CRITICAL security pattern (prevents user impersonation)
- Transactions: Inherited from BaseCommandHandler/BaseKyselyRepository
- Queue Jobs: Async processing for long-running operations
- Integration Events: Cross-context communication with NO PII (only IDs/references), Outbox Pattern for transactional consistency
- Fresh Context: Orchestrator coordination (~15% context), subagents with focused context (~100% relevant), cross-session continuity via STATE.md

---

### Testing Layer (8 patterns)

Testing strategies and patterns for all levels of the test pyramid.

| Pattern | Lines | Status | Description | Primary Users |
|---------|-------|--------|-------------|---------------|
| **[testing-pyramid-pattern.md](testing/testing-pyramid-pattern.md)** | ~600 | Production | L1 ~50%, L2 ~30%, L3 ~20% test distribution | All implementers |
| **[schema-testing-pattern.md](testing/schema-testing-pattern.md)** | ~500 | Production | 6-category methodology for Zod schema testing | infrastructure-testing-implementer |
| **[context-isolation-pattern.md](testing/context-isolation-pattern.md)** | ~450 | Production | Isolated test databases per bounded context | All implementers |
| **[e2e-hybrid-fixture-pattern.md](testing/e2e-hybrid-fixture-pattern.md)** | ~550 | Production | Fixture what you DON'T test, real flow for what you DO test | infrastructure-testing-implementer |
| **[test-seeding-performance-guide.md](testing/test-seeding-performance-guide.md)** | ~700 | Production | Performance optimization for test data seeding | All implementers |
| **[rate-limit-testing-pattern.md](testing/rate-limit-testing-pattern.md)** | ~400 | Production | Separate E2E files for rate limiting tests | infrastructure-testing-implementer |
| **[redis-test-isolation-pattern.md](testing/redis-test-isolation-pattern.md)** | ~350 | Production | Redis database isolation in tests | infrastructure-testing-implementer |
| **[business-rules-yaml-pattern.md](testing/business-rules-yaml-pattern.md)** | ~400 | Production | BUSINESS_RULES.yaml as test oracle, specification/policy alignment | All implementers |
| **[golevelup-mock-pattern.md](testing/golevelup-mock-pattern.md)** | ~300 | Production | `createMock<T>()` zamiast factory functions, DeepMocked type safety, co NIE migrować | All implementers |

**Testing Layer Key Principles**:
- Test Pyramid: L1 (unit) ~50%, L2 (integration) ~30%, L3 (E2E) ~20%
- Schema Testing: 6 categories (valid, required, type, format, boundaries, edge cases)
- Context Isolation: Each bounded context has isolated test database
- Hybrid Fixtures: Fixture non-tested flows, real implementation for tested flows
- Rate Limit Tests: ALWAYS in separate `*-rate-limits.e2e.spec.ts` files
- Redis Isolation: Use unique database index per test suite
- Mock Pattern: `createMock<T>()` from @golevelup/ts-vitest for ALL interface mocks — NEVER manual factory functions or `{ method: vi.fn() }` inline objects

---

### Cross-Layer Patterns (4 patterns)

Patterns used across all architectural layers.

| Pattern | Lines | Status | Description | Primary Users |
|---------|-------|--------|-------------|---------------|
| **[domain-errors-pattern.md](cross-layer/domain-errors-pattern.md)** | ~600 | Production | ErrorCode enum, Result pattern, hybrid error handling | All implementers |
| **[logger-pattern.md](cross-layer/logger-pattern.md)** | ~500 | Production | Structured logging, PII redaction, correlation IDs | All implementers |
| **[error-handler-chain-pattern.md](cross-layer/error-handler-chain-pattern.md)** | ~550 | Production | 9 specialized error handlers in Chain of Responsibility | infrastructure-testing-implementer |
| **[conventions-pattern.md](cross-layer/conventions-pattern.md)** | ~400 | Production | Naming conventions, file organization, module structure | All implementers |
| **[safe-error-propagation-pattern.md](cross-layer/safe-error-propagation-pattern.md)** | ~350 | Production | 3-layer defense against infra error leakage to HTTP (TS-SEC-011) | All implementers |

**Cross-Layer Key Principles**:
- Domain Errors: ErrorCode enum as single source of truth, Result<T> pattern everywhere
- Logging: Structured logs with correlation IDs, PII redaction via logger config
- Error Handlers: Priority-ordered chain (9 handlers), specialized handling per error type
- Safe Error Propagation: NEVER pass error.message to HTTP responses — 3-layer defense (BaseRepo → factory → mapper)
- Conventions: Consistent naming, file organization, module structure across all contexts

---

### Orchestration Layer (1 pattern)

Patterns for project management and team coordination.

| Pattern | Lines | Status | Description | Primary Users |
|---------|-------|--------|-------------|---------------|
| **[project-management-system.md](orchestration/project-management-system.md)** | ~275 | Production | File-based PM system: @tech-lead + @product-owner agents, TEAM-STATE.md shared brain, task YAML schema, event-driven triggers | All projects |

**Orchestration Layer Key Principles**:
- TEAM-STATE.md as shared brain — all agents read it first, write after analysis
- Two advisory agents with separate lenses (technical + business)
- Event-driven triggers (PostToolUse on task file changes)
- Skills: /pulse, /pm-status, /task-health, /tech-debt, /sprint

---

## 🎯 Pattern Usage Guide

### For Implementation Agents

**Before implementing ANYTHING:**
1. ✅ Read this README to identify relevant patterns
2. ✅ Read those patterns (contains REAL production code examples)
3. ✅ Base implementation on patterns, NOT generic DDD/CQRS knowledge
4. ✅ Mention which patterns you referenced in your implementation

**Why This Matters:**
- Generic DDD examples may violate project conventions
- Patterns contain MUST/MUST NOT rules specific to this architecture
- Patterns include anti-patterns section (common mistakes to avoid)
- Patterns enforce architectural decisions and best practices

### Pattern Selection Quick Reference

| Implementing | Must Read Pattern | Why |
|--------------|------------------|-----|
| New aggregate | aggregate-pattern.md | Factory methods, event emission, GDPR segregation |
| New value object | value-object-pattern.md | Immutability, validation, reconstruction |
| Business rules | specification-policy-pattern.md | PolicyBuilder.must() - NEVER inline rules |
| Command handler | command-handler-pattern.md | Handler registration, Dual Identity, @Transactional |
| Query handler | query-handler-pattern.md | Pagination, read models, user context |
| Repository | repository-pattern.md + repository-events-pattern.md | CQRS, 3-layer event protection |
| API endpoint | controller-schema-pattern.md | Zod schemas, rate limiting, @CurrentUser |
| Cross-context call | acl-registry-pattern.md | NO direct imports between contexts |
| Async job | bullmq-queue-pattern.md | Queue setup, consumers, error handling |
| Domain errors | domain-errors-pattern.md | ErrorCode enum, error hierarchy |
| Domain events | audit-handler-pattern.md | MANDATORY: Tier classification, GDPR compliance |

---

## 📊 Pattern Statistics

**Core Patterns**: 39
**Stack-Specific Patterns**: 29 (flutter, nextjs, python, sveltekit, typescript-library)
**Total**: 68
**Production Status**: 100% (all patterns verified in production code)

**Core Pattern Distribution**:
- Domain: 15% (6)
- Application: 10% (4)
- Infrastructure: 10% (4)
- Architecture: 28% (11)
- Testing: 23% (9)
- Cross-Layer: 10% (4)
- Orchestration: 3% (1)

---

## 🔄 Pattern Updates

**Version 3.2** (2026-04-19):
- Added testing/golevelup-mock-pattern.md (@golevelup/ts-vitest createMock<T> pattern)
- Total patterns: 39 (was 38)

**Version 3.1** (2026-04-03):
- Added orchestration layer with project-management-system.md
- Added architecture/cross-context-communication.md (decision guide)
- Total patterns: 35 (was 33)

**Version 3.0** (2026-02-05):
- Migrated 20 generic patterns from project-specific repositories
- Genericized all "Project-specific" references
- Updated pattern counts and statistics
- Added comprehensive testing layer (7 patterns)
- Added cross-layer patterns (4 patterns)

**Version 2.5** (2026-01-15):
- Added audit-handler-pattern.md (GDPR compliance)
- Added fresh-context-pattern.md (context engineering)
- Updated testing patterns with hybrid fixture approach

**Version 2.0** (2026-01-01):
- Initial global patterns repository
- Domain, Application, Infrastructure, Architecture patterns

---

**Maintainer**: Global Patterns Team
**Distribution**: MCP Server + Filesystem Symlinks
**Projects Using**: Any DDD/CQRS NestJS TypeScript project
