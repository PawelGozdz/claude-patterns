---
name: agent-registry
description: Agent Registry Management Skill. Manages 15 active agents with responsibilities, model assignments, tool permissions, and VETO powers. Supports agent querying, model reassignment, and activity statistics.
tools: Read
model: haiku
---

# /agent-registry - Agent Registry Management Skill

## Overview

The `/agent-registry` skill provides agent management capabilities for Claude Code's multi-agent system. It maintains the authoritative registry of 15 active agents, their responsibilities, model assignments, tool permissions, and VETO powers.

**Core Capabilities**:
- Query agent information (responsibilities, model, tools, stats)
- Assign agents to workflow phases
- Reassign models for cost optimization
- Manage VETO power grants/revokes
- View agent activity statistics
- Validate agent tool access permissions

**Integration**: Used by `/workflow` skill for phase-agent assignment and by `/validate` skill for agent behavior validation.

---

## API Contract

### `/agent-registry list`

**Purpose**: List all active agents with filtering.

**Signature**:
```bash
/agent-registry list [--options]
```

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--layer` | enum | `all` | `business`, `implementation`, `verification`, `advisory`, `orchestration`, `utility` |
| `--model` | enum | `all` | `opus`, `sonnet`, `haiku` |
| `--veto-only` | boolean | false | Show only agents with VETO power |
| `--format` | enum | `table` | `table`, `json`, `compact` |

**Examples**:
```bash
# List all agents
/agent-registry list

# List implementation agents only
/agent-registry list --layer=implementation

# List agents with VETO power
/agent-registry list --veto-only

# List Haiku agents (cost-optimized)
/agent-registry list --model=haiku

# JSON output for scripting
/agent-registry list --format=json
```

**Output (Table Format)**:
```
╔════════════════════════════════════╦═══════╦═══════════╦══════════╦══════════════╗
║ Agent                              ║ Layer ║ Model     ║ VETO     ║ Status       ║
╠════════════════════════════════════╬═══════╬═══════════╬══════════╬══════════════╣
║ @customer-value-guardian           ║ BIZ   ║ sonnet    ║ YES      ║ Active       ║
║ @domain-application-implementer    ║ IMPL  ║ sonnet    ║ NO       ║ Active       ║
║ @infrastructure-testing-implementer║ IMPL  ║ sonnet    ║ NO       ║ Active       ║
║ @code-quality-verifier             ║ VERIF ║ sonnet    ║ NO       ║ Active       ║
║ @security-e2e-verifier             ║ VERIF ║ opus      ║ YES      ║ Active       ║
║ @ddd-application-expert            ║ ADV   ║ sonnet    ║ NO       ║ Active       ║
║ @technical-architecture-lead       ║ ADV   ║ opus      ║ NO       ║ Active       ║
║ @security-privacy-architect        ║ ADV   ║ opus      ║ NO       ║ Active       ║
║ @backend-technology-expert         ║ ADV   ║ sonnet    ║ NO       ║ Active       ║
║ @localhero-project-orchestrator    ║ ORCH  ║ sonnet    ║ NO       ║ Active       ║
║ @codebase-explorer                 ║ UTIL  ║ haiku     ║ NO       ║ Active       ║
║ @schema-testing-agent              ║ UTIL  ║ haiku     ║ NO       ║ Active       ║
║ @test-scaffolder                   ║ UTIL  ║ haiku     ║ NO       ║ Active       ║
║ @documentation-writer              ║ UTIL  ║ haiku     ║ NO       ║ Active       ║
║ @migration-generator               ║ UTIL  ║ haiku     ║ NO       ║ Active       ║
╚════════════════════════════════════╩═══════╩═══════════╩══════════╩══════════════╝

Total: 15 agents (2 with VETO)
```

**Error Cases**: None (empty list if no agents match filters)

---

### `/agent-registry info`

**Purpose**: Get detailed information about a specific agent.

**Signature**:
```bash
/agent-registry info <agent-name>
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `agent-name` | string | yes | Agent name (with or without @ prefix) |

**Examples**:
```bash
# With @ prefix
/agent-registry info @domain-application-implementer

# Without @ prefix
/agent-registry info codebase-explorer
```

**Output**:
```yaml
Agent: @domain-application-implementer
Layer: Implementation
Model: sonnet
Status: Active
VETO Power: NO

Responsibilities:
  - Implement domain aggregates, value objects, domain events
  - Implement command/query handlers, DTOs, application services
  - Follow PolicyBuilder pattern for business rules
  - Create L1 unit tests (~50% coverage)
  - Create L2 integration tests (~30% coverage)
  - Update BUSINESS_RULES.md after implementation

Tools Allowed:
  - Read, Write, Edit, MultiEdit (code modification)
  - Bash (test execution, git operations)
  - Glob, Grep (code search)
  - LS (directory inspection)
  - Task (delegate to other agents)

Tools Denied:
  - WebFetch, WebSearch (no external research)

Auto-Trigger Keywords:
  - aggregate, value object, domain event, domain service
  - command handler, query handler, CQRS, DTO
  - specification, policy, business logic

Consultation Requirements:
  - MUST consult @ddd-application-expert for complex aggregate boundaries
  - SHOULD consult @backend-technology-expert for performance decisions

Activity Stats:
  - Tasks Completed: 142
  - Tokens Used (30d): 5.2M
  - Avg Task Duration: 1.5h
  - Success Rate: 94.2%
  - VETO Blocks: N/A (no VETO power)

Last Activity: 2026-01-12 10:23:15 (Task: TS-GEO-006)
```

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `AGENT_NOT_FOUND` | 404 | Agent name doesn't exist in registry |

---

### `/agent-registry assign`

**Purpose**: Assign agent to workflow phase (used by `/workflow` skill).

**Signature**:
```bash
/agent-registry assign <workflow-id> <phase> <agent-name> [--options]
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `workflow-id` | string | yes | Workflow ID |
| `phase` | number | yes | Phase number (1-11) |
| `agent-name` | string | yes | Agent to assign |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--force` | boolean | false | Allow assignment even if agent busy |
| `--reason` | string | auto | Reason for assignment |

**Examples**:
```bash
# Assign domain implementer to phase 4
/agent-registry assign wf-2026-01-12-abc123 4 @domain-application-implementer

# Force-assign even if agent busy
/agent-registry assign wf-2026-01-12-abc123 5 @infrastructure-testing-implementer --force

# With custom reason
/agent-registry assign wf-2026-01-12-abc123 1 @customer-value-guardian \
  --reason="Business validation required before implementation"
```

**Output**:
```json
{
  "workflow_id": "wf-2026-01-12-abc123",
  "phase": 4,
  "agent": "@domain-application-implementer",
  "assigned_at": "2026-01-12T11:30:00Z",
  "reason": "Domain layer implementation",
  "status": "assigned"
}
```

**Behavior**:
1. Validates workflow exists
2. Validates phase is valid for workflow type
3. Validates agent exists and is active
4. Checks if agent is already assigned (unless --force)
5. Records assignment in workflow checkpoint
6. Returns assignment confirmation

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `WORKFLOW_NOT_FOUND` | 404 | Workflow ID doesn't exist |
| `AGENT_NOT_FOUND` | 404 | Agent name doesn't exist |
| `PHASE_INVALID` | 400 | Phase number out of range |
| `AGENT_ALREADY_ASSIGNED` | 409 | Agent busy with another workflow (use --force) |

---

### `/agent-registry reassign-model`

**Purpose**: Change agent's model assignment (cost optimization).

**Signature**:
```bash
/agent-registry reassign-model <agent-name> <new-model> [--options]
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `agent-name` | string | yes | Agent to reassign |
| `new-model` | enum | yes | `opus`, `sonnet`, `haiku` |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--reason` | string | required | Justification for model change |
| `--temporary` | boolean | false | Temporary change (revert after task) |
| `--workflow-id` | string | required if temporary | Workflow scope for temporary change |

**Examples**:
```bash
# Permanent model reassignment
/agent-registry reassign-model @domain-application-implementer sonnet \
  --reason="Opus not needed for pattern-following implementation"

# Temporary upgrade for complex task
/agent-registry reassign-model @code-quality-verifier opus \
  --temporary \
  --workflow-id=wf-2026-01-12-abc123 \
  --reason="Complex security audit requires deep reasoning"

# Downgrade for cost optimization (already applied to all utilities)
# Example: /agent-registry reassign-model @some-agent haiku \
#   --reason="Pattern matching doesn't need Sonnet reasoning"
```

**Output**:
```json
{
  "agent": "@domain-application-implementer",
  "previous_model": "opus",
  "new_model": "sonnet",
  "change_type": "permanent",
  "reason": "Opus not needed for pattern-following implementation",
  "estimated_savings_per_task": "$0.45 (3x reduction)",
  "effective_at": "2026-01-12T11:45:00Z"
}
```

**Behavior**:
1. Validates agent exists
2. Validates new model is valid (opus/sonnet/haiku)
3. Checks if model change is appropriate for agent role
4. Records model change in agent registry
5. Updates agent configuration
6. If temporary: schedules revert after workflow completion
7. Returns confirmation with estimated cost impact

**Model Assignment Guidelines**:
| Agent Role | Recommended Model | Rationale |
|------------|------------------|-----------|
| Strategic advisors (architecture, security) | Opus | Deep reasoning required |
| Implementation (pattern-following) | Sonnet | Pattern application, good comprehension |
| Verification (code quality) | Sonnet | Pattern validation, quality checks |
| Orchestration (coordination) | Sonnet | Task routing, no implementation |
| Utility (search, scaffolding) | Haiku | Pattern matching, 10x cost savings |

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `AGENT_NOT_FOUND` | 404 | Agent name doesn't exist |
| `MODEL_INVALID` | 400 | Invalid model name |
| `MODEL_INAPPROPRIATE` | 422 | Model downgrade would compromise quality |
| `REASON_REQUIRED` | 400 | --reason flag missing |

---

### `/agent-registry grant-veto`

**Purpose**: Grant VETO power to agent (requires approval).

**Signature**:
```bash
/agent-registry grant-veto <agent-name> --reason="..." [--options]
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `agent-name` | string | yes | Agent to grant VETO |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--reason` | string | required | Justification for VETO power |
| `--scope` | enum | `all` | `all`, `business`, `security`, `quality` |
| `--temporary` | boolean | false | Temporary VETO (revoke after task) |
| `--workflow-id` | string | required if temporary | Workflow scope |

**Examples**:
```bash
# Grant permanent VETO (requires strong justification)
/agent-registry grant-veto @code-quality-verifier \
  --reason="Quality gate enforcement requires VETO authority" \
  --scope=quality

# Temporary VETO for specific workflow
/agent-registry grant-veto @ddd-application-expert \
  --temporary \
  --workflow-id=wf-2026-01-12-abc123 \
  --reason="Complex aggregate boundary decision requires domain VETO" \
  --scope=business
```

**Output**:
```json
{
  "agent": "@code-quality-verifier",
  "veto_power": "granted",
  "scope": "quality",
  "granted_at": "2026-01-12T12:00:00Z",
  "granted_by": "@localhero-project-orchestrator",
  "reason": "Quality gate enforcement requires VETO authority",
  "change_type": "permanent",
  "warning": "VETO power is critical - use sparingly (max 2 agents with VETO)"
}
```

**VETO Power Limits** (Invariant):
- Maximum 2 agents with VETO power at any time
- Current VETO agents:
  1. @customer-value-guardian (business gate)
  2. @security-e2e-verifier (security/quality gate)
- Granting 3rd VETO requires revoking existing VETO

**Behavior**:
1. Validates agent exists
2. Checks current VETO count (max 2)
3. Validates justification is strong
4. Records VETO grant in agent registry
5. If temporary: schedules revoke after workflow completion
6. Returns confirmation with warning about VETO power

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `AGENT_NOT_FOUND` | 404 | Agent name doesn't exist |
| `VETO_LIMIT_EXCEEDED` | 409 | Already 2 agents with VETO (revoke one first) |
| `REASON_REQUIRED` | 400 | --reason flag missing |
| `JUSTIFICATION_WEAK` | 422 | Reason not strong enough for VETO grant |

---

### `/agent-registry revoke-veto`

**Purpose**: Revoke VETO power from agent.

**Signature**:
```bash
/agent-registry revoke-veto <agent-name> --reason="..."
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `agent-name` | string | yes | Agent to revoke VETO from |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--reason` | string | required | Justification for VETO revocation |

**Examples**:
```bash
# Revoke VETO power
/agent-registry revoke-veto @code-quality-verifier \
  --reason="Quality gate moved to @security-e2e-verifier"
```

**Output**:
```json
{
  "agent": "@code-quality-verifier",
  "veto_power": "revoked",
  "revoked_at": "2026-01-12T12:15:00Z",
  "revoked_by": "@localhero-project-orchestrator",
  "reason": "Quality gate moved to @security-e2e-verifier",
  "previous_scope": "quality"
}
```

**Error Cases**:
| Error | Code | Description |
|-------|------|-------------|
| `AGENT_NOT_FOUND` | 404 | Agent name doesn't exist |
| `VETO_NOT_GRANTED` | 409 | Agent doesn't have VETO power |
| `REASON_REQUIRED` | 400 | --reason flag missing |

---

### `/agent-registry stats`

**Purpose**: View agent activity statistics.

**Signature**:
```bash
/agent-registry stats [<agent-name>] [--options]
```

**Arguments**:
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `agent-name` | string | no | Specific agent (omit for all) |

**Options**:
| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--period` | enum | `30d` | `7d`, `30d`, `90d`, `all` |
| `--metric` | enum | `all` | `tasks`, `tokens`, `duration`, `success-rate` |
| `--format` | enum | `table` | `table`, `json`, `chart` |

**Examples**:
```bash
# Stats for specific agent (30 days)
/agent-registry stats @domain-application-implementer

# All agents, last 7 days
/agent-registry stats --period=7d

# Token usage only
/agent-registry stats --metric=tokens --period=90d

# JSON output for analysis
/agent-registry stats --format=json
```

**Output (Table Format)**:
```
╔════════════════════════════════════╦═══════╦═══════════╦════════╦═════════╦════════════╗
║ Agent                              ║ Tasks ║ Tokens    ║ Avg Dur║ Success ║ Cost (Est) ║
╠════════════════════════════════════╬═══════╬═══════════╬════════╬═════════╬════════════╣
║ @customer-value-guardian           ║ 23    ║ 185K      ║ 15min  ║ 91.3%   ║ $0.56      ║
║ @domain-application-implementer    ║ 142   ║ 5.2M      ║ 1.5h   ║ 94.2%   ║ $15.60     ║
║ @infrastructure-testing-implementer║ 128   ║ 4.8M      ║ 1.2h   ║ 92.1%   ║ $14.40     ║
║ @code-quality-verifier             ║ 156   ║ 2.1M      ║ 20min  ║ 88.5%   ║ $6.30      ║
║ @security-e2e-verifier             ║ 142   ║ 3.8M      ║ 35min  ║ 85.2%   ║ $57.00 (Opus) ║
║ @codebase-explorer                 ║ 487   ║ 1.2M      ║ 3min   ║ 97.8%   ║ $0.30 (Haiku) ║
╚════════════════════════════════════╩═══════╩═══════════╩════════╩═════════╩════════════╝

Total (30d): 1,078 tasks, 17.3M tokens, $94.16 estimated cost
```

**Output (JSON Format)**:
```json
{
  "period": "30d",
  "agents": [
    {
      "name": "@domain-application-implementer",
      "tasks_completed": 142,
      "tokens_used": 5200000,
      "avg_duration_minutes": 90,
      "success_rate": 0.942,
      "estimated_cost_usd": 15.60,
      "model": "sonnet"
    }
  ],
  "totals": {
    "tasks": 1078,
    "tokens": 17300000,
    "estimated_cost_usd": 94.16
  }
}
```

**Error Cases**: None (empty stats if no activity)

---

## Agent Registry Schema

**Storage**: `.claude/agents/registry.json`

**Schema**:
```json
{
  "version": "1.0.0",
  "last_updated": "2026-01-12T12:30:00Z",
  "agents": [
    {
      "id": "domain-application-implementer",
      "name": "@domain-application-implementer",
      "layer": "implementation",
      "model": "sonnet",
      "status": "active",
      "veto_power": {
        "granted": false,
        "scope": null,
        "granted_at": null
      },
      "responsibilities": [
        "Implement domain aggregates, value objects, domain events",
        "Implement command/query handlers, DTOs, application services",
        "Follow PolicyBuilder pattern for business rules",
        "Create L1 unit tests (~50% coverage)",
        "Create L2 integration tests (~30% coverage)",
        "Update BUSINESS_RULES.md after implementation"
      ],
      "tools_allowed": ["Read", "Write", "Edit", "MultiEdit", "Bash", "Glob", "Grep", "LS", "Task"],
      "tools_denied": ["WebFetch", "WebSearch"],
      "auto_trigger_keywords": [
        "aggregate", "value object", "domain event", "domain service",
        "command handler", "query handler", "CQRS", "DTO",
        "specification", "policy", "business logic"
      ],
      "consultation_requirements": [
        "MUST consult @ddd-application-expert for complex aggregate boundaries",
        "SHOULD consult @backend-technology-expert for performance decisions"
      ],
      "activity_stats": {
        "tasks_completed_30d": 142,
        "tokens_used_30d": 5200000,
        "avg_duration_minutes": 90,
        "success_rate": 0.942,
        "last_activity": "2026-01-12T10:23:15Z"
      }
    }
  ],
  "veto_agents": [
    "@customer-value-guardian",
    "@security-e2e-verifier"
  ],
  "model_costs": {
    "opus": 0.015,
    "sonnet": 0.003,
    "haiku": 0.00025
  }
}
```

---

## Integration with Other Skills

### `/workflow` Skill
- Used for agent assignment to workflow phases
- Validates agent availability before phase execution
- Tracks agent workload across concurrent workflows

### `/validate` Skill
- Validates agent tool access (AgentToolAccessSpecification)
- Enforces VETO limit (VETOPowerLimitSpecification - max 2)
- Checks orchestrator cannot implement (OrchestratorCannotImplementSpecification)

---

## Usage Examples

### Example 1: Cost Optimization via Model Reassignment
```bash
# Current state: domain-application-implementer uses Opus ($0.015/1K)
# Pattern-following implementation doesn't need Opus reasoning

# Reassign to Sonnet (3x cost reduction)
/agent-registry reassign-model @domain-application-implementer sonnet \
  --reason="Opus not needed for pattern-following implementation"

# Output:
✅ Model reassignment successful!
Agent: @domain-application-implementer
Previous: opus ($0.015/1K)
New: sonnet ($0.003/1K)
Estimated savings: $0.45 per task (3x reduction)

# Verify change
/agent-registry info @domain-application-implementer
# Shows: Model: sonnet
```

### Example 2: Temporary VETO Grant for Critical Decision
```bash
# Complex aggregate boundary decision requires domain expert VETO

# Grant temporary VETO
/agent-registry grant-veto @ddd-application-expert \
  --temporary \
  --workflow-id=wf-2026-01-12-abc123 \
  --reason="Aggregate boundary decision for payment context requires domain VETO" \
  --scope=business

# Output:
⚠️  VETO power granted (temporary, workflow-scoped)
Agent: @ddd-application-expert
Scope: business
Will auto-revoke after workflow wf-2026-01-12-abc123 completes

# After workflow completes
# VETO automatically revoked, @ddd-application-expert back to advisory role
```

### Example 3: Agent Activity Monitoring
```bash
# Check agent stats for cost analysis
/agent-registry stats --period=30d --format=table

# Output shows:
# @codebase-explorer: 487 tasks, 1.2M tokens, $0.30 (Haiku)
# @domain-application-implementer: 142 tasks, 5.2M tokens, $15.60 (Sonnet)
# @security-e2e-verifier: 142 tasks, 3.8M tokens, $57.00 (Opus)

# Analysis: Haiku agents provide 98x cost efficiency for search tasks
# ($0.30 vs $29.40 if using Sonnet)
```

---

## Success Criteria

### Phase 2 (Current)
- ✅ API contract documented (this file)
- ✅ 7 operations specified (list, info, assign, reassign-model, grant-veto, revoke-veto, stats)
- ✅ Agent registry schema defined
- ✅ Integration points identified

### Phase 3 (ProcessContext)
- ⏳ Agent assignment automation (workflow template → agent selection)
- ⏳ Workload balancing (assign least-busy agent)

### Phase 4 (Specifications)
- ⏳ VETOPowerLimitSpecification enforcement (max 2 VETO agents)
- ⏳ AgentToolAccessSpecification validation (Read/Write permissions)
- ⏳ OrchestratorCannotImplementSpecification enforcement (no Write tools for orchestrator)

---

## Implementation Notes

**Phase 2 Tasks Remaining**:
- Implement skill logic (Task 2.5)
- Register skill in `.claude/slash-commands.json`
- Create agent registry JSON file
- Migrate existing commands (agent-info, list-agents, verify-agent) (Task 2.6)
- Integration testing (Task 2.7)

**Technical Debt**:
- Agent health monitoring (detect stuck agents)
- Auto-reassignment on agent failure
- Agent versioning (track capability changes)

---

**Version History**:
- 1.0.0 (2026-01-12): Initial design (Phase 2, TS-CLAUDE-001)
