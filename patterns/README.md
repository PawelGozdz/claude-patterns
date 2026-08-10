# Global Patterns Repository

**Comprehensive DDD/CQRS patterns organized by architectural layer**

This knowledge base contains production-enforced patterns for DDD/CQRS projects. Each pattern is derived from real implementations (2-3 verified code examples) and includes comprehensive anti-patterns sections.

**Version**: 3.10
**Last Updated**: 2026-07-18
**Status**: PRODUCTION (44 core patterns + 29 stack-specific + 1 marketing + 2 finance + 2 legal)

**⚠ project-specific** marker = derived from ONE project's codebase, not yet validated in a second
one. Marked in the pattern's own `**Scope**:` line (see `CLAUDE.md` → "Adding a New Pattern"). These
are excluded from `retrieve_patterns` by default — the calling project must pass `project: "<name>"`
to opt in. Promote to plain "Production" once a second project adopts the same shape.

---

## 📂 Directory Structure (Layered Organization)

```
patterns/
├── domain/              # Domain Layer (core business logic) - 6 patterns
├── application/         # Application Layer (CQRS handlers) - 4 patterns
├── infrastructure/      # Infrastructure Layer (persistence, API) - 5 patterns
├── architecture/        # Cross-cutting architecture patterns - 11 patterns
├── testing/            # Testing patterns - 9 patterns
├── cross-layer/        # Used everywhere (errors, logging, error handlers) - 4 patterns
├── orchestration/      # Project management and team coordination - 1 pattern
├── marketing/          # Marketing workflow patterns - 1 pattern
├── finance/            # Finance workflow patterns - 2 patterns
├── legal/              # Legal workflow patterns - 2 patterns
│
├── flutter/            # Flutter-specific patterns - 14 patterns (per-project)
│                       #   incl. mobile-security, platform-channel, offline-first,
│                       #   design-token, accessibility, localization (+ rule-cards _summary.md)
├── nextjs/             # Next.js-specific patterns - 7 patterns (per-project)
├── ai-ml/              # GPU inference patterns - 7 patterns (per-project)
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
| **[query-handler-pattern.md](application/query-handler-pattern.md)** | ~400 | Production | Read-side CQRS, pagination, user context, read models; self-scoped queries read userId from RequestContextService (ARCH-D001) | domain-application-implementer |
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
| **[external-adapter-pattern.md](infrastructure/external-adapter-pattern.md)** | ~230 | ⚠ project-specific (grant-flow) | Logging placeholder adapter: realny port, zero I/O, fail-fast w onModuleInit, rozdzielone klasy błędów | infrastructure-testing-implementer |
| **[geo-spatial-query-pattern.md](infrastructure/geo-spatial-query-pattern.md)** | ~300 | ⚠ project-specific (juz-ide) | PostGIS: 3 predicate classes (metric/topological/KNN), cast shape = index shape, catalogue-before-EXPLAIN verification, spatial predicate as access control | infrastructure-testing-implementer, geo-postgres-specialist |

**Infrastructure Layer Key Principles**:
- Spatial queries: classify the predicate (metric/topological/KNN) BEFORE writing it; cast shape must match index shape; verify against `pg_indexes` before `EXPLAIN` (small tables cannot distinguish correct from broken)
- CQRS separation: Command repositories (BaseKyselyRepository) vs Query repositories (direct Kysely)
- Optimistic locking: `aggregate_versions` table join pattern
- 3-layer event protection: MANDATORY for all command repositories
- Zod schemas: Format validation at API boundary
- Rate limiting: DoS protection on ALL endpoints

---

### Architecture Layer (12 patterns)

Cross-cutting architectural patterns spanning multiple layers.

| Pattern | Lines | Status | Description | Primary Users |
|---------|-------|--------|-------------|---------------|
| **[acl-registry-pattern.md](architecture/acl-registry-pattern.md)** | ~450 | Production | Cross-context communication without circular dependencies; batch calls to avoid N+1 across contexts | infrastructure-testing-implementer |
| **[user-projection-pattern.md](architecture/user-projection-pattern.md)** | 432 | Production | Each context has own `{context}_users` table, NO cross-context JOINs | infrastructure-testing-implementer |
| **[dual-identity-pattern.md](architecture/dual-identity-pattern.md)** | ~600 | Production | userId from JWT (RequestContext), NEVER from request body — Commands AND self-scoped Queries (SECURITY) | domain-application-implementer, infrastructure-testing-implementer |
| **[transactional-pattern.md](architecture/transactional-pattern.md)** | 412 | Production | @Transactional decorator, auto-commit/rollback | domain-application-implementer |
| **[bullmq-queue-pattern.md](architecture/bullmq-queue-pattern.md)** | 490 | Production | Async job processing with BullMQ | infrastructure-testing-implementer |
| **[integration-event-pattern.md](architecture/integration-event-pattern.md)** | ~800 | Production | Cross-context events via Outbox Pattern, NO PII, priority-based processing | domain-application-implementer, infrastructure-testing-implementer |
| **[entity-event-emission-pattern.md](architecture/entity-event-emission-pattern.md)** | 480 | Production | Manual domain event emission for Entities (non-Aggregates), eventPersistenceHandler + eventDispatcher | domain-application-implementer |
| **[golden-rule-endpoints.md](architecture/golden-rule-endpoints.md)** | ~120 | Production | GET /{resource} = public (approved only), GET /{resource}/my = owner (all statuses). ADR-0071 | infrastructure-testing-implementer, domain-application-implementer |
| **[cross-context-communication.md](architecture/cross-context-communication.md)** | ~200 | Production | Decision guide: ACL vs Integration Events vs queues for cross-context communication | All implementers |
| **[token-optimization-pattern.md](architecture/token-optimization-pattern.md)** | ~300 | Production | Token reduction settings, session quality, model selection strategy | All users |
| **[fresh-context-pattern.md](architecture/fresh-context-pattern.md)** | 553 | Production | Keep orchestrator lean (~15%), subagents fresh (~100% relevant), context rot detection | project-orchestrator, all agents |
| **[api-contract-sync-pattern.md](architecture/api-contract-sync-pattern.md)** | ~90 | Production | Cross-repo OpenAPI drift detection: backend vs mobile/web consumers, advisory-only | api-contract-sync skill |

**Architecture Layer Key Principles**:
- ACL Registry: `aclRegistry.getGlobalRequired<T>('context-name')` for cross-context calls
- User Projections: Each context maintains own user data (no circular dependencies)
- Dual Identity: CRITICAL security pattern (prevents user impersonation) — applies to self-scoped Query classes too, not just Commands (ARCH-D001)
- Transactions: Inherited from BaseCommandHandler/BaseKyselyRepository
- Queue Jobs: Async processing for long-running operations
- Integration Events: Cross-context communication with NO PII (only IDs/references), Outbox Pattern for transactional consistency
- Fresh Context: Orchestrator coordination (~15% context), subagents with focused context (~100% relevant), cross-session continuity via STATE.md

---

### Testing Layer (11 patterns)

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
| **[typed-projection-row-builder-pattern.md](testing/typed-projection-row-builder-pattern.md)** | ~250 | Production | Typed row-builder kolokowany przy repo dla cross-context projection tables bez repozytorium zapisu | infrastructure-testing-implementer |
| **[domain-colocated-fixture-mother-pattern.md](testing/domain-colocated-fixture-mother-pattern.md)** | ~200 | Production | Pure Mother (`*.mother.ts`) kolokowany w `domain/aggregates/__fixtures__/` buduje agregat przez publiczne `create()`; persystencja przez realny `repository.save()` via DI; kompozyt łączy Mother+save+typed row-buildery dla cross-context projekcji | infrastructure-testing-implementer |

**Testing Layer Key Principles**:
- Test Pyramid: L1 (unit) ~50%, L2 (integration) ~30%, L3 (E2E) ~20%
- Schema Testing: 6 categories (valid, required, type, format, boundaries, edge cases)
- Context Isolation: Each bounded context has isolated test database
- Hybrid Fixtures: Fixture non-tested flows, real implementation for tested flows
- Rate Limit Tests: ALWAYS in separate `*-rate-limits.e2e.spec.ts` files
- Redis Isolation: Use unique database index per test suite
- Mock Pattern: `createMock<T>()` from @golevelup/ts-vitest for ALL interface mocks — NEVER manual factory functions or `{ method: vi.fn() }` inline objects
- Projection Row-Builders: one typed builder per projection table, colocated with the repository that owns real writes — NEVER a shared dynamic-table-name builder across contexts
- Fixture Mothers: construction is a pure domain function through the aggregate's public `create()` — NEVER `as any` on props, NEVER `reconstituteFromPersistence()` as a construction shortcut; persistence is a separate `test/` layer via real `repository.save()`

---

### Cross-Layer Patterns (6 patterns)

Patterns used across all architectural layers.

| Pattern | Lines | Status | Description | Primary Users |
|---------|-------|--------|-------------|---------------|
| **[domain-errors-pattern.md](cross-layer/domain-errors-pattern.md)** | ~600 | Production | ErrorCode enum, Result pattern, hybrid error handling | All implementers |
| **[logger-pattern.md](cross-layer/logger-pattern.md)** | ~500 | Production | Structured logging, PII redaction, correlation IDs | All implementers |
| **[error-handler-chain-pattern.md](cross-layer/error-handler-chain-pattern.md)** | ~550 | Production | 9 specialized error handlers in Chain of Responsibility | infrastructure-testing-implementer |
| **[conventions-pattern.md](cross-layer/conventions-pattern.md)** | ~400 | Production | Naming conventions, file organization, module structure | All implementers |
| **[safe-error-propagation-pattern.md](cross-layer/safe-error-propagation-pattern.md)** | ~350 | Production | 3-layer defense against infra error leakage to HTTP (TS-SEC-011) | All implementers |
| **[security-invariants-pattern.md](cross-layer/security-invariants-pattern.md)** | — | Production | (pre-existing, previously missing from this index) | All implementers |
| **[snapshot-incremental-review-pattern.md](cross-layer/snapshot-incremental-review-pattern.md)** | ~90 | Production | Hash-per-item snapshot + diff for cheap incremental re-review | review-panel, api-contract-sync skills |

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

### Marketing Layer (1 pattern)

Patterns for marketing workflows and shared positioning context.

| Pattern | Lines | Status | Description | Primary Users |
|---------|-------|--------|-------------|---------------|
| **[product-marketing-context-pattern.md](marketing/product-marketing-context-pattern.md)** | ~160 | Production | Foundational `.agents/product-marketing-context.md` doc consumed by all 41 marketing skills (positioning, ICP, audience, voice, proof) | marketing-strategist + all skills/marketing/ |

**Marketing Layer Key Principles**:
- Single source of truth for product positioning — equivalent to `BUSINESS_RULES.yaml` for DDD
- Every marketing skill reads this file before asking questions (no fabrication)
- Verbatim customer language beats polished prose
- Skills: 41 vendored skills in `skills/marketing/` (CRO, copy, SEO, paid, growth, RevOps)
- Agent: `@marketing-strategist` (universal)
- Command: `/marketing <task>`

---

### Finance Layer (2 patterns)

Architectural patterns for finance workflows — large skill collections
with knowledge layering and regulatory exposure.

| Pattern | Lines | Status | Description | Primary Users |
|---------|-------|--------|-------------|---------------|
| **[layered-knowledge-pattern.md](finance/layered-knowledge-pattern.md)** | ~200 | Production | 2-D organization (plugin × layer) for 84 skills. Plugin axis = functional domain, Layer axis = knowledge depth (0..7). Generalizes to other large skill collections. | finance-strategist + all skills/finance/ |
| **[regulatory-disclaimer-pattern.md](finance/regulatory-disclaimer-pattern.md)** | ~180 | Production | Contextual disclaimer system — 6 categories with specific phrasing applied selectively. Replaces boilerplate "consult an advisor" deflections that get tuned out by users. | finance-strategist (primary), marketing-strategist (lighter variant) |

**Finance Layer Key Principles**:
- Plugin-aware vendoring: `skills/finance/<plugin>/<skill>/` preserves
  upstream dependency graph (compliance & advisory-practice depend on core/wealth-management)
- Data-driven hedged voice — "based on [evidence], the most viable approach
  appears to be X" — not paralyzing "I cannot give advice"
- Contextual disclaimers (6 categories) — applied only when regulatory risk
  warrants, never boilerplate
- Skills: 84 vendored skills in `skills/finance/` across 7 plugins
- Agent: `@finance-strategist` (universal, consulted by `@product-owner`)
- Command: `/finance <task>`
- Tests: `tests/finance-evals/` — vendored eval framework

---

### Legal Layer (2 patterns)

Architectural patterns for legal workflows — license-fragmented skill
ecosystems, jurisdiction-bound disclaimers, AGPL contamination prevention.

| Pattern | Lines | Status | Description | Primary Users |
|---------|-------|--------|-------------|---------------|
| **[jurisdiction-aware-disclaimer-pattern.md](legal/jurisdiction-aware-disclaimer-pattern.md)** | ~210 | Production | 4-category disclaimer system (educational, GDPR/privacy, contract drafting, litigation/dispute) calibrated to jurisdiction. Adds jurisdiction layer on top of finance's regulatory-disclaimer pattern. | legal-strategist (primary), finance-strategist (jurisdiction layer borrows) |
| **[external-skills-catalog-pattern.md](legal/external-skills-catalog-pattern.md)** | ~225 | Production | License-aware skill catalog: vendor compatible (MIT/Apache), catalog the rest (AGPL/proprietary) with install-yourself instructions. Sync script with `--verify-licenses` to detect upstream license drift. Generalizable to any license-fragmented ecosystem. | legal-strategist + sync-legal-skills.sh |

**Legal Layer Key Principles**:
- License-fragmented vendoring: only MIT/Apache-2.0 skills vendored;
  AGPL-3.0 skills cataloged in `EXTERNAL.md` with copyleft warnings
- Jurisdiction-aware analysis: PL/EU/US/FR/UK have meaningfully different
  rules; agent reads `.agents/legal-context.md` to know which apply
- Contextual disclaimers (4 categories) — only when category warrants,
  jurisdiction layer on top
- Refuses silent fabrication for non-vendored skill domains — surfaces
  upstream catalog entry instead
- Skills: 12 vendored skills in `skills/legal/` (1 MIT + 11 Apache 2.0)
- External: 30 cataloged in `skills/legal/EXTERNAL.md`
- Agent: `@legal-strategist` (universal, consulted by `@product-owner`)
- Command: `/legal <task>`

---

### AI/ML — GPU Inference (7 patterns, per-project)

Extracted from a live multi-model inference API (18 endpoints, RTX 5090 shared
with Ollama and ComfyUI). Linked via `patterns: [ai-ml]` or `stack_profile: python-ml`.

| Pattern | Status | Description |
|---------|--------|-------------|
| **model-lifecycle-pattern** | production | Lazy load, TTL tiers, VRAM preflight, LRU eviction, correct unload |
| **dynamic-batching-pattern** | production | Coalescing concurrent requests into GPU batches, partial-failure isolation |
| **gpu-concurrency-pattern** | production | `to_thread`, thread pool sizing, semaphores for thread-unsafe libraries |
| **inference-api-pattern** | production | `routers/` vs `models/` split, module contract, composite endpoints |
| **llm-integration-pattern** | production | Streaming, OpenAI-compatible surface, greedy decoding for tool calls |
| **ml-observability-pattern** | production | Cold vs warm latency, VRAM gauges, batch efficiency, alerting |
| **ml-testing-pattern** | production | Markers, stubbing at the module boundary, GPU-free coverage |

**Companion**: agents `ml-inference-architect` + `gpu-resource-verifier`,
skills `ai-ml/ml-inference-patterns`, `ai-ml/gpu-memory-budget`, `ai-ml/model-selection`,
hook `check-gpu-patterns.js`.

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

**Core Patterns**: 46
**Stack-Specific Patterns**: 35 (flutter, nextjs, python, sveltekit, typescript-library)
**Total**: 81
**Production Status**: 100% (all patterns verified in production code)

**Core Pattern Distribution**:
- Domain: 15% (7)
- Application: 11% (5)
- Infrastructure: 9% (4)
- Architecture: 26% (12)
- Testing: 24% (11)
- Cross-Layer: 13% (6)
- Orchestration: 2% (1)

---

## 🔄 Pattern Updates

**Version 3.11** (2026-08-10):
- Added infrastructure/geo-spatial-query-pattern.md + rule card + `rules/nestjs-ddd/geo-spatial-query.md`.
  Closes a real gap: `retrieve_patterns` returned NOTHING for PostGIS/geo queries in two separate
  analyses, so every bounded context touching geo invented its own predicate shape — five parallel
  implementations in one codebase, two production findings. Derived from
  `TS-GEO-SPATIAL-QUERY-AUDIT-001` (2026-07-29) and `-002` (2026-08), including the incident where
  `ST_DWithin` on `geometry` operands read metres as degrees and exposed 121/125 locally-scoped
  events nationwide for a week with a green test suite.
  Marked `project-specific (juz-ide)` per the "Promoting a Project Refactor" rule — the PostGIS
  mechanics generalise, but a second project must adopt the shape before promotion.
- Total patterns: 47 (was 46)

**Version 3.10** (2026-07-18):
- Removed application/quote-reservation-pattern.md and domain/config-policy-aggregate-pattern.md
  (+ their `_summary.md` rule cards) from the shared library — on review, both are genuinely
  specific to `juz-ide-api-1`'s reach/pricing domain, not generic nestjs-ddd guidance. Moved to
  `juz-ide-api-1/docs/tech/` (that project's own DDD pattern docs, alongside
  `ddd-implementation-patterns.md`). Supersedes the v3.9 `**Scope**: project-specific` tagging —
  the `scope`/`project` retrieve_patterns mechanism stays in place (see "Adding a New Pattern")
  for genuine future incubation cases, just unused right now.

**Version 3.9** (2026-07-13):
- Introduced the `**Scope**: project-specific (<project>)` convention (see "Adding a New Pattern"
  below) for patterns derived from a single project's codebase, not yet validated in a second one.
  `retrieve_patterns` now excludes `scope: project-specific` chunks by default; pass
  `project: "<name>"` to include a specific project's own patterns.
- Retroactively marked application/quote-reservation-pattern.md and
  domain/config-policy-aggregate-pattern.md as `project-specific (juz-ide-api-1)` — both are
  real production patterns but only observed in one codebase so far, not yet generic nestjs-ddd
  guidance. Re-classify as universal once a second project adopts the same shape.

**Version 3.8** (2026-07-13):
- Added application/quote-reservation-pattern.md (ephemeral persisted price quote, TTL +
  policyVersion, consumed atomically at commit via MIN(quoted, fresh) — never reserves
  resources at quote-creation time) + rule card. Derived from `TS-REACH-SYSTEM-001` decision D7.
- Added domain/config-policy-aggregate-pattern.md (whole-matrix config aggregate for
  admin-editable business rules — pricing tiers, rate limits — with cross-row Specifications,
  audit events, VO catalog injected not self-loaded) + rule card. Derived from decisions D1/D2.
- Extended architecture/dual-identity-pattern.md with Anti-Pattern 5: userId as a Query
  constructor field (not just Commands) is the same hijacking surface, one layer later. Real
  gap found live as `ARCH-D001` (22 Query classes across 5 bounded contexts). Also extended
  application/query-handler-pattern.md (Anti-Pattern 5) and `rules/nestjs-ddd/application-handlers.md`.
- Extended architecture/acl-registry-pattern.md with Anti-Pattern 4: per-item ACL round-trip
  instead of a batched call is N+1 across a bounded-context boundary — a real cost even inside
  a monolith. Derived from decision D6. Also extended `rules/nestjs-ddd/acl-registry.md`.
- Total patterns: 46 (was 44)

**Version 3.7** (2026-07-12):
- Added testing/domain-colocated-fixture-mother-pattern.md (pure Mother in `domain/aggregates/__fixtures__/` + real `repository.save()` via DI + composite for cross-context projections) — the Category 1 counterpart to `typed-projection-row-builder-pattern.md`'s Category 2, both introduced by the `TS-TEST-FIXTURE-001..006` series
- Refreshed testing/test-seeding-performance-guide.md (1.3 → 2.0): mode-selection guidance, decision trees, and quick-reference tables now point to the Mother/composite instead of the retired `UserIdentityFixture.createAsync()`/`.createSync()` API; corrected stale references to `FixtureRegistry` (deleted as dead code) and `AtomicCreators` (removed, not merely deprecated)
- Refreshed testing/e2e-hybrid-fixture-pattern.md: Pattern 2 (Fixture Helper Classes) now points to `user-identity-db-helpers.fixture.ts` instead of the legacy fixture class for the same use case (mutating a user created via real `POST /auth/register`)
- Total patterns: 44 (was 43)

**Version 3.6** (2026-07-12):
- Added testing/typed-projection-row-builder-pattern.md (typed row-builder colocated with the owning repository for cross-context projection tables with no local write path)
- Total patterns: 43 (was 42)

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
