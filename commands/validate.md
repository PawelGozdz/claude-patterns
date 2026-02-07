# /validate - Quality Assurance & Gates Skill

**Version**: 1.0.0 (Phase 2 - Basic Implementation)
**Status**: Active
**Full API**: See `.claude/skills/validate.md` for complete specification

---

## Quick Reference

```bash
/validate ddd-compliance --in=<file>          # Check DDD patterns
/validate test-pyramid [--context=<context>]  # Check test ratios
/validate security --scope=<files>            # Security audit
/validate business-gate --task=<task-id>      # Phase 1 VETO gate
/validate quality-gate --workflow=<id>        # Phase 9 VETO gate
/validate pre-execution --agent=<agent> --action=<action>  # Pre-check
```

---

## Behavior Instructions (Phase 2 MVP)

### When User Invokes This Skill

**Parse Arguments**:
- Extract command: `ddd-compliance`, `test-pyramid`, `security`, `business-gate`, `quality-gate`, `pre-execution`
- Extract options: `--in`, `--context`, `--scope`, `--task`, `--workflow`, `--agent`, `--action`

**Current Phase 2 Limitations**:
- No Specification Registry yet (Phase 4)
- VETO gates: manual checks only (no automatic blocking)
- Security: audit report only (no enforcement)
- Pre-execution: validation only (no prevention)

---

## Command: /validate ddd-compliance

**When user runs**: `/validate ddd-compliance --in=<file>`

**Execute these steps**:

1. **Detect File Type**:
   ```bash
   # Determine what kind of DDD artifact this is
   if [[ "$file" == *".aggregate.ts" ]]; then
     pattern="aggregate-pattern"
   elif [[ "$file" == *".handler.ts" ]]; then
     if grep -q "CommandHandler" "$file"; then
       pattern="command-handler-pattern"
     else
       pattern="query-handler-pattern"
     fi
   elif [[ "$file" == *"-repository."* ]]; then
     pattern="repository-pattern"
   elif [[ "$file" == *".vo.ts" || "$file" == *".value-object.ts" ]]; then
     pattern="value-object-pattern"
   fi
   ```

2. **Load Pattern Rules**:
   ```bash
   # Use /knowledge verify to check compliance
   /knowledge verify "$pattern" --in="$file"
   ```

3. **Additional DDD Checks**:
   ```
   DDD Compliance Check
   ====================

   File: src/contexts/geographic-auth/domain/aggregates/user-trust.aggregate.ts
   Type: Aggregate Root
   Pattern: aggregate-pattern.md

   ✅ PATTERN COMPLIANCE (from /knowledge verify)
   ----------------------------------------------
   ✅ Factory method present
   ✅ Event emission uses this.apply()
   ✅ No public setters
   ✅ PolicyBuilder.must() for validation
   ✅ GDPR segregation present
   ✅ Result pattern used

   ✅ DDD PRINCIPLES
   -----------------
   ✅ Bounded context isolation (no cross-context imports)
   ✅ Ubiquitous language (domain terms in code)
   ✅ Aggregate boundaries respected (no repository in aggregate)
   ✅ Domain events for state changes
   ✅ Invariants protected (validation in factory + methods)

   ✅ LOCALHERO CONVENTIONS
   ------------------------
   ✅ Uses LocalHeroErrorCode enum (not generic errors)
   ✅ Structured logging with context
   ✅ ACL Registry for cross-context calls (if applicable)
   ✅ Dual Identity pattern (no userId in request body)
   ✅ @Transactional for database operations (if applicable)

   🎯 OVERALL COMPLIANCE: 100% (20/20 checks)

   ✅ File is DDD-compliant and ready for implementation.
   ```

4. **If violations found**:
   ```
   ❌ DDD VIOLATIONS FOUND
   -----------------------

   ❌ Line 89: Aggregate imports repository
      Violation: Aggregate MUST NOT depend on infrastructure
      Pattern: aggregate-pattern.md (line 340)
      Fix: Inject repository in handler, NOT aggregate

   ❌ Line 142: Direct cross-context import
      Violation: MUST use ACL Registry for cross-context calls
      Pattern: acl-registry-pattern.md (line 120)
      Fix: Use aclRegistry.getGlobalRequired('auth').UserQueryService

   ❌ Line 210: BusinessRuleValidator.addRule() used
      Violation: MUST use PolicyBuilder.must() pattern
      Pattern: specification-policy-pattern.md (line 85)
      Fix: Replace with PolicyBuilder.must(new Specification())

   🛑 OVERALL COMPLIANCE: 70% (14/20 checks)

   ⚠️  FIX VIOLATIONS BEFORE PROCEEDING

   To view patterns:
   /knowledge info aggregate-pattern
   /knowledge info acl-registry-pattern
   /knowledge info specification-policy-pattern
   ```

---

## Command: /validate test-pyramid

**When user runs**: `/validate test-pyramid [--context=<context>]`

**Execute these steps**:

1. **Count Tests by Level**:
   ```bash
   # If context provided, scope to that context
   if [ -n "$context" ]; then
     test_dir="src/contexts/$context"
   else
     test_dir="src"
   fi

   # Count L1 tests (unit: *.spec.ts in domain/application)
   l1_count=$(find "$test_dir" -name "*.spec.ts" -path "*/domain/*" -o -path "*/application/*" -name "*.spec.ts" | wc -l)

   # Count L2 tests (integration: *.integration.spec.ts)
   l2_count=$(find "$test_dir" -name "*.integration.spec.ts" | wc -l)

   # Count L3 tests (E2E: *.e2e.spec.ts)
   l3_count=$(find "$test_dir" -name "*.e2e.spec.ts" | wc -l)

   total_tests=$((l1_count + l2_count + l3_count))
   ```

2. **Calculate Ratios**:
   ```bash
   l1_percent=$((100 * l1_count / total_tests))
   l2_percent=$((100 * l2_count / total_tests))
   l3_percent=$((100 * l3_count / total_tests))
   ```

3. **Display Test Pyramid Report**:

   **If no context** (project-wide):
   ```
   LocalHero Test Pyramid Validation
   ==================================
   Scope: Entire Project
   Standard: ADR-0035 (L1 ~50%, L2 ~30%, L3 ~20%)

   📊 TEST DISTRIBUTION
   --------------------
   Level 1 (Unit):         782 tests (48.9%) ✅ Target: ~50%
   Level 2 (Integration):  512 tests (32.0%) ✅ Target: ~30%
   Level 3 (E2E):          306 tests (19.1%) ✅ Target: ~20%
   ----------------------------
   Total:                1,600 tests

   ✅ COMPLIANCE: 98% (within ±5% tolerance)

   📈 TREND ANALYSIS
   -----------------
   Last 30 days:
   • L1 added: +42 tests (aggregate, spec, schema tests)
   • L2 added: +28 tests (handler tests)
   • L3 added: +18 tests (API endpoint tests)

   Pyramid health: EXCELLENT (maintaining ratios as project grows)

   📋 BY CONTEXT
   -------------
   | Context                  | L1    | L2   | L3  | Total | Ratio    |
   |--------------------------|-------|------|-----|-------|----------|
   | auth                     | 156   | 85   | 38  | 279   | 56/30/14 ✅ |
   | authorization            | 128   | 68   | 30  | 226   | 57/30/13 ✅ |
   | geographic-auth          | 280   | 145  | 68  | 493   | 57/29/14 ✅ |
   | community-communication  | 32    | 16   | 8   | 56    | 57/29/14 ✅ |
   | engagement               | 168   | 92   | 41  | 301   | 56/31/13 ✅ |
   | neighborhood-economy     | 18    | 106  | 121 | 245   | 7/43/50 ❌ |

   ⚠️  WARNING: neighborhood-economy context is inverted pyramid!
   - L3 > L2 > L1 (should be L1 > L2 > L3)
   - Too many E2E tests, not enough unit tests
   - Action: Add aggregate/spec/schema tests (target: +100 L1 tests)

   🎯 RECOMMENDATIONS
   ------------------
   1. Add 100+ L1 tests to neighborhood-economy context
   2. Convert some E2E tests to integration tests where possible
   3. Continue maintaining healthy pyramid as project grows

   Overall: ✅ Project-wide compliance is excellent (98%)
   ```

   **If context provided** (e.g., `--context=geographic-auth`):
   ```
   geographic-auth Context Test Pyramid
   =====================================

   📊 TEST DISTRIBUTION
   --------------------
   Level 1 (Unit):         280 tests (56.8%) ✅ Target: ~50%
   Level 2 (Integration):  145 tests (29.4%) ✅ Target: ~30%
   Level 3 (E2E):           68 tests (13.8%) ✅ Target: ~20%
   ----------------------------
   Total:                  493 tests

   ✅ COMPLIANCE: 100% (within ±3% tolerance)

   📋 BREAKDOWN BY TYPE
   --------------------
   L1 Unit Tests (280):
   • Aggregate tests:      42 tests (UserTrust, GeographicArea)
   • Value Object tests:   38 tests (Coordinates, TrustScore)
   • Specification tests:  85 tests (trust policies, geo boundaries)
   • Schema tests:        115 tests (Zod validation - 6 categories)

   L2 Integration Tests (145):
   • Command handlers:     68 tests
   • Query handlers:       52 tests
   • Repository tests:     25 tests

   L3 E2E Tests (68):
   • API endpoints:        56 tests
   • Rate limit tests:     12 tests (separate files)

   🎯 EXCELLENT PYRAMID HEALTH
   ```

4. **If compliance failed**:
   ```
   ❌ TEST PYRAMID VIOLATION
   --------------------------

   Context: neighborhood-economy
   Ratio: L1 7% / L2 43% / L3 50%
   Target: L1 ~50% / L2 ~30% / L3 ~20%

   🚨 CRITICAL: Inverted pyramid detected!

   Problems:
   1. Too few L1 tests (18 vs target ~125)
   2. Too many L3 tests (121 vs target ~50)
   3. E2E tests cost 10-20x more than unit tests
   4. Slow test suite (E2E tests take 5-10s each)

   Required Actions:
   1. Add aggregate tests for QuickJob aggregate
   2. Add value object tests for job details
   3. Add schema tests for all Zod schemas (6-category method)
   4. Convert some E2E tests to L2 integration tests
   5. Move rate limit tests to separate files

   ⚠️  VETO: Fix pyramid before proceeding with new features

   Reference: docs/adr/0035-specification-first-testing-strategy.md
   ```

---

## Command: /validate security

**When user runs**: `/validate security --scope=<files>`

**Execute these steps**:

1. **Parse Scope**:
   ```bash
   # Accept glob pattern or file list
   if [[ "$scope" == *"*"* ]]; then
     files=$(find . -path "$scope" -type f)
   else
     files="$scope"
   fi
   ```

2. **Run Security Checks**:
   ```
   Security Validation Report
   ==========================
   Scope: src/contexts/community-communication/**/*.ts
   Checker: @security-e2e-verifier (Phase 2: manual checks)

   🔍 OWASP TOP 10 CHECKS
   ----------------------

   1. Injection (A03:2021)
   ✅ SQL Injection: No raw SQL queries found
   ✅ Command Injection: No shell execution found
   ✅ Path Traversal: File paths validated
   ⚠️  Line 245 (create-alert.handler.ts): User input in log message
      Risk: Log injection
      Fix: Use structured logging with PII redaction

   2. Broken Authentication (A07:2021)
   ✅ Session management: Using @vytches/ddd sessions
   ✅ Password storage: N/A (no passwords in this context)
   ✅ Token validation: JWT validation present

   3. Sensitive Data Exposure (A02:2021)
   ✅ GDPR segregation: Personal data separated
   ✅ Encryption: Database encryption enabled
   ⚠️  Line 312 (alert-query.service.ts): Email in API response
      Risk: PII exposure
      Fix: Add PII redaction or require explicit consent

   4. XML External Entities (A04:2021)
   ✅ N/A: No XML parsing in this scope

   5. Broken Access Control (A01:2021)
   ✅ Authorization: Using @authorization context
   ✅ Resource ownership: Checked in handlers
   ⚠️  Line 456 (update-alert.handler.ts): Missing owner check
      Risk: Unauthorized update
      Fix: Add ownership verification before update

   6. Security Misconfiguration (A05:2021)
   ✅ Default passwords: None found
   ✅ Debug mode: Disabled in production
   ✅ Error messages: Generic errors returned to client

   7. XSS (A03:2021)
   ✅ Input validation: Zod schemas present
   ✅ Output encoding: Framework handles encoding
   ⚠️  Line 567 (event.schema.ts): No maxLength on description
      Risk: DoS via large input
      Fix: Add .max(5000) to description field

   8. Insecure Deserialization (A08:2021)
   ✅ N/A: No custom deserialization

   9. Using Components with Known Vulnerabilities (A06:2021)
   ⚠️  package.json: 3 dependencies with known vulnerabilities
      Run: npm audit fix

   10. Insufficient Logging & Monitoring (A09:2021)
   ✅ Audit logging: T1 events logged (CREATE, UPDATE, DELETE)
   ✅ Security events: Failed auth attempts logged
   ✅ PII redaction: Enabled in logger

   📊 SECURITY SCORE: 85% (23/27 checks passed)
   --------------------------------------------

   ⚠️  4 WARNINGS FOUND
   --------------------
   1. Log injection risk (Line 245)
   2. PII exposure risk (Line 312)
   3. Missing authorization check (Line 456) - HIGH RISK
   4. Missing input length limit (Line 567)

   🎯 RECOMMENDED ACTIONS
   ----------------------
   Priority 1 (HIGH RISK):
   • Fix missing authorization check (Line 456)

   Priority 2 (MEDIUM RISK):
   • Add PII redaction to API response (Line 312)
   • Fix log injection (Line 245)
   • Add maxLength to schema (Line 567)

   Priority 3 (MAINTENANCE):
   • Run npm audit fix for dependencies

   ⚠️  Phase 2 Limitation: Manual review only (no automatic blocking)
   Phase 4 will add automatic specification-based enforcement.

   To delegate full security audit:
   @security-e2e-verifier Perform comprehensive security audit on community-communication context
   ```

---

## Command: /validate business-gate

**When user runs**: `/validate business-gate --task=<task-id>`

**Execute these steps**:

1. **Load Task File**:
   ```bash
   task_file="project-orchestration/tasks/$task_id.md"

   if [ ! -f "$task_file" ]; then
     echo "❌ Error: Task file not found: $task_file"
     exit 1
   fi
   ```

2. **Business Gate Validation**:
   ```
   Business Gate Validation (Phase 1 VETO)
   ========================================

   Task: TS-GEO-006.md
   Feature: User Trust Scoring System
   Gate: @customer-value-guardian

   🎯 BUSINESS VALUE CHECKLIST
   ----------------------------

   1. Customer Segment Validation
   ✅ B2C: Homeowners in Starachowice (validated)
   ✅ B2B: Local businesses (validated)
   ❌ B2G: Municipal services (NOT validated)

   2. Mom Test Evidence
   ✅ Customer interviews: 15 interviews conducted
   ✅ Pain point identified: "Don't know who to trust for home services"
   ✅ Willingness to pay: 12/15 would pay for verified services
   ⚠️  Actual behavior: No evidence of users trying existing trust systems

   3. Full vs MVP Justification
   ✅ Full implementation: Trust scoring with 5 factors
   ❌ MVP: No simplified version considered
   ⚠️  Recommendation: Start with 2-factor MVP (reviews + verification)

   4. Business Model Alignment
   ✅ Revenue impact: Enables premium subscriptions ($29/month)
   ✅ Cost justification: Development cost < 1 month revenue
   ✅ Strategic fit: Core differentiator vs competitors

   📊 BUSINESS GATE SCORE: 75% (9/12 criteria)
   -------------------------------------------

   ⚠️  3 CONCERNS FOUND
   --------------------
   1. B2G segment not validated (missing municipal use case)
   2. No evidence of user behavior (only stated intentions)
   3. No MVP vs Full justification (over-engineering risk)

   🚧 GATE STATUS: CONDITIONAL PASS
   --------------------------------
   Proceed with implementation IF:
   1. Simplify to 2-factor MVP first (reviews + verification)
   2. Defer 3 additional factors to Phase 2
   3. Add instrumentation to measure actual usage

   Alternative: BLOCK and gather more evidence
   - Conduct 5 more interviews focusing on actual behavior
   - Test MVP prototype with 10 users for 2 weeks
   - Validate B2G segment or remove from scope

   ⚠️  VETO DECISION REQUIRED
   --------------------------
   @customer-value-guardian: Do you APPROVE or BLOCK this task?

   /workflow start implementation --task=TS-GEO-006.md  (if approved)
   ```

3. **If BLOCKED**:
   ```
   🛑 BUSINESS GATE: BLOCKED
   =========================

   Task: TS-GEO-006.md
   Blocker: @customer-value-guardian
   Reason: Insufficient customer validation

   Critical Issues:
   1. Only 15 interviews (target: 30+ for feature of this complexity)
   2. No evidence of actual behavior (stated intentions only)
   3. MVP not justified (building Full without validation)

   Required Actions Before Proceeding:
   1. Conduct 15 additional customer interviews
   2. Test lightweight prototype with 10 users
   3. Measure actual behavior (not stated intentions)
   4. Document MVP vs Full justification

   Estimated Time: 2-3 weeks
   Cost Savings: $15K-$25K (avoid building wrong feature)

   This is a VETO block. Task cannot proceed until requirements met.

   Reference: .claude/commands/hero-business-review.md
   ```

---

## Command: /validate quality-gate

**When user runs**: `/validate quality-gate --workflow=<workflow-id>`

**Execute these steps**:

1. **Load Workflow Context**:
   ```bash
   # Search audit log for workflow
   workflow_info=$(grep "WORKFLOW_START: $workflow_id" .claude/audit.log)

   if [ -z "$workflow_info" ]; then
     echo "❌ Error: Workflow not found: $workflow_id"
     exit 1
   fi
   ```

2. **Quality Gate Validation**:
   ```
   Quality Gate Validation (Phase 9 VETO)
   ======================================

   Workflow: wf-2026-01-12-143022-a3f9
   Task: TS-GEO-006.md
   Gate: @security-e2e-verifier

   ✅ CODE QUALITY (from Phase 8)
   ------------------------------
   ✅ DDD patterns: 100% compliance
   ✅ CQRS implementation: Verified
   ✅ Test pyramid: L1 52% / L2 31% / L3 17% ✅
   ✅ BUSINESS_RULES.md: Updated
   ✅ Pattern usage: All patterns followed

   ✅ SECURITY (OWASP TOP 10)
   --------------------------
   ✅ Injection: No vulnerabilities
   ✅ Authentication: Properly implemented
   ✅ Authorization: Resource ownership checked
   ✅ Data exposure: PII redacted
   ✅ Access control: Verified
   ✅ Configuration: Secure
   ✅ XSS: Input validated
   ✅ Logging: Audit events present

   ✅ E2E TESTING
   --------------
   ✅ Happy path: 8 scenarios tested
   ✅ Error cases: 12 scenarios tested
   ✅ Edge cases: 6 scenarios tested
   ✅ Rate limiting: Tested separately
   ✅ Authorization: All roles tested

   ✅ PERFORMANCE
   --------------
   ✅ Query performance: <50ms (target: <100ms)
   ✅ API response time: <200ms (target: <500ms)
   ✅ Database indexes: Present and verified
   ✅ N+1 queries: None found

   📊 QUALITY GATE SCORE: 100% (32/32 criteria)
   --------------------------------------------

   ✅ GATE STATUS: APPROVED
   ------------------------
   All quality and security requirements met.
   Implementation is ready for production.

   Next Steps:
   1. Phase 10: Documentation (@documentation-writer)
   2. Phase 11: Commit & Report (@localhero-project-orchestrator)

   Workflow can proceed to final phases.
   ```

3. **If BLOCKED**:
   ```
   🛑 QUALITY GATE: BLOCKED
   ========================

   Workflow: wf-2026-01-12-143022-a3f9
   Blocker: @security-e2e-verifier
   Reason: Critical security vulnerabilities

   🚨 CRITICAL ISSUES (Must Fix)
   ------------------------------
   1. Missing authorization check in update-alert.handler.ts (Line 456)
      Risk: Unauthorized users can modify any alert
      Severity: CRITICAL
      Fix: Add ownership verification before update

   2. PII exposure in API response (alert-query.service.ts Line 312)
      Risk: Email addresses visible without consent
      Severity: HIGH
      Fix: Add PII redaction or require explicit consent

   ⚠️  HIGH ISSUES (Should Fix)
   ----------------------------
   3. Log injection risk (create-alert.handler.ts Line 245)
      Risk: Malicious input in logs
      Severity: MEDIUM
      Fix: Use structured logging

   4. Missing input length limit (event.schema.ts Line 567)
      Risk: DoS via large input
      Severity: MEDIUM
      Fix: Add .max(5000) to description field

   Required Actions:
   1. Fix 2 CRITICAL issues (must fix before proceeding)
   2. Fix 2 HIGH issues (recommended before proceeding)
   3. Re-run security validation after fixes
   4. Re-run E2E tests to verify fixes

   Estimated Time: 2-4 hours
   Cost Savings: Prevent production security incident

   This is a VETO block. Workflow cannot proceed until CRITICAL issues fixed.

   To fix and re-validate:
   1. Fix security issues
   2. Run: /validate security --scope=src/contexts/community-communication
   3. Run: /validate quality-gate --workflow=wf-2026-01-12-143022-a3f9
   ```

---

## Command: /validate pre-execution

**When user runs**: `/validate pre-execution --agent=<agent> --action=<action>`

**Phase 2 Behavior**:

```
⚠️  Note: Pre-execution validation requires Phase 4 (Specification Registry)

Phase 2 MVP: Basic sanity checks only.

Pre-Execution Validation
=========================

Agent: domain-application-implementer
Action: "Implement UserProfile aggregate"

✅ BASIC CHECKS
---------------
✅ Agent exists in registry
✅ Agent has required tools (Write, Edit, Task)
✅ Agent is authorized for domain layer implementation
✅ Action is within agent's responsibilities

⚠️  Phase 4 Specifications (Planned):
-------------------------------------
Will add 20 automatic validations:

Business Specifications (5):
• BusinessGateMustPass
• VETOPowerLimit (max 2 agents)
• FullVsMVPJustified
• CustomerSegmentValidated
• MomTestEvidence

Technical Specifications (7):
• TestPyramidRatios (L1 ~50%, L2 ~30%, L3 ~20%)
• BusinessRulesSynced
• NoCrossContextImports
• DualIdentityEnforced
• RepositoryEventRegistration
• PolicyBuilderMustBeUsed
• ResultPatternEnforced

Agent Behavior Specifications (4):
• OrchestratorCannotImplement
• ExplorationMustUseHaiku
• ImplementersUseSonnet
• VETOGatesEnforced

Token Management Specifications (4):
• PhaseTokenBudget (15K per phase)
• SummaryOnlyReturn (<600 tokens)
• CheckpointFrequency (every 5K tokens)
• WorkflowTokenLimit (165K for implementation)

Phase 2: Proceed without specification validation (manual review required)
Phase 4: Automatic validation with 90% error prevention

Validation result: ✅ APPROVED (basic checks only)
```

**Log to audit**:
```bash
echo "[$(date)] PRE_EXECUTION: $agent -> $action (Phase 2: basic checks only)" >> .claude/audit.log
```

---

## Phase 2 Limitations & Phase 4+ Features

### Phase 2 (Current - MVP)

✅ **Working**:
- DDD compliance checks (manual pattern verification)
- Test pyramid ratio calculation
- Security audit reports (OWASP Top 10)
- Business gate validation (manual approval)
- Quality gate validation (manual approval)
- Pre-execution sanity checks

⏳ **Limited**:
- No automatic VETO blocking (Phase 3)
- No Specification Registry (Phase 4)
- No automatic error prevention (Phase 4)
- Gates require manual approval (Phase 3)

### Phase 4 (Specification Registry)

🔮 **Planned**:
- 20 specifications for 90% error prevention
- Automatic VETO gate enforcement
- Pre-execution validation with blocking
- Specification violation detection
- Real-time compliance monitoring

---

## Error Handling

**File not found**:
```
❌ Error: File not found: src/invalid/path/file.ts

To validate DDD compliance:
1. Ensure file path is correct
2. File must exist in repository
3. Use absolute path from project root

Example:
/validate ddd-compliance --in=src/contexts/auth/domain/aggregates/user.aggregate.ts
```

**Workflow not found**:
```
❌ Error: Workflow not found: wf-invalid-id

To list active workflows: /workflow status

To start new workflow: /workflow start implementation --task=TS-XXX.md
```

**Invalid context**:
```
❌ Error: Context not found: invalid-context

Valid contexts:
• auth
• authorization
• geographic-auth
• community-communication
• engagement
• neighborhood-economy
```

**Missing required argument**:
```
❌ Error: Missing required argument: --task

Usage: /validate business-gate --task=<task-id>

Example:
/validate business-gate --task=TS-GEO-006
```

---

## Integration with Other Skills

- **Uses `/workflow`**: Gate validation at phases 1 and 9
- **Uses `/knowledge`**: Pattern compliance verification
- **Uses `/agent-registry`**: VETO power enforcement

---

## Version History

- **1.0.0** (2026-01-12): Phase 2 MVP - Basic validation with manual gates
- **Planned 2.0.0** (Phase 4): Specification Registry with 90% error prevention
- **Planned 3.0.0** (Phase 4): Automatic VETO gate enforcement
