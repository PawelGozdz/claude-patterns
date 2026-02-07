# Skill Integration Test Plan

**Version**: 1.0.0 (TS-CLAUDE-001 Phase 2)
**Created**: 2026-01-12
**Status**: Ready for Testing

This document provides integration test cases for the 4 new skills introduced in Phase 2.

---

## Test Environment

```bash
# Prerequisites
- Claude Code CLI active
- Project directory: /home/node/projects/local-hero-3
- Audit log: .claude/audit.log
```

---

## Test Suite 1: /workflow Skill

### Test 1.1: Start Implementation Workflow

**Command**:
```bash
/workflow start implementation --task=TS-CLAUDE-001.md
```

**Expected Output**:
```
✅ Workflow started: wf-2026-01-12-XXXXXX-XXXX
Type: Implementation (11 phases)
Task: TS-CLAUDE-001.md

Phases:
Phase 1: Business Value Validation (@customer-value-guardian)
Phase 2: Task Analysis (@localhero-project-orchestrator)
...

Starting Phase 1...
```

**Verification**:
- [ ] Workflow ID generated in correct format
- [ ] Entry logged to `.claude/audit.log`
- [ ] Task file validated

### Test 1.2: Check Workflow Status

**Command**:
```bash
/workflow status
```

**Expected Output**:
```
Active Workflows:

1. wf-2026-01-12-XXXXXX-XXXX (implementation)
   Task: TS-CLAUDE-001.md
   Phase: 1/11
   Started: X minutes ago
```

**Verification**:
- [ ] Lists active workflows from audit log
- [ ] Shows correct phase information

### Test 1.3: Create Checkpoint

**Command**:
```bash
/workflow checkpoint --message="Completed Phase 1"
```

**Expected Output**:
```
⚠️  Note: Checkpoint functionality requires Phase 3 (ProcessContext)

Phase 2 MVP: Checkpoint logged to audit trail only.

Checkpoint created:
- Timestamp: 2026-01-12 XX:XX:XX
- Message: Completed Phase 1
```

**Verification**:
- [ ] Checkpoint logged to audit.log
- [ ] Phase 3 limitation clearly stated

### Test 1.4: Close Workflow

**Command**:
```bash
/workflow close wf-2026-01-12-XXXXXX-XXXX
```

**Expected Output**:
```
✅ Workflow closed: wf-2026-01-12-XXXXXX-XXXX

Summary:
- Type: implementation
- Task: TS-CLAUDE-001.md
- Status: Completed
```

**Verification**:
- [ ] WORKFLOW_CLOSE logged to audit.log
- [ ] Summary displayed

---

## Test Suite 2: /agent-registry Skill

### Test 2.1: List All Agents

**Command**:
```bash
/agent-registry list
```

**Expected Output**:
```
LocalHero Agent Registry (15 agents)
====================================

🔨 IMPLEMENTERS (2 agents)
---------------------------
• domain-application-implementer (sonnet)
...

Total: 15 agents | 2 VETO agents | 2 Opus, 10 Sonnet, 3 Haiku
```

**Verification**:
- [ ] All 15 agents listed
- [ ] Correct model assignments
- [ ] VETO power indicated

### Test 2.2: Get Agent Info

**Command**:
```bash
/agent-registry info domain-application-implementer
```

**Expected Output**:
```
Agent: domain-application-implementer
=====================================

📋 BASIC INFO
-------------
Role: Domain & Application layer implementation
Model: claude-sonnet-4-5 (sonnet)
...
```

**Verification**:
- [ ] Full agent details displayed
- [ ] Responsibilities listed
- [ ] Tools listed

### Test 2.3: Filter Agents by Role

**Command**:
```bash
/agent-registry list --filter=verifiers
```

**Expected Output**:
```
✅ VERIFIERS (2 agents)
-----------------------
• code-quality-verifier (sonnet)
• security-e2e-verifier (opus) - VETO POWER
```

**Verification**:
- [ ] Only verifiers shown
- [ ] VETO power indicated for security-e2e-verifier

### Test 2.4: Get Registry Statistics

**Command**:
```bash
/agent-registry stats
```

**Expected Output**:
```
LocalHero Agent Registry Statistics
====================================

📊 AGENT COUNT BY ROLE
----------------------
Implementers:     2 agents  (13.3%)
Verifiers:        2 agents  (13.3%)
...

🛡️  VETO POWER
--------------
VETO agents:     2/2 (max limit)
```

**Verification**:
- [ ] Correct counts per role
- [ ] Model distribution shown
- [ ] VETO limit indicated

---

## Test Suite 3: /knowledge Skill

### Test 3.1: List All Patterns

**Command**:
```bash
/knowledge list
```

**Expected Output**:
```
LocalHero Production Pattern Library
=====================================
Total: 29 patterns (~14,876 lines)

🏛️  DOMAIN LAYER (6 patterns)
-----------------------------
• aggregate-pattern.md (850 lines)
...
```

**Verification**:
- [ ] All 29 patterns listed
- [ ] Organized by layer
- [ ] Line counts shown

### Test 3.2: Get Pattern Info

**Command**:
```bash
/knowledge info aggregate-pattern
```

**Expected Output**:
```
Pattern: aggregate-pattern
===========================

📋 METADATA
-----------
Full Name: Aggregate Root Pattern
Layer: Domain
Location: .claude/knowledge/patterns/domain/aggregate-pattern.md
...
```

**Verification**:
- [ ] Pattern details displayed
- [ ] Key sections listed
- [ ] Related patterns linked

### Test 3.3: Filter by Layer

**Command**:
```bash
/knowledge list --layer=domain
```

**Expected Output**:
```
🏛️  DOMAIN LAYER (6 patterns)
-----------------------------
1. aggregate-pattern.md (850 lines)
2. value-object-pattern.md (720 lines)
...
```

**Verification**:
- [ ] Only domain patterns shown
- [ ] Key sections preview

### Test 3.4: Get Library Statistics

**Command**:
```bash
/knowledge stats
```

**Expected Output**:
```
LocalHero Production Pattern Library Statistics
================================================

📊 PATTERN COUNT BY LAYER
--------------------------
Domain:          6 patterns  (20.7%)
...

🏆 TOP 5 MOST CRITICAL PATTERNS
--------------------------------
1. domain-errors-pattern.md
...
```

**Verification**:
- [ ] Correct pattern counts
- [ ] Critical patterns highlighted
- [ ] Usage statistics shown

### Test 3.5: Sync Patterns with Codebase

**Command**:
```bash
/knowledge sync
```

**Expected Output**:
```
Pattern Library Sync Report
============================

🔍 SCANNING CODEBASE
--------------------
Aggregates found:       8 files
Command Handlers:      47 files
...

🎯 OVERALL COMPLIANCE
---------------------
Total pattern applications: 157
Verified implementations: 148 (94%)
```

**Verification**:
- [ ] Codebase scanned
- [ ] Compliance percentage shown
- [ ] Non-compliant files listed

---

## Test Suite 4: /validate Skill

### Test 4.1: DDD Compliance Check

**Command**:
```bash
/validate ddd-compliance --in=src/contexts/auth/domain/aggregates/user.aggregate.ts
```

**Expected Output**:
```
DDD Compliance Check
====================

File: src/contexts/auth/domain/aggregates/user.aggregate.ts
Type: Aggregate Root
Pattern: aggregate-pattern.md

✅ PATTERN COMPLIANCE
...

🎯 OVERALL COMPLIANCE: XX% (XX/XX checks)
```

**Verification**:
- [ ] File type detected
- [ ] Pattern rules checked
- [ ] Compliance percentage shown

### Test 4.2: Test Pyramid Validation

**Command**:
```bash
/validate test-pyramid
```

**Expected Output**:
```
LocalHero Test Pyramid Validation
==================================

📊 TEST DISTRIBUTION
--------------------
Level 1 (Unit):         XXX tests (XX%) ✅ Target: ~50%
Level 2 (Integration):  XXX tests (XX%) ✅ Target: ~30%
Level 3 (E2E):          XXX tests (XX%) ✅ Target: ~20%

✅ COMPLIANCE: XX%
```

**Verification**:
- [ ] Test counts accurate
- [ ] Ratios calculated correctly
- [ ] Compliance status shown

### Test 4.3: Context-Specific Test Pyramid

**Command**:
```bash
/validate test-pyramid --context=geographic-auth
```

**Expected Output**:
```
geographic-auth Context Test Pyramid
=====================================

📊 TEST DISTRIBUTION
--------------------
Level 1 (Unit):         280 tests (56.8%)
...

✅ COMPLIANCE: 100%
```

**Verification**:
- [ ] Context-specific counts
- [ ] Breakdown by type shown

### Test 4.4: Business Gate Validation

**Command**:
```bash
/validate business-gate --task=TS-CLAUDE-001
```

**Expected Output**:
```
Business Gate Validation (Phase 1 VETO)
========================================

Task: TS-CLAUDE-001.md
Gate: @customer-value-guardian

🎯 BUSINESS VALUE CHECKLIST
----------------------------
1. Customer Segment Validation
...

📊 BUSINESS GATE SCORE: XX% (XX/XX criteria)

🚧 GATE STATUS: APPROVED/CONDITIONAL/BLOCKED
```

**Verification**:
- [ ] Task file loaded
- [ ] Checklist evaluated
- [ ] Gate status determined

---

## Test Suite 5: Cross-Skill Integration

### Test 5.1: Workflow + Agent Registry

**Scenario**: Start workflow and verify agent assignment

**Commands**:
```bash
/workflow start implementation --task=TS-TEST.md
/agent-registry list --filter=implementers
```

**Verification**:
- [ ] Workflow started
- [ ] Correct agents available for delegation

### Test 5.2: Workflow + Validate

**Scenario**: Run validation within workflow

**Commands**:
```bash
/workflow start implementation --task=TS-TEST.md
# (Phase 8)
/validate ddd-compliance --in=<implementation-file>
/validate test-pyramid --context=<context>
```

**Verification**:
- [ ] Validation integrates with workflow phases
- [ ] Results inform gate decisions

### Test 5.3: Knowledge + Validate

**Scenario**: Verify pattern compliance

**Commands**:
```bash
/knowledge info aggregate-pattern
/validate ddd-compliance --in=<aggregate-file>
```

**Verification**:
- [ ] Pattern rules loaded
- [ ] Same rules applied in validation

### Test 5.4: Full Workflow Simulation

**Scenario**: Complete 11-phase workflow

**Commands**:
```bash
# Phase 1: Business Gate
/validate business-gate --task=TS-TEST.md

# Phase 4-7: Implementation phases
/knowledge list --layer=domain
/agent-registry info domain-application-implementer

# Phase 8: Code Quality
/validate ddd-compliance --in=<file>
/validate test-pyramid --context=<context>

# Phase 9: Quality Gate
/validate quality-gate --workflow=<id>

# Phase 11: Close
/workflow close <id>
```

**Verification**:
- [ ] All skills work together
- [ ] Workflow progresses through phases
- [ ] Gates enforce quality

---

## Test Suite 6: Error Handling

### Test 6.1: File Not Found

**Command**:
```bash
/validate ddd-compliance --in=non-existent-file.ts
```

**Expected**: Error message with guidance

### Test 6.2: Invalid Workflow Type

**Command**:
```bash
/workflow start invalid-type --task=TS-TEST.md
```

**Expected**: Error listing valid types

### Test 6.3: Agent Not Found

**Command**:
```bash
/agent-registry info invalid-agent
```

**Expected**: Error with suggestions

### Test 6.4: Pattern Not Found

**Command**:
```bash
/knowledge info invalid-pattern
```

**Expected**: Error with similar patterns

---

## Test Suite 7: Legacy Command Migration

### Test 7.1: Deprecation Notice Display

**Commands to test**:
```bash
/hero-validate-ddd
/hero-security-audit
/hero-quality-gates
/hero-agent-sync
/hero-agent-status
/hero-context-report
/hero-analyze-context
/hero-create-feature
/hero-implement-task
```

**Expected**: Each displays deprecation notice with new command equivalent

### Test 7.2: Legacy Still Works

**Verification**:
- [ ] Legacy commands execute after deprecation notice
- [ ] Backward compatibility maintained

---

## Success Criteria

**Phase 2 Complete When**:

1. ✅ All 4 skills registered in slash-commands.json
2. ✅ All 26 skill operations documented
3. ✅ Migration guide complete
4. ✅ 9 legacy commands have deprecation notices
5. [ ] All test cases pass (manual verification)
6. [ ] Skills integrate correctly with each other
7. [ ] Error handling works as expected
8. [ ] Audit logging functional

---

## Post-Testing Actions

1. **If tests pass**:
   - Mark Task 2.7 complete
   - Prepare commit with all Phase 2 changes
   - Update task file TS-CLAUDE-001.md

2. **If tests fail**:
   - Document failures
   - Fix issues
   - Re-run failed tests

---

## Version History

- **1.0.0** (2026-01-12): Initial integration test plan
