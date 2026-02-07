---
name: workflow
description: Workflow Management Skill. Provides business process orchestration with structured workflow templates (implementation, investigation, review, analysis), checkpointing, and token budget management.
tools: Task, Read, TodoWrite
model: sonnet
---

# /workflow - Workflow Management Skill

## Overview

The `/workflow` skill provides business process orchestration capabilities for Claude Code. It transforms ad-hoc agent execution into structured, repeatable business processes with checkpointing, isolation, and token budget management.

**Core Capabilities**:
- Start predefined workflow templates (implementation, investigation, review, analysis)
- Checkpoint progress at phase boundaries
- Pause/resume long-running workflows
- Enforce token budgets per phase (15K limit)
- Automatic context closure on completion
- Return summary-only to parent (< 600 tokens)

**Integration**: Works with enforcement layer (user-prompt-submit.sh hook) and validation gates (/validate skill).

---

## API Contract

### `/workflow start`

**Purpose**: Initialize and start a workflow instance.

**Signature**:
```bash
/workflow start <workflow-type> [--options]
```

**Workflow Types**:
- `implementation` - Full 11-phase feature implementation (2-4h)
- `investigation` - Bug investigation workflow (30min)
- `review` - Code review workflow (20min)
- `analysis` - Task analysis workflow (15min)

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--task` | string | required for implementation | Task file path (e.g., TS-XXX.md) |
| `--issue` | string | required for investigation | Bug description or file path |
| `--files` | glob | required for review | File pattern to review |
| `--duration` | enum | `normal` | `normal`, `overnight` (8h+ checkpoint-based) |
| `--checkpoint-interval` | number | 1 | Phases between auto-checkpoints (0 = manual only) |
| `--token-budget` | number | 15000 | Max tokens per phase |

**Examples**:
```bash
# Start implementation workflow
/workflow start implementation --task="project-orchestration/tasks/TS-GEO-006.md"

# Start overnight workflow
/workflow start implementation \
  --task="TS-REFACTOR-001.md" \
  --duration=overnight \
  --checkpoint-interval=2

# Start bug investigation
/workflow start investigation --issue="UserTrust.calculateScore() returns NaN"

# Start code review
/workflow start review --files="src/contexts/auth/**/*.ts"
```

**Output**:
```json
{
  "workflow_id": "wf-2026-01-12-abc123",
  "type": "implementation",
  "status": "active",
  "current_phase": 1,
  "total_phases": 11,
  "token_budget_per_phase": 15000,
  "checkpoint_file": ".claude/workflows/wf-2026-01-12-abc123.json",
  "estimated_duration": "2-4h"
}
```

**Behavior**:
1. Validates workflow type and required options
2. Creates ProcessContext aggregate with token budget
3. Loads workflow template (phase definitions)
4. Creates checkpoint file (`.claude/workflows/<workflow-id>.json`)
5. Delegates to Phase 1 agent
6. Returns workflow metadata to parent

**Validation Gates**:
- Business gate (if implementation): Customer value validation
- Test pyramid gate (if implementation): L1/L2/L3 ratio check
- Security gate: OWASP compliance (if touching security)

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `WORKFLOW_TYPE_INVALID` | 400 | Unknown workflow type |
| `REQUIRED_OPTION_MISSING` | 400 | Missing --task, --issue, or --files |
| `TASK_FILE_NOT_FOUND` | 404 | Task file doesn't exist |
| `TOKEN_BUDGET_EXCEEDED` | 429 | Token budget too high (> 50K) |
| `ACTIVE_WORKFLOW_EXISTS` | 409 | Another workflow already active |

---

### `/workflow checkpoint`

**Purpose**: Create manual checkpoint of current workflow state.

**Signature**:
```bash
/workflow checkpoint [--message="checkpoint description"]
```

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--message` | string | auto-generated | Checkpoint description |
| `--force` | boolean | false | Force checkpoint even if phase incomplete |

**Examples**:
```bash
# Auto-checkpoint at current phase
/workflow checkpoint

# Manual checkpoint with description
/workflow checkpoint --message="Completed domain layer, starting infrastructure"

# Force checkpoint mid-phase
/workflow checkpoint --force --message="Pausing before risky migration"
```

**Output**:
```json
{
  "workflow_id": "wf-2026-01-12-abc123",
  "checkpoint_id": "cp-phase-3-abc456",
  "phase": 3,
  "timestamp": "2026-01-12T14:32:10Z",
  "message": "Completed domain layer, starting infrastructure",
  "tokens_used": 12450,
  "checkpoint_file": ".claude/workflows/wf-2026-01-12-abc123.json"
}
```

**Behavior**:
1. Captures current phase state (completed files, test results, metrics)
2. Writes to checkpoint file (append to checkpoints array)
3. Returns checkpoint metadata
4. Does NOT pause workflow (use `/workflow pause` for that)

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `NO_ACTIVE_WORKFLOW` | 404 | No workflow in progress |
| `CHECKPOINT_WRITE_FAILED` | 500 | Failed to write checkpoint file |

---

### `/workflow pause`

**Purpose**: Pause active workflow at current phase boundary.

**Signature**:
```bash
/workflow pause [--message="pause reason"]
```

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--message` | string | auto-generated | Pause reason |
| `--wait-for-phase` | boolean | true | Wait for current phase to complete |

**Examples**:
```bash
# Pause after current phase completes
/workflow pause --message="User feedback needed"

# Pause immediately (risky - may interrupt agent)
/workflow pause --wait-for-phase=false
```

**Output**:
```json
{
  "workflow_id": "wf-2026-01-12-abc123",
  "status": "paused",
  "paused_at_phase": 3,
  "checkpoint_id": "cp-phase-3-auto",
  "message": "User feedback needed",
  "resume_command": "/workflow resume wf-2026-01-12-abc123"
}
```

**Behavior**:
1. If `--wait-for-phase=true`: signals current agent to checkpoint & exit after phase
2. If `--wait-for-phase=false`: immediately creates checkpoint and terminates agent
3. Updates workflow status to `paused`
4. Returns resume instructions

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `NO_ACTIVE_WORKFLOW` | 404 | No workflow in progress |
| `WORKFLOW_ALREADY_PAUSED` | 409 | Workflow already paused |

---

### `/workflow resume`

**Purpose**: Resume paused workflow from last checkpoint.

**Signature**:
```bash
/workflow resume <workflow-id> [--from-checkpoint=<checkpoint-id>]
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `workflow-id` | string | yes | Workflow ID to resume |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--from-checkpoint` | string | latest | Specific checkpoint to resume from |
| `--skip-validation` | boolean | false | Skip pre-resume validation gates |

**Examples**:
```bash
# Resume from last checkpoint
/workflow resume wf-2026-01-12-abc123

# Resume from specific checkpoint (rollback)
/workflow resume wf-2026-01-12-abc123 --from-checkpoint=cp-phase-2-xyz789

# Resume with validation skip (use with caution)
/workflow resume wf-2026-01-12-abc123 --skip-validation
```

**Output**:
```json
{
  "workflow_id": "wf-2026-01-12-abc123",
  "status": "active",
  "resumed_at_phase": 4,
  "checkpoint_restored": "cp-phase-3-auto",
  "phases_completed": 3,
  "phases_remaining": 8
}
```

**Behavior**:
1. Loads checkpoint file
2. Restores ProcessContext state (phase, token usage, completed work)
3. Runs validation gates (unless --skip-validation)
4. Delegates to next phase agent
5. Returns workflow status

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `WORKFLOW_NOT_FOUND` | 404 | Workflow ID doesn't exist |
| `CHECKPOINT_NOT_FOUND` | 404 | Specified checkpoint doesn't exist |
| `WORKFLOW_NOT_PAUSED` | 409 | Workflow not in paused state |
| `VALIDATION_GATE_FAILED` | 422 | Pre-resume validation failed |

---

### `/workflow status`

**Purpose**: Query status of workflow(s).

**Signature**:
```bash
/workflow status [<workflow-id>] [--options]
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `workflow-id` | string | no | Specific workflow (omit for all) |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--filter` | enum | `all` | `all`, `active`, `paused`, `completed`, `failed` |
| `--limit` | number | 10 | Max workflows to return |

**Examples**:
```bash
# Status of specific workflow
/workflow status wf-2026-01-12-abc123

# All active workflows
/workflow status --filter=active

# Last 5 completed workflows
/workflow status --filter=completed --limit=5
```

**Output**:
```json
{
  "workflows": [
    {
      "workflow_id": "wf-2026-01-12-abc123",
      "type": "implementation",
      "status": "active",
      "task": "TS-GEO-006.md",
      "current_phase": 4,
      "total_phases": 11,
      "phases_completed": 3,
      "tokens_used": 38200,
      "token_budget_remaining": 127800,
      "started_at": "2026-01-12T10:00:00Z",
      "duration_elapsed": "2h 15m",
      "estimated_remaining": "1h 30m"
    }
  ],
  "total_count": 1
}
```

**Error Cases**: None (empty array if no workflows found)

---

### `/workflow close`

**Purpose**: Close completed or failed workflow (cleanup).

**Signature**:
```bash
/workflow close <workflow-id> [--options]
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `workflow-id` | string | yes | Workflow ID to close |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--force` | boolean | false | Force-close active workflow |
| `--archive` | boolean | true | Move to archive instead of delete |

**Examples**:
```bash
# Close completed workflow (auto-archiving)
/workflow close wf-2026-01-12-abc123

# Force-close stuck workflow
/workflow close wf-2026-01-12-abc123 --force

# Close and delete (no archive)
/workflow close wf-2026-01-12-abc123 --archive=false
```

**Output**:
```json
{
  "workflow_id": "wf-2026-01-12-abc123",
  "status": "closed",
  "archive_file": ".claude/workflows/archive/wf-2026-01-12-abc123.json",
  "summary": {
    "phases_completed": 11,
    "tokens_used": 152300,
    "duration": "3h 42m",
    "files_created": 23,
    "tests_added": 87,
    "validation_gates_passed": 2
  }
}
```

**Behavior**:
1. Validates workflow is in terminal state (`completed` or `failed`) OR --force
2. Creates final checkpoint
3. Moves checkpoint file to archive (if --archive=true)
4. Cleans up active workflow state
5. Returns summary metrics

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `WORKFLOW_NOT_FOUND` | 404 | Workflow ID doesn't exist |
| `WORKFLOW_STILL_ACTIVE` | 409 | Workflow active and --force not set |

---

## Workflow Templates

### Implementation Workflow (11 Phases)

**Type**: `implementation`
**Duration**: 2-4h
**Token Budget**: 165K (15K × 11 phases)

**Phases**:
1. **Business Value Validation** (Agent: @customer-value-guardian)
   - Validate customer segment (B2C/B2B/B2G)
   - Check Mom Test evidence
   - VETO if fails

2. **Task Analysis** (Agent: @localhero-project-orchestrator)
   - Read task file
   - Context discovery (@codebase-explorer)
   - Complexity assessment

3. **Expert Consultation** (Agents: Domain/Tech/Security experts)
   - Domain modeling (@ddd-application-expert)
   - Tech stack decisions (@backend-technology-expert)
   - Security review (@security-privacy-architect)

4. **Domain Layer** (Agent: @domain-application-implementer)
   - Aggregates, Value Objects, Domain Events
   - Specifications (PolicyBuilder pattern)
   - L1 unit tests (~50% coverage)

5. **Application Layer** (Agent: @domain-application-implementer)
   - Command/Query handlers
   - DTOs, Application Services
   - L2 integration tests (~30% coverage)

6. **Infrastructure Layer** (Agent: @infrastructure-testing-implementer)
   - Controllers, Zod schemas
   - Repositories, Mappers
   - External service adapters

7. **Testing Implementation** (Agent: @infrastructure-testing-implementer)
   - L3 E2E tests (~20% coverage)
   - Schema tests (6-category methodology)
   - Rate limit tests (separate files)

8. **Code Quality Review** (Agent: @code-quality-verifier)
   - DDD patterns compliance
   - CQRS implementation
   - Test pyramid validation

9. **Security & E2E Verification** (Agent: @security-e2e-verifier)
   - OWASP Top 10 check
   - E2E test execution
   - VETO if fails

10. **Documentation** (Agent: @documentation-writer)
    - Update BUSINESS_RULES.md (MANDATORY)
    - ADR if architectural change
    - API documentation

11. **Commit & Report** (Agent: @localhero-project-orchestrator)
    - Git commit with comprehensive message
    - Create completion report
    - Update task file status

**Checkpoints**: Auto-checkpoint after phases 3, 6, 9, 11

---

### Investigation Workflow (5 Phases)

**Type**: `investigation`
**Duration**: 30min
**Token Budget**: 75K (15K × 5 phases)

**Phases**:
1. **Issue Analysis** - Understand bug description
2. **Context Discovery** - Find related code (@codebase-explorer)
3. **Root Cause Analysis** - Debug and trace (@zen debug tool)
4. **Expert Consultation** - Consult domain/tech expert
5. **Solution Recommendation** - Propose fix (no implementation)

**Checkpoints**: Auto-checkpoint after phase 5 only

---

### Review Workflow (3 Phases)

**Type**: `review`
**Duration**: 20min
**Token Budget**: 45K (15K × 3 phases)

**Phases**:
1. **Code Quality Analysis** (@code-quality-verifier)
2. **Security Analysis** (@security-e2e-verifier)
3. **Combined Report** - Merge findings, prioritize issues

**Checkpoints**: Auto-checkpoint after phase 3 only

---

### Analysis Workflow (2 Phases)

**Type**: `analysis`
**Duration**: 15min
**Token Budget**: 30K (15K × 2 phases)

**Phases**:
1. **Task Understanding** - Read task file, context discovery
2. **Report Findings** - Summarize complexity, dependencies, approach

**Checkpoints**: Auto-checkpoint after phase 2 only

---

## ProcessContext Integration

**Aggregate**: ProcessContext (Phase 3 feature)

The `/workflow` skill will integrate with ProcessContext in Phase 3 to enforce:

1. **Token Budget Isolation**: Each phase runs in 15K token budget
2. **Auto-Close**: Context automatically closes after phase completion
3. **Summary-Only Return**: Parent receives < 600 token summary per phase
4. **Knowledge Scope**: Only relevant patterns loaded per workflow type

**Example ProcessContext State**:
```json
{
  "id": "pc-wf-2026-01-12-abc123-phase-4",
  "workflow_id": "wf-2026-01-12-abc123",
  "workflow_type": "implementation",
  "phase": 4,
  "token_budget": 15000,
  "tokens_used": 12450,
  "knowledge_scope": [
    "aggregate-pattern",
    "value-object-pattern",
    "specification-policy-pattern",
    "domain-errors-pattern"
  ],
  "status": "active",
  "checkpoint_on_completion": true
}
```

---

## Checkpoint File Format

**Location**: `.claude/workflows/<workflow-id>.json`

**Schema**:
```json
{
  "workflow_id": "wf-2026-01-12-abc123",
  "type": "implementation",
  "task": "project-orchestration/tasks/TS-GEO-006.md",
  "status": "active",
  "created_at": "2026-01-12T10:00:00Z",
  "updated_at": "2026-01-12T12:15:30Z",
  "token_budget_per_phase": 15000,
  "total_phases": 11,
  "current_phase": 4,
  "phases_completed": [1, 2, 3],
  "tokens_used": 38200,
  "checkpoints": [
    {
      "checkpoint_id": "cp-phase-1-auto",
      "phase": 1,
      "timestamp": "2026-01-12T10:20:00Z",
      "message": "Business value validation passed",
      "tokens_used": 3200,
      "artifacts": {
        "validation_result": "PASS"
      }
    },
    {
      "checkpoint_id": "cp-phase-3-auto",
      "phase": 3,
      "timestamp": "2026-01-12T11:15:00Z",
      "message": "Expert consultation complete",
      "tokens_used": 12800,
      "artifacts": {
        "domain_model": "docs/domain-model-TS-GEO-006.md",
        "tech_decisions": "docs/tech-decisions-TS-GEO-006.md"
      }
    }
  ],
  "artifacts": {
    "files_created": ["src/contexts/..."],
    "tests_added": 23,
    "business_rules_updated": true
  },
  "validation_gates": {
    "business": { "status": "passed", "phase": 1 },
    "security": { "status": "pending", "phase": 9 }
  }
}
```

---

## Integration with Other Skills

### `/validate` Skill
- Called at phases 1 (business), 8 (quality), 9 (security)
- VETO power at phases 1 and 9

### `/agent-registry` Skill
- Used to assign agents to phases
- Used to reassign models if needed (cost optimization)

### `/knowledge` Skill
- Used to load relevant patterns per workflow type (Phase 6 feature)
- Used to extract new patterns from completed workflows

---

## Usage Examples

### Example 1: Standard Implementation
```bash
# User request (via hook or direct)
@localhero-project-orchestrator Implement user profile feature (TS-USER-001)

# Hook transforms to:
/workflow start implementation --task="project-orchestration/tasks/TS-USER-001.md"

# Workflow executes:
# Phase 1: Business validation → PASS
# Phase 2: Task analysis → Complexity: Medium
# Phase 3: Expert consultation → Domain model designed
# Phase 4: Domain layer → UserProfile aggregate + 15 tests
# Phase 5: Application layer → 5 handlers + 10 tests
# Phase 6: Infrastructure → Controller + schema + repository
# Phase 7: Testing → 8 E2E tests + schema tests
# Phase 8: Code review → PASS (87 tests, patterns compliant)
# Phase 9: Security review → PASS (no vulnerabilities)
# Phase 10: Documentation → BUSINESS_RULES.md updated
# Phase 11: Commit → Feature committed with report

# Output to user:
✅ Implementation complete!
- 23 files created
- 87 tests added (L1: 43, L2: 28, L3: 16)
- Token usage: 152K / 165K budget
- Duration: 3h 42m
- Report: .claude/workflows/archive/wf-2026-01-12-abc123.json
```

### Example 2: Overnight Workflow with Pause/Resume
```bash
# Start overnight workflow (Friday 6pm)
/workflow start implementation \
  --task="TS-REFACTOR-001-huge-migration.md" \
  --duration=overnight \
  --checkpoint-interval=2

# Workflow runs phases 1-2, auto-checkpoints
# User leaves office (Friday 6:30pm)

# Saturday 9am: Check status
/workflow status wf-2026-01-12-xyz789
# Output: Phase 5/11, 4h elapsed, ~3h remaining

# Monday 9am: Resume from checkpoint
/workflow resume wf-2026-01-12-xyz789
# Resumes from Phase 5, completes phases 6-11

# Monday 11am: Complete
✅ Overnight workflow complete!
```

### Example 3: Bug Investigation
```bash
# User: "Why does UserTrust.calculateScore() return NaN?"

# Hook transforms to:
/workflow start investigation --issue="UserTrust.calculateScore() returns NaN"

# Workflow executes:
# Phase 1: Analyze issue → Trust aggregation, missing validation
# Phase 2: Context discovery → Found 3 related files
# Phase 3: Root cause → Division by zero when no scores exist
# Phase 4: Expert consultation → Domain expert confirms fix approach
# Phase 5: Solution recommendation → Add validation before division

# Output:
🔍 Investigation complete!

Root Cause: Division by zero in UserTrust.calculateScore()
File: src/contexts/geographic-auth/domain/aggregates/user-trust.aggregate.ts:142

Recommended Fix:
1. Add validation: if (scores.length === 0) return TrustScore.create(0)
2. Add test case for empty scores scenario
3. Update specification: TrustScoreMustBeCalculableSpec

Estimated Implementation: 30min (L1 test + fix)
```

---

## Success Criteria

### Phase 2 (Current)
- ✅ API contract documented (this file)
- ✅ 4 workflow types defined
- ✅ 5 operations specified (start, checkpoint, pause, resume, close, status)
- ✅ Checkpoint file format defined
- ✅ Integration points identified

### Phase 3 (ProcessContext)
- ⏳ Token budget enforcement per phase (15K limit)
- ⏳ Auto-close context after phase
- ⏳ Summary-only return (< 600 tokens)

### Phase 5 (Long-Running)
- ⏳ Overnight workflow tested (real 8h test)
- ⏳ Checkpoint/resume reliability validated
- ⏳ Notification system integrated

---

## Implementation Notes

**Phase 2 Tasks Remaining**:
- Implement skill logic (Task 2.5)
- Register skill in `.claude/slash-commands.json`
- Create skill invocation handler
- Migrate existing commands (Task 2.6)
- Integration testing (Task 2.7)

**Technical Debt**:
- Checkpoint file locking (concurrent access)
- Workflow expiration policy (auto-clean old workflows)
- Progress monitoring (real-time updates)

---

**Version History**:
- 1.0.0 (2026-01-12): Initial design (Phase 2, TS-CLAUDE-001)
