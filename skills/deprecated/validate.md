---
name: validate
description: Quality Assurance & Gates Skill. Validates DDD patterns, test pyramid ratios, security compliance, and business rules. Enforces 2 VETO gates (business value, security) with blocking power.
tools: Read, Task
model: sonnet
---

# /validate - Quality Assurance & Gates Skill

## Overview

The `/validate` skill provides comprehensive validation capabilities for Claude Code's quality assurance system. It enforces DDD patterns, test pyramid ratios, security compliance, and business rules through 20 specifications (Phase 4) with 2 VETO gates.

**Core Capabilities**:
- Validate DDD pattern compliance (aggregates, value objects, events)
- Validate test pyramid ratios (L1 ~50%, L2 ~30%, L3 ~20%)
- Validate security compliance (OWASP Top 10, input validation)
- Enforce business gates (customer value, Full vs MVP)
- Enforce technical gates (BUSINESS_RULES.md sync, ADR compliance)
- Execute VETO gates (business, security) with blocking power
- Pre-execution validation (Phase 4 - 20 specifications)

**Integration**: Used by `/workflow` skill at phases 1 (business gate), 8 (quality gate), and 9 (security gate with VETO).

---

## API Contract

### `/validate ddd-compliance`

**Purpose**: Validate DDD pattern compliance in code.

**Signature**:
```bash
/validate ddd-compliance <files> [--options]
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `files` | glob | yes | Files to validate |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--strict` | boolean | false | Fail on warnings (not just errors) |
| `--patterns` | string[] | all | Specific patterns to check |

**Examples**:
```bash
# Validate all domain aggregates
/validate ddd-compliance "src/contexts/**/domain/aggregates/*.ts"

# Validate with strict mode
/validate ddd-compliance "src/contexts/payment/**/*.ts" --strict

# Validate specific patterns only
/validate ddd-compliance "src/contexts/auth/**/*.ts" \
  --patterns=aggregate-pattern,value-object-pattern
```

**Output**:
```
╔════════════════════════════════════════╦═══════════╦═══════════╦══════════╗
║ Check                                  ║ Status    ║ Files     ║ Issues   ║
╠════════════════════════════════════════╬═══════════╬═══════════╬══════════╣
║ Aggregate factory methods              ║ ✅ PASS   ║ 12/12     ║ 0        ║
║ Result pattern usage                   ║ ✅ PASS   ║ 12/12     ║ 0        ║
║ GDPR event segregation                 ║ ⚠️ WARN   ║ 11/12     ║ 1        ║
║ Audit fields (RequestContextService)   ║ ❌ FAIL   ║ 9/12      ║ 3        ║
║ PolicyBuilder pattern                  ║ ✅ PASS   ║ 8/8       ║ 0        ║
║ No cross-context imports               ║ ✅ PASS   ║ 12/12     ║ 0        ║
╚════════════════════════════════════════╩═══════════╩═══════════╩══════════╝

Details:

⚠️  WARN: payment.aggregate.ts (line 87)
   - GDPR event missing 'cryptoShredding' field
   - Impact: GDPR compliance risk (low - data can still be deleted)

❌ FAIL: refund.aggregate.ts (line 42)
   - Audit field 'createdBy' from command parameter
   - Expected: RequestContextService.getRequiredUserId()
   - Pattern: dual-identity-pattern

❌ FAIL: subscription.aggregate.ts (line 89)
   - Audit field 'updatedBy' from request body
   - Expected: RequestContextService.getRequiredUserId()

❌ FAIL: invoice.aggregate.ts (line 112)
   - Audit field 'deletedBy' hardcoded to userId parameter
   - Expected: RequestContextService.getRequiredUserId()

Compliance: 75% (9/12 critical checks pass)
Recommendation: Fix 3 audit field violations before merging
```

**Validation Checks**:
| Category | Checks | Severity |
|----------|--------|----------|
| Aggregates | Factory methods, Result pattern, GDPR events, Audit fields | Critical |
| Value Objects | Immutability, validation, reconstruction | Critical |
| Domain Events | EventMap registration, GDPR segregation, correlation IDs | Critical |
| Handlers | Dual Identity, @Transactional, ACL Registry usage | Critical |
| Repositories | 3-layer event protection, CQRS separation | Critical |
| Cross-cutting | No cross-context imports, Result pattern, LocalHeroErrorCode | Critical |

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `FILES_NOT_FOUND` | 404 | No files match glob pattern |
| `PARSE_ERROR` | 422 | Failed to parse TypeScript files |

---

### `/validate test-pyramid`

**Purpose**: Validate test pyramid ratios (L1 ~50%, L2 ~30%, L3 ~20%).

**Signature**:
```bash
/validate test-pyramid [<context>] [--options]
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `context` | string | no | Specific bounded context (omit for all) |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--tolerance` | number | 10 | Acceptable deviation % (e.g., 10 = ±10%) |
| `--fail-on-missing` | boolean | true | Fail if any layer has 0 tests |

**Examples**:
```bash
# Validate all contexts
/validate test-pyramid

# Validate specific context
/validate test-pyramid auth

# With custom tolerance
/validate test-pyramid payment --tolerance=15
```

**Output**:
```
╔════════════════════════════════════════╦═══════╦═══════════╦═══════════╦═══════════╗
║ Context                                ║ L1    ║ L2        ║ L3        ║ Status    ║
╠════════════════════════════════════════╬═══════╬═══════════╬═══════════╬═══════════╣
║ auth                                   ║ 48%   ║ 32%       ║ 20%       ║ ✅ PASS   ║
║ authorization                          ║ 52%   ║ 28%       ║ 20%       ║ ✅ PASS   ║
║ geographic-auth                        ║ 47%   ║ 31%       ║ 22%       ║ ✅ PASS   ║
║ community-communication                ║ 35%   ║ 25%       ║ 40%       ║ ❌ FAIL   ║
║ engagement                             ║ 55%   ║ 30%       ║ 15%       ║ ⚠️ WARN   ║
║ payment                                ║ 0%    ║ 0%        ║ 100%      ║ ❌ FAIL   ║
╚════════════════════════════════════════╩═══════╩═══════════╩═══════════╩═══════════╝

Target Ratios: L1 ~50% (±10%), L2 ~30% (±10%), L3 ~20% (±10%)

Details:

❌ FAIL: community-communication
   - L1: 35% (target: 50% ±10%) - 15% UNDER
   - L2: 25% (target: 30% ±10%) - 5% UNDER
   - L3: 40% (target: 20% ±10%) - 20% OVER
   - Recommendation: Add 15 L1 unit tests, add 5 L2 integration tests, remove 5 E2E tests

⚠️  WARN: engagement
   - L1: 55% (target: 50% ±10%) - 5% OVER (acceptable)
   - L3: 15% (target: 20% ±10%) - 5% UNDER (acceptable)
   - Recommendation: Consider adding 3 E2E tests for critical paths

❌ FAIL: payment
   - L1: 0% - MISSING CRITICAL LAYER
   - L2: 0% - MISSING CRITICAL LAYER
   - L3: 100% - E2E ONLY (anti-pattern)
   - Recommendation: Implement L1/L2 tests IMMEDIATELY (test pyramid inverted)

Overall Compliance: 3/6 contexts pass (50%)
Blocker: payment context has inverted pyramid - MUST fix before production
```

**Validation Logic**:
- L1 (Unit): 50% ± tolerance
- L2 (Integration): 30% ± tolerance
- L3 (E2E): 20% ± tolerance
- Missing layer = FAIL (unless tolerance allows 0%)
- Inverted pyramid (L3 > L1) = CRITICAL FAIL

**Error Cases**: None (reports empty stats if no tests found)

---

### `/validate security`

**Purpose**: Validate security compliance (OWASP Top 10).

**Signature**:
```bash
/validate security <files> [--options]
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `files` | glob | yes | Files to validate |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--owasp-only` | boolean | false | Check OWASP Top 10 only (skip other checks) |
| `--severity` | enum | `all` | `critical`, `high`, `medium`, `low`, `all` |

**Examples**:
```bash
# Validate all security issues
/validate security "src/contexts/auth/**/*.ts"

# OWASP Top 10 only
/validate security "src/contexts/payment/**/*.ts" --owasp-only

# Critical severity only
/validate security "src/app/api/**/*.ts" --severity=critical
```

**Output**:
```
╔════════════════════════════════════════╦══════════╦══════════╦══════════╗
║ OWASP Category                         ║ Issues   ║ Severity ║ Status   ║
╠════════════════════════════════════════╬══════════╬══════════╬══════════╣
║ A01:2021 - Broken Access Control       ║ 0        ║ -        ║ ✅ PASS  ║
║ A02:2021 - Cryptographic Failures      ║ 1        ║ High     ║ ⚠️ WARN  ║
║ A03:2021 - Injection                   ║ 0        ║ -        ║ ✅ PASS  ║
║ A04:2021 - Insecure Design             ║ 0        ║ -        ║ ✅ PASS  ║
║ A05:2021 - Security Misconfiguration   ║ 2        ║ Medium   ║ ⚠️ WARN  ║
║ A06:2021 - Vulnerable Components       ║ 0        ║ -        ║ ✅ PASS  ║
║ A07:2021 - Auth Failures               ║ 0        ║ -        ║ ✅ PASS  ║
║ A08:2021 - Data Integrity Failures     ║ 0        ║ -        ║ ✅ PASS  ║
║ A09:2021 - Logging Failures            ║ 1        ║ Low      ║ ⚠️ WARN  ║
║ A10:2021 - SSRF                        ║ 0        ║ -        ║ ✅ PASS  ║
╚════════════════════════════════════════╩══════════╩══════════╩══════════╝

Details:

⚠️  HIGH: A02:2021 - Cryptographic Failures
File: src/contexts/payment/infrastructure/external/payment-gateway.adapter.ts:45
Issue: API key hardcoded in source code
Recommendation: Move to environment variables (.env file)

⚠️  MEDIUM: A05:2021 - Security Misconfiguration
File: src/contexts/auth/infrastructure/controllers/login.controller.ts:89
Issue: Detailed error messages expose system internals
Recommendation: Use generic error messages, log details server-side

⚠️  MEDIUM: A05:2021 - Security Misconfiguration
File: src/app/main.ts:12
Issue: CORS configured with wildcard origin (*)
Recommendation: Whitelist specific domains

⚠️  LOW: A09:2021 - Logging Failures
File: src/contexts/auth/application/commands/login/handler.ts:67
Issue: Login failures not logged (audit trail missing)
Recommendation: Add structured logging for security events

OWASP Compliance: 7/10 categories pass (70%)
Blocker: None (1 HIGH severity issue - fix recommended before production)
```

**Security Checks**:
- OWASP Top 10 (2021)
- Input validation (Zod schemas, SQL injection prevention)
- Authentication/Authorization (JWT validation, RBAC checks)
- Secrets management (no hardcoded keys, env vars)
- PII handling (GDPR compliance, encryption at rest)

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `FILES_NOT_FOUND` | 404 | No files match glob pattern |
| `PARSE_ERROR` | 422 | Failed to parse TypeScript files |

---

### `/validate business-gate`

**Purpose**: Execute business validation gate (VETO gate).

**Signature**:
```bash
/validate business-gate <task-file> [--options]
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `task-file` | string | yes | Task file path (e.g., TS-XXX.md) |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--segment` | enum | required | `b2c`, `b2b`, `b2g` |
| `--scope` | enum | required | `full`, `mvp` |

**Examples**:
```bash
# Validate business gate for B2C feature
/validate business-gate project-orchestration/tasks/TS-USER-001.md \
  --segment=b2c \
  --scope=full

# Validate MVP scope
/validate business-gate project-orchestration/tasks/TS-QUICK-JOB-003.md \
  --segment=b2c \
  --scope=mvp
```

**Output**:
```
╔════════════════════════════════════════╦═══════════╦══════════════════════╗
║ Check                                  ║ Status    ║ Details              ║
╠════════════════════════════════════════╬═══════════╬══════════════════════╣
║ Customer segment validated             ║ ✅ PASS   ║ B2C                  ║
║ Problem validated (Mom Test)           ║ ✅ PASS   ║ Evidence provided    ║
║ Full vs MVP justified                  ║ ✅ PASS   ║ Full scope justified ║
║ Target metrics defined                 ║ ✅ PASS   ║ 3 metrics tracked    ║
║ Success criteria measurable            ║ ✅ PASS   ║ Clear definitions    ║
╚════════════════════════════════════════╩═══════════╩══════════════════════╝

Business Gate: ✅ APPROVED

Task: TS-USER-001 (User Profile Feature)
Segment: B2C
Scope: Full
Justification: Strategic feature for user engagement (core product)

Validation Details:
- Customer Segment: B2C neighbors (Starachowice residents)
- Problem: Users want to share personal info (bio, avatar, contact) for trust building
- Mom Test Evidence: 15 interviews, 80% requested this feature
- Target Metrics:
  1. 60% users complete profile within 30 days
  2. Profile completeness correlates with 2x engagement
  3. Trust scores 15% higher for users with complete profiles
- Success Criteria:
  1. Profile creation works end-to-end
  2. GDPR compliance (data export, deletion)
  3. Test coverage ≥85%

VETO Decision: NO VETO (proceed with implementation)

Next Phase: Task analysis (@localhero-project-orchestrator)
```

**VETO Conditions** (Agent: @customer-value-guardian):
- ❌ VETO if customer segment not validated (B2C/B2B/B2G)
- ❌ VETO if no Mom Test evidence (interviews, surveys, data)
- ❌ VETO if Full scope without justification (should be MVP)
- ❌ VETO if no measurable success criteria
- ✅ APPROVE if all checks pass

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `TASK_FILE_NOT_FOUND` | 404 | Task file doesn't exist |
| `SEGMENT_MISSING` | 400 | --segment flag required |
| `SCOPE_MISSING` | 400 | --scope flag required |
| `VETO_INVOKED` | 403 | Business gate failed (blocked by VETO) |

---

### `/validate quality-gate`

**Purpose**: Execute combined quality/security gate (VETO gate).

**Signature**:
```bash
/validate quality-gate <workflow-id> [--options]
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `workflow-id` | string | yes | Workflow ID to validate |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--skip-tests` | boolean | false | Skip test execution (validate code only) |
| `--skip-security` | boolean | false | Skip security checks (quality only) |

**Examples**:
```bash
# Full quality + security gate
/validate quality-gate wf-2026-01-12-abc123

# Quality only (skip security)
/validate quality-gate wf-2026-01-12-abc123 --skip-security

# Code review only (skip test execution)
/validate quality-gate wf-2026-01-12-abc123 --skip-tests
```

**Output**:
```
╔════════════════════════════════════════╦═══════════╦══════════════════════╗
║ Gate                                   ║ Status    ║ Details              ║
╠════════════════════════════════════════╬═══════════╬══════════════════════╣
║ DDD Compliance                         ║ ✅ PASS   ║ 100% compliant       ║
║ Test Pyramid Ratios                    ║ ✅ PASS   ║ L1 48%, L2 32%, L3 20%║
║ Test Execution                         ║ ✅ PASS   ║ 87/87 tests passing  ║
║ BUSINESS_RULES.md Updated              ║ ✅ PASS   ║ Synced               ║
║ Security (OWASP)                       ║ ⚠️ WARN   ║ 1 medium issue       ║
║ E2E Tests                              ║ ✅ PASS   ║ 16/16 E2E passing    ║
╚════════════════════════════════════════╩═══════════╩══════════════════════╝

Quality Gate: ✅ APPROVED (with warnings)

Workflow: wf-2026-01-12-abc123 (TS-USER-001 Implementation)
Phase: 9 (Security & E2E Verification)

Quality Summary:
- Files Created: 23
- Tests Added: 87 (L1: 42, L2: 29, L3: 16)
- Test Coverage: 94.2%
- DDD Patterns: 100% compliant
- Security Issues: 1 medium (CORS wildcard)

Security Warning:
⚠️  MEDIUM: A05:2021 - Security Misconfiguration
File: src/app/main.ts:12
Issue: CORS configured with wildcard origin (*)
Recommendation: Whitelist specific domains before production

VETO Decision: NO VETO (proceed, fix CORS before production)

Next Phase: Documentation (@documentation-writer)
```

**VETO Conditions** (Agent: @security-e2e-verifier):
- ❌ VETO if critical security issues (OWASP critical)
- ❌ VETO if E2E tests failing (> 5% failure rate)
- ❌ VETO if test pyramid inverted (L3 > L1)
- ❌ VETO if BUSINESS_RULES.md not updated
- ⚠️  WARN if non-critical issues (proceed with warnings)
- ✅ APPROVE if all critical checks pass

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `WORKFLOW_NOT_FOUND` | 404 | Workflow ID doesn't exist |
| `VETO_INVOKED` | 403 | Quality gate failed (blocked by VETO) |

---

### `/validate pre-execution`

**Purpose**: Pre-execution validation (Phase 4 - 20 specifications).

**Signature**:
```bash
/validate pre-execution <workflow-id> <phase> [--options]
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `workflow-id` | string | yes | Workflow ID |
| `phase` | number | yes | Phase number (1-11) |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--specs` | string[] | all | Specific specifications to check |
| `--fail-fast` | boolean | false | Stop on first violation |

**Examples**:
```bash
# Validate all specs before phase execution
/validate pre-execution wf-2026-01-12-abc123 4

# Validate specific specs only
/validate pre-execution wf-2026-01-12-abc123 5 \
  --specs=TestPyramidRatios,BusinessRulesSynced

# Fail-fast mode
/validate pre-execution wf-2026-01-12-abc123 1 --fail-fast
```

**Output**:
```
╔════════════════════════════════════════╦═══════════╦══════════════════════╗
║ Specification                          ║ Status    ║ Details              ║
╠════════════════════════════════════════╬═══════════╬══════════════════════╣
║ BusinessGateMustPass                   ║ ✅ PASS   ║ Phase 1 approved     ║
║ VETOPowerLimit                         ║ ✅ PASS   ║ 2/2 VETO agents      ║
║ TestPyramidRatios                      ║ ✅ PASS   ║ Within tolerance     ║
║ BusinessRulesSynced                    ║ ❌ FAIL   ║ Not updated          ║
║ NoCrossContextImports                  ║ ✅ PASS   ║ No violations        ║
║ OrchestratorCannotImplement            ║ ✅ PASS   ║ No Write tool access ║
╚════════════════════════════════════════╩═══════════╩══════════════════════╝

Pre-Execution Validation: ❌ FAILED

Workflow: wf-2026-01-12-abc123
Phase: 4 (Domain Layer Implementation)

Violations:

❌ CRITICAL: BusinessRulesSynced
   - BUSINESS_RULES.md not updated since phase 2
   - Last modified: 2026-01-12 10:00:00
   - Expected: Updated after domain implementation
   - Action Required: Update BUSINESS_RULES.md before proceeding

Estimated Validation Cost: 300 tokens
Estimated Re-Work Cost (if not validated): 5,000-60,000 tokens

Recommendation: Fix BusinessRulesSynced violation before phase execution
ROI: 98% token savings (300 vs 5-60K re-work)

Block Execution: YES (critical violation)
```

**20 Specifications** (Phase 4):
| Category | Specifications | Count |
|----------|---------------|-------|
| Business | BusinessGateMustPass, VETOPowerLimit, FullVsMVPJustified, SegmentValidated, MomTestEvidence | 5 |
| Technical | TestPyramidRatios, BusinessRulesSynced, NoCrossContextImports, NoDirectDomainExceptions, RepositoryEventRegistration, ADRCompliance, ModuleOrganization | 7 |
| Agent Behavior | OrchestratorCannotImplement, ImplementationMustDelegate, ExplorationMustUseHaiku, AgentToolAccess | 4 |
| Token Management | PhaseTokenBudget, MustCloseContextAfterPhase, SummaryOnlyReturn, WorkflowSpecificKnowledge | 4 |

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `WORKFLOW_NOT_FOUND` | 404 | Workflow ID doesn't exist |
| `PHASE_INVALID` | 400 | Phase number out of range |
| `SPEC_NOT_FOUND` | 404 | Specification name doesn't exist |
| `VALIDATION_BLOCKED` | 422 | Critical violations - execution blocked |

---

## Integration with Other Skills

### `/workflow` Skill
- Called at phases 1 (business-gate), 8 (quality review), 9 (quality-gate with VETO)
- Pre-execution validation before each phase (Phase 4)

### `/knowledge` Skill
- Uses pattern definitions for DDD compliance checks
- Validates pattern usage in implementations

### `/agent-registry` Skill
- Validates VETO power limits (max 2 agents)
- Validates agent tool access permissions

---

## Usage Examples

### Example 1: Business Gate (Phase 1)
```bash
# User wants to implement "Quick Job Bidding" feature
# Hook delegates to @localhero-project-orchestrator
# Orchestrator triggers business gate validation

/validate business-gate project-orchestration/tasks/TS-QUICK-JOB-003.md \
  --segment=b2c \
  --scope=mvp

# Output:
❌ VETO INVOKED - Business Gate BLOCKED

Reason: Full vs MVP not justified
Issue: Task proposes Full implementation without MVP justification
Evidence: No user research for "auto-accept bid" feature

Customer Value Guardian (@customer-value-guardian) Decision:
This feature should start as MVP:
- MVP: Manual bid acceptance only
- Full (v2): Auto-accept based on trust score (requires validation)

Action Required: Revise task to MVP scope OR provide Mom Test evidence

Workflow Status: PAUSED (awaiting business approval)
```

### Example 2: Quality Gate (Phase 9)
```bash
# After implementation, before documentation
# Workflow triggers quality + security gate

/validate quality-gate wf-2026-01-12-abc123

# Output:
❌ VETO INVOKED - Quality Gate BLOCKED

Critical Issues:
1. Test pyramid inverted: L3 (45%) > L1 (35%)
2. E2E test failure rate: 12.5% (2/16 tests failing)
3. BUSINESS_RULES.md not updated (critical)

Security E2E Verifier (@security-e2e-verifier) Decision:
Implementation does not meet quality standards.

Action Required:
1. Add 15 L1 unit tests (aggregate + value object tests)
2. Fix 2 failing E2E tests
3. Update BUSINESS_RULES.md with new business rules

Workflow Status: BLOCKED (fix issues before proceeding)
```

### Example 3: Pre-Execution Validation (Phase 4)
```bash
# Before starting domain layer implementation
# Workflow checks all pre-conditions

/validate pre-execution wf-2026-01-12-abc123 4

# Output:
✅ Pre-Execution Validation PASSED

All 6 applicable specifications validated:
- BusinessGateMustPass ✅
- VETOPowerLimit ✅
- NoCrossContextImports ✅
- OrchestratorCannotImplement ✅
- PhaseTokenBudget ✅ (12K / 15K used)
- WorkflowSpecificKnowledge ✅ (10 patterns loaded)

Validation Cost: 280 tokens
Estimated Prevention: ~8,500 tokens (avg re-work cost)
ROI: 97% savings

Phase Execution: APPROVED
Agent Assignment: @domain-application-implementer
```

---

## Success Criteria

### Phase 2 (Current)
- ✅ API contract documented (this file)
- ✅ 6 operations specified (ddd-compliance, test-pyramid, security, business-gate, quality-gate, pre-execution)
- ✅ VETO gate logic defined
- ✅ Integration points identified

### Phase 4 (Specifications)
- ⏳ 20 specifications implemented
- ⏳ Pre-execution validation integrated with workflow
- ⏳ 90% error prevention rate (historical analysis)
- ⏳ 98% token savings (validation cost vs re-work cost)

---

## Implementation Notes

**Phase 2 Tasks Remaining**:
- Implement skill logic (Task 2.5)
- Register skill in `.claude/slash-commands.json`
- Integration testing (Task 2.7)

**Phase 4 Specifications** (to be implemented):
- `.claude/meta-domain/specifications/` (20 specification files)
- `.claude/meta-domain/specification-registry.ts` (concept)
- Integration with `/workflow` skill for pre-execution checks

**Technical Debt**:
- Automated fix suggestions (for common violations)
- Pattern violation auto-fix (safe transformations)
- Historical error analysis (which specs would have prevented errors)

---

**Version History**:
- 1.0.0 (2026-01-12): Initial design (Phase 2, TS-CLAUDE-001)
