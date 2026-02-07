# Testing Pyramid Pattern

## 🎯 Problem

**Test suites need balanced distribution between unit, integration, and E2E tests for fast feedback and comprehensive coverage.**

In testing strategies:
- Too many E2E tests → slow CI/CD, long feedback loops
- Too few unit tests → business rules not thoroughly tested
- Redundant testing → same rules tested at multiple levels
- No clear guidance → developers write wrong test type for scenario

**Real Cost**: E2E test suite taking 10+ minutes vs 30 seconds for unit tests.

## ✅ Solution

**Specification-First Testing Pyramid** with clear distribution: L1 ~50%, L2 ~30%, L3 ~20%.

**Key Principle**: Test business rules at LOWEST level possible (Specifications), use higher levels for integration/system concerns only.

## 🔧 Implementation

### Pyramid Levels (6 Levels)

```
┌─────────────────────────────────────────────────────────────────────┐
│ LEVEL 6: PRODUCTION MONITORING (Observability)                      │
│ • Synthetic monitoring, APM, Error tracking, Business metrics       │
│ Frequency: CONTINUOUS                                               │
├─────────────────────────────────────────────────────────────────────┤
│ LEVEL 5: RELEASE GATE TESTS (Pre-Production)                        │
│ • Smoke Tests (~5 min) - System boots, critical endpoints           │
│ • Load Tests (~30 min) - 100 concurrent users, response time SLA    │
│ Frequency: PER RELEASE / QUARTERLY                                  │
├─────────────────────────────────────────────────────────────────────┤
│ LEVEL 4: SECURITY TESTS (Specialized)                               │
│ • OWASP Top 10 Automated (ZAP)                                      │
│ • Penetration Tests (Manual + Burp Suite)                           │
│ Frequency: WEEKLY / PER RELEASE                                     │
├─────────────────────────────────────────────────────────────────────┤
│ LEVEL 3: E2E / API TESTS (~20% of test suite)                       │
│ • Authentication (401) - Token validation                           │
│ • Authorization (403) - Role/permission access                      │
│ • Rate Limiting (429) - SEPARATE files                              │
│ • Happy Path (200/201) - Core workflows                             │
│ Frequency: EVERY PR          Execution: < 3 min                     │
├─────────────────────────────────────────────────────────────────────┤
│ LEVEL 2: INTEGRATION TESTS (~30% of test suite)                     │
│ • Handler Integration - Orchestration, event publishing             │
│ • Repository Integration - Save/load, transactions, mapping         │
│ Frequency: EVERY PR          Execution: < 2 min                     │
├─────────────────────────────────────────────────────────────────────┤
│ LEVEL 1: UNIT TESTS - FOUNDATION (~50% of test suite)               │
│ • Specifications (~40%) - ALL business rules exhaustively           │
│ • Aggregates (~20%) - State transitions, event emission             │
│ • Value Objects (~15%) - Creation, equality, behavior               │
│ • Schema Validation (~25%) - 6-category tests                       │
│ Frequency: EVERY PR          Execution: < 30 sec                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Test Distribution Table

| Level | Test Type | Coverage | Time | Frequency |
|-------|-----------|----------|------|-----------|
| **L1** | Unit (Specs, Aggregates, VOs) | ~50% | < 30s | Every PR |
| **L2** | Integration (Handlers, Repos) | ~30% | < 2min | Every PR |
| **L3** | E2E / API | ~20% | < 3min | Every PR |
| **L4** | Security | Critical | ~30min | Weekly |
| **L5** | Release Gate | System | Varies | Per Release |
| **L6** | Monitoring | Prod | Realtime | Continuous |

### Test Placement Rules

| What to Test | Where to Test | Rationale |
|--------------|---------------|-----------|
| **Business rules** | L1: Specification Unit Tests | Reusable, fast, exhaustive |
| **Aggregate state changes** | L1: Aggregate Unit Tests | Verify spec integration |
| **Input format validation** | L1: Schema Unit Tests | ADR-0021 trusted boundary |
| **Handler orchestration** | L2: Integration Tests | Verify wiring, not logic |
| **API contract & auth** | L3: E2E Tests | Real HTTP, real auth |
| **Security vulnerabilities** | L4: Security Tests | Specialized tools |
| **System resilience** | L5: Release Gate | Pre-production only |
| **Production health** | L6: Monitoring | Continuous |

### Real Project Distribution

**Auth Context** (279 tests total):
- L1 Unit: 186 tests (67%) - Specifications, aggregates, VOs
- L2 Integration: 65 tests (23%) - Handlers, repositories
- L3 E2E: 28 tests (10%) - API endpoints

**Geographic-Auth Context** (493 tests total):
- L1 Unit: 312 tests (63%) - Specifications, aggregates, VOs, schemas
- L2 Integration: 125 tests (25%) - Handlers, repositories
- L3 E2E: 56 tests (12%) - API endpoints, geographic queries

**Engagement Context** (301 tests total):
- L1 Unit: 189 tests (63%) - Specifications, aggregates, VOs
- L2 Integration: 82 tests (27%) - Handlers, repositories
- L3 E2E: 30 tests (10%) - API endpoints

## 📋 Rules

### MUST

- ✅ **MUST** test ALL business rules at L1 (Specifications)
- ✅ **MUST** maintain ~50% L1, ~30% L2, ~20% L3 distribution
- ✅ **MUST** run L1+L2 tests on EVERY PR (< 3 min total)
- ✅ **MUST** separate rate limit tests into own files (`*-rate-limits.e2e.spec.ts`)
- ✅ **MUST** update BUSINESS_RULES.md with test column markers

### MUST NOT

- ❌ **MUST NOT** test business rules at L3 (use L1 Specifications)
- ❌ **MUST NOT** write E2E tests for all edge cases (exhaustive testing at L1)
- ❌ **MUST NOT** mix rate limit tests with functional tests (separate files)
- ❌ **MUST NOT** skip L1 tests (foundation of pyramid)

## ⚠️ Anti-Patterns

### Anti-Pattern 1: Business Rules in E2E Tests

```typescript
// ❌ WRONG: Testing all business rule edge cases at E2E level
describe('Create Event E2E', () => {
  it('should reject event with start date in past', async () => { ... });
  it('should reject event with end date before start date', async () => { ... });
  it('should reject event with duration > 24 hours', async () => { ... });
  it('should reject event with capacity < 1', async () => { ... });
  it('should reject event with capacity > 10000', async () => { ... });
  // 20+ more edge cases...
});
```

**Why Bad**: Slow E2E tests for rules already covered by L1 Specifications.

**Fix**: Test business rules at L1 (Specification), use L3 for happy path + auth only.

### Anti-Pattern 2: Inverted Pyramid

```typescript
// ❌ WRONG: Too many E2E tests, too few unit tests
// L1 Unit: 20 tests (10%)
// L2 Integration: 30 tests (15%)
// L3 E2E: 150 tests (75%) ← INVERTED!
```

**Why Bad**: Slow feedback loop, high maintenance cost, brittle tests.

**Fix**: Move business logic tests to L1 Specifications, keep E2E for API contract only.

### Anti-Pattern 3: Mixed Rate Limit Tests

```typescript
// ❌ WRONG: Rate limiting mixed with functional tests
describe('User Registration E2E', () => {
  it('should register user successfully', async () => { ... });
  it('should rate limit registration attempts', async () => { ... }); // Mixed!
});
```

**Why Bad**: Rate limit tests affect other tests (429 errors), hard to debug.

**Fix**: Separate file `user-registration-rate-limits.e2e.spec.ts`.

### Anti-Pattern 4: No L1 Foundation

```typescript
// ❌ WRONG: Skipping L1 Specification tests
// Only testing business rules at L2 (Handler) or L3 (E2E)
describe('CreateEventHandler', () => {
  it('should reject past start date', async () => { ... }); // Should be L1 Spec!
});
```

**Why Bad**: Business rules not reusable, tested only in one handler.

**Fix**: Create L1 Specification tests FIRST, then verify spec usage in L2 Handler tests.

## 📚 References

### ADRs
- **ADR-0035**: Specification-First Testing Strategy (this pattern's foundation)
- **ADR-0021**: Validation Layer Separation

### Related Patterns
- **Specification Pattern**: Testing business rules at L1
- **Schema Testing Pattern**: L1 format validation (6 categories)

### Implementation Files
- `test/shared/E2E_TESTING_GUIDE.md` - E2E best practices
- `contexts/*/BUSINESS_RULES.md` - Test column tracking (L1-Spec, L1-Agg, L2-Hdl)

### Real Examples
- `src/contexts/auth/domain/specifications/__tests__/*.spec.ts` - L1 Specification tests
- `src/contexts/auth/application/commands/__tests__/*.spec.ts` - L2 Handler integration tests
- `test/app/api/auth/*.e2e.spec.ts` - L3 E2E API tests

## 🎯 When to Use

**Use Testing Pyramid Pattern for:**

1. ✅ **ALL bounded contexts** (consistent test distribution)
2. ✅ **Feature development** (write L1 Specs first)
3. ✅ **CI/CD optimization** (fast feedback with L1+L2)

### Decision Tree

```
What are you testing?
├─ Business rule (YES/NO validation)?
│  └─ L1: Specification Unit Test ✅
│
├─ Aggregate state transition?
│  └─ L1: Aggregate Unit Test ✅
│
├─ Input format (email, UUID, length)?
│  └─ L1: Schema Unit Test ✅
│
├─ Handler orchestration (multiple operations)?
│  └─ L2: Handler Integration Test ✅
│
├─ API contract (HTTP status, response shape)?
│  └─ L3: E2E API Test ✅
│
├─ Authentication/Authorization?
│  └─ L3: E2E API Test ✅
│
├─ Rate limiting?
│  └─ L3: E2E API Test (SEPARATE file) ✅
│
└─ Security vulnerability (XSS, SQL injection)?
   └─ L4: Security Test ✅
```

### BUSINESS_RULES.md Integration

**Track test coverage in BUSINESS_RULES.md**:

```markdown
| BR ID | Policy Type | L1-Spec | L1-Agg | L1-Sch | L2-Hdl | L3-E2E | L4-Sec | L5-Gate | L6-Mon |
|-------|-------------|---------|--------|--------|--------|--------|--------|---------|--------|
| BR-GEO-001 | Validation | ✅ | ✅ | - | ✅ | ✅ | - | - | ✅ |
| BR-GEO-002 | Validation | ✅ | ✅ | - | ✅ | - | - | - | - |
```

**Column Meanings**:
- **L1-Spec**: Specification unit test exists
- **L1-Agg**: Aggregate uses specification (unit test)
- **L1-Sch**: Schema validation test (6 categories)
- **L2-Hdl**: Handler integration test
- **L3-E2E**: E2E API test (happy path + auth)
- **L4-Sec**: Security test (OWASP, penetration)
- **L5-Gate**: Release gate test (smoke, load, stress)
- **L6-Mon**: Production monitoring (APM, synthetic)

### Execution Time Targets

| Level | Target | Actual (Project) | Status |
|-------|--------|-------------------|--------|
| **L1** | < 30s | ~15s (1,200+ tests) | ✅ Optimal |
| **L2** | < 2min | ~45s (400+ tests) | ✅ Optimal |
| **L3** | < 3min | ~2min (150+ tests) | ✅ Optimal |
| **Total (L1+L2+L3)** | < 5min | ~3min | ✅ Fast feedback |

---

**Pattern Type**: Testing Strategy (MANDATORY for all contexts)
**Status**: Production-enforced (ADR-0035)
**Lines**: 234
