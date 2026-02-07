# /agent-registry - Agent Registry Management Skill

**Version**: 1.0.0 (Phase 2 - Basic Implementation)
**Status**: Active
**Full API**: See `.claude/skills/agent-registry.md` for complete specification

---

## Quick Reference

```bash
/agent-registry list [--filter=<role>]        # List agents
/agent-registry info <agent-name>             # Agent details
/agent-registry assign <agent> --task=<id>    # Assign to task
/agent-registry reassign-model <agent> --model=<model>  # Change model
/agent-registry grant-veto <agent> --reason="..."      # Grant VETO
/agent-registry revoke-veto <agent>           # Revoke VETO
/agent-registry stats                         # Registry statistics
```

---

## Behavior Instructions (Phase 2 MVP)

### When User Invokes This Skill

**Parse Arguments**:
- Extract command: `list`, `info`, `assign`, `reassign-model`, `grant-veto`, `revoke-veto`, `stats`
- Extract agent name (if provided)
- Extract options: `--filter`, `--task`, `--model`, `--reason`

**Current Phase 2 Limitations**:
- No ProcessContext integration yet (Phase 3)
- No workflow assignment tracking yet (Phase 3)
- Reads from static YAML files only
- Task assignments logged to audit log only

---

## Command: /agent-registry list

**When user runs**: `/agent-registry list [--filter=<role>]`

**Execute these steps**:

1. **Load Agent Registries**:
   ```bash
   # Load all agent registry files
   IMPLEMENTERS=".claude/roles/implementers.yml"
   VERIFIERS=".claude/roles/verifiers.yml"
   SPECIALISTS=".claude/agents/registry/specialists.yml"
   UTILITIES=".claude/agents/registry/utilities.yml"
   ```

2. **Parse YAML and Display**:

   **If no filter** (show all 15 agents):
   ```
   LocalHero Agent Registry (15 agents)
   ====================================

   🔨 IMPLEMENTERS (2 agents)
   ---------------------------
   • domain-application-implementer (sonnet)
     Role: Domain & Application layer implementation
     Status: Active
     VETO: No

   • infrastructure-testing-implementer (sonnet)
     Role: Infrastructure, API, Testing implementation
     Status: Active
     VETO: No

   ✅ VERIFIERS (2 agents)
   -----------------------
   • code-quality-verifier (sonnet)
     Role: DDD patterns, CQRS, test pyramid verification
     Status: Active
     VETO: No

   • security-e2e-verifier (opus)
     Role: Security, E2E testing, final approval
     Status: Active
     VETO: Yes (Quality Gate - Phase 9)

   🎯 SPECIALISTS (7 agents)
   -------------------------
   • ddd-application-expert (sonnet)
     Role: DDD/CQRS architectural guidance
     Status: Active
     VETO: No

   • backend-technology-expert (opus)
     Role: Sync/async decisions, performance optimization
     Status: Active
     VETO: No

   [... remaining specialists ...]

   🛠️  UTILITIES (3 agents)
   ------------------------
   • codebase-explorer (haiku)
     Role: Fast read-only codebase search
     Status: Active
     VETO: No

   [... remaining utilities ...]

   📊 ORCHESTRATION (1 agent)
   --------------------------
   • localhero-project-orchestrator (sonnet)
     Role: Task routing and coordination (NEVER implements)
     Status: Active
     VETO: No

   🛡️  BUSINESS (1 agent)
   ----------------------
   • customer-value-guardian (sonnet)
     Role: Business value validation
     Status: Active
     VETO: Yes (Business Gate - Phase 1)

   Total: 15 agents | 2 VETO agents | 2 Opus, 10 Sonnet, 3 Haiku
   ```

3. **If filter provided** (e.g., `--filter=implementers`):
   ```
   🔨 IMPLEMENTERS (2 agents)
   ---------------------------
   • domain-application-implementer (sonnet)
     Role: Domain & Application layer implementation
     Model: claude-sonnet-4-5
     Cost: $0.003/1K tokens
     Status: Active
     VETO: No
     Tools: Read, Write, Edit, MultiEdit, Bash, Glob, Grep, LS, Task

   • infrastructure-testing-implementer (sonnet)
     Role: Infrastructure, API, Testing implementation
     Model: claude-sonnet-4-5
     Cost: $0.003/1K tokens
     Status: Active
     VETO: No
     Tools: Read, Write, Edit, MultiEdit, Bash, Glob, Grep, LS, Task, mcp__zen__testgen, mcp__zen__debug
   ```

---

## Command: /agent-registry info

**When user runs**: `/agent-registry info <agent-name>`

**Execute these steps**:

1. **Find Agent in Registry**:
   ```bash
   # Search all registry files for agent
   agent_name="domain-application-implementer"
   ```

2. **Display Full Agent Details**:
   ```
   Agent: domain-application-implementer
   =====================================

   📋 BASIC INFO
   -------------
   Role: Domain & Application layer implementation
   Layer: Implementers
   Status: Active
   Model: claude-sonnet-4-5 (sonnet)
   Cost: $0.003/1K input, $0.015/1K output
   VETO Power: No

   🎯 RESPONSIBILITIES
   -------------------
   • Implements Domain layer (Aggregates, Events, Value Objects, Domain Services)
   • Implements Application layer (Command Handlers, Query Handlers, DTOs, Application Services)
   • Enforces DDD patterns and CQRS implementation
   • Uses PolicyBuilder for business rules (NEVER BusinessRuleValidator)
   • Ensures Result pattern usage throughout

   🔧 AVAILABLE TOOLS
   ------------------
   • Read, Write, Edit, MultiEdit - File operations
   • Bash - Command execution
   • Glob, Grep - Code search
   • LS - Directory listing
   • Task - Delegate to other agents

   🚫 VETO POWER
   -------------
   VETO: No
   (Only 2 agents have VETO power: @customer-value-guardian, @security-e2e-verifier)

   📊 AUTO-TRIGGER KEYWORDS
   ------------------------
   • aggregate, value object, domain event, domain service
   • command handler, query handler, CQRS, DTO
   • business logic, specification, policy builder

   📂 REGISTRY FILE
   ----------------
   Location: .claude/roles/implementers.yml
   Last Updated: 2026-01-08
   ```

3. **If agent not found**:
   ```
   ❌ Error: Agent not found: invalid-agent-name

   To list all agents: /agent-registry list
   ```

---

## Command: /agent-registry assign

**When user runs**: `/agent-registry assign <agent> --task=<task-id>`

**Phase 2 Behavior**:

```
⚠️  Note: Task assignment tracking requires Phase 3 (ProcessContext + workflow integration)

Phase 2 MVP: Assignment logged to audit trail only.

Assignment recorded:
- Agent: domain-application-implementer
- Task: TS-GEO-006
- Timestamp: 2026-01-12 15:45:30
- Logged to .claude/audit.log

To delegate task execution:
@domain-application-implementer Read and implement TS-GEO-006.md

(Full assignment tracking with workflow integration in Phase 3)
```

**Log to audit**:
```bash
echo "[$(date)] AGENT_ASSIGN: $agent_name -> $task_id" >> .claude/audit.log
```

---

## Command: /agent-registry reassign-model

**When user runs**: `/agent-registry reassign-model <agent> --model=<opus|sonnet|haiku>`

**Execute these steps**:

1. **Validate Model Change**:
   ```bash
   # Check if agent exists
   if ! grep -q "$agent_name" .claude/agents/registry/*.yml .claude/roles/*.yml; then
     echo "❌ Error: Agent not found: $agent_name"
     exit 1
   fi

   # Validate model option
   if [[ ! "$model" =~ ^(opus|sonnet|haiku)$ ]]; then
     echo "❌ Error: Invalid model: $model"
     echo "Valid options: opus, sonnet, haiku"
     exit 1
   fi
   ```

2. **Display Cost Impact**:
   ```
   Model Reassignment: domain-application-implementer
   ==================================================

   Current:
   - Model: claude-sonnet-4-5 (sonnet)
   - Cost: $0.003/1K input, $0.015/1K output

   Proposed:
   - Model: claude-opus-4-5 (opus)
   - Cost: $0.015/1K input, $0.075/1K output

   Impact:
   - Cost increase: 5x input, 5x output
   - Reasoning: Deeper reasoning for complex domain modeling
   - Recommendation: ⚠️  CAUTION - Verify cost justification

   ⚠️  IMPORTANT: This changes the YAML registry file.
   Do you want to proceed? (y/n)
   ```

3. **If user confirms** (Phase 2: manual YAML edit required):
   ```
   ⚠️  Phase 2 Limitation: Automatic model reassignment requires Phase 3

   To complete reassignment:
   1. Edit file: .claude/roles/implementers.yml
   2. Find: domain-application-implementer
   3. Change: model: "claude-sonnet-4-5" → model: "claude-opus-4-5"
   4. Commit change with reason: "Cost justification: [reason]"

   Logged to audit: .claude/audit.log
   ```

**Log to audit**:
```bash
echo "[$(date)] MODEL_REASSIGN: $agent_name (sonnet -> opus) - Reason: $reason" >> .claude/audit.log
```

---

## Command: /agent-registry grant-veto

**When user runs**: `/agent-registry grant-veto <agent> --reason="..."`

**Execute these steps**:

1. **Validate VETO Limit**:
   ```bash
   # Count current VETO agents
   veto_count=$(grep -r "veto_power: true" .claude/agents/registry/ .claude/roles/ | wc -l)

   if [ "$veto_count" -ge 2 ]; then
     echo "❌ Error: VETO power limit reached (2/2 agents)"
     echo ""
     echo "Current VETO agents:"
     echo "1. customer-value-guardian (Business Gate - Phase 1)"
     echo "2. security-e2e-verifier (Quality Gate - Phase 9)"
     echo ""
     echo "To grant VETO to $agent_name, first revoke VETO from another agent:"
     echo "/agent-registry revoke-veto <agent-name>"
     exit 1
   fi
   ```

2. **Display VETO Grant Proposal**:
   ```
   VETO Power Grant Proposal
   ==========================

   Agent: code-quality-verifier
   Current VETO: No
   Proposed VETO: Yes

   Reason: "Need quality gate before final deployment"

   Impact:
   - Agent can BLOCK workflow progression
   - Adds mandatory quality checkpoint
   - Increases workflow time by ~15-20 minutes

   Current VETO Agents (1/2):
   1. customer-value-guardian (Business Gate - Phase 1)

   After Grant (2/2):
   1. customer-value-guardian (Business Gate - Phase 1)
   2. code-quality-verifier (Quality Gate - NEW)

   ⚠️  CRITICAL: This is a Phase 3 feature (requires workflow integration)

   Phase 2: Log VETO grant intent to audit trail only.
   ```

3. **Log to audit**:
   ```bash
   echo "[$(date)] VETO_GRANT: $agent_name - Reason: $reason (Phase 2: intent only)" >> .claude/audit.log
   ```

---

## Command: /agent-registry revoke-veto

**When user runs**: `/agent-registry revoke-veto <agent>`

**Execute these steps**:

1. **Check Current VETO Status**:
   ```bash
   # Find agent and check VETO
   has_veto=$(grep -A5 "$agent_name" .claude/agents/registry/*.yml .claude/roles/*.yml | grep "veto_power: true")

   if [ -z "$has_veto" ]; then
     echo "❌ Error: Agent $agent_name does not have VETO power"
     echo ""
     echo "Current VETO agents:"
     echo "1. customer-value-guardian (Business Gate - Phase 1)"
     echo "2. security-e2e-verifier (Quality Gate - Phase 9)"
     exit 1
   fi
   ```

2. **Display Revocation Impact**:
   ```
   VETO Power Revocation
   =====================

   Agent: security-e2e-verifier
   Current VETO: Yes (Quality Gate - Phase 9)
   Proposed VETO: No

   Impact:
   - Removes mandatory quality checkpoint at Phase 9
   - Workflow can proceed without security/E2E verification
   - ⚠️  WARNING: High risk - removes final safety gate

   ❓ Are you sure you want to revoke VETO power? (y/n)

   ⚠️  Phase 2 Limitation: Manual YAML edit required
   ```

3. **If confirmed**:
   ```
   To complete revocation:
   1. Edit file: .claude/roles/verifiers.yml
   2. Find: security-e2e-verifier
   3. Change: veto_power: true → veto_power: false
   4. Commit change with reason: "[reason]"

   Logged to audit: .claude/audit.log
   ```

**Log to audit**:
```bash
echo "[$(date)] VETO_REVOKE: $agent_name (Phase 2: intent only)" >> .claude/audit.log
```

---

## Command: /agent-registry stats

**When user runs**: `/agent-registry stats`

**Execute these steps**:

1. **Parse All Registry Files**:
   ```bash
   # Count agents by category
   implementers=$(yq '.agents | length' .claude/roles/implementers.yml)
   verifiers=$(yq '.agents | length' .claude/roles/verifiers.yml)
   specialists=$(yq '.agents | length' .claude/agents/registry/specialists.yml)
   utilities=$(yq '.agents | length' .claude/agents/registry/utilities.yml)
   ```

2. **Display Registry Statistics**:
   ```
   LocalHero Agent Registry Statistics
   ====================================

   📊 AGENT COUNT BY ROLE
   ----------------------
   Implementers:     2 agents  (13.3%)
   Verifiers:        2 agents  (13.3%)
   Specialists:      7 agents  (46.7%)
   Utilities:        3 agents  (20.0%)
   Orchestration:    1 agent   (6.7%)
   -------------------------
   Total:           15 agents

   🤖 MODEL DISTRIBUTION
   ---------------------
   Opus (claude-opus-4-5):          2 agents  (13.3%)
     • backend-technology-expert
     • security-e2e-verifier

   Sonnet (claude-sonnet-4-5):     10 agents  (66.7%)
     • domain-application-implementer
     • infrastructure-testing-implementer
     • code-quality-verifier
     • ddd-application-expert
     • customer-value-guardian
     • localhero-project-orchestrator
     [... 4 more ...]

   Haiku (claude-haiku-4-5):        3 agents  (20.0%)
     • codebase-explorer
     • schema-testing-agent
     • documentation-writer

   💰 COST EFFICIENCY
   ------------------
   Average cost per agent:      $0.0042/1K tokens
   Model optimization savings:  ~3x (vs all-Opus)
   Haiku agents savings:        ~10x (vs Sonnet)

   🛡️  VETO POWER
   --------------
   VETO agents:     2/2 (max limit)
     1. customer-value-guardian (Business Gate - Phase 1)
     2. security-e2e-verifier (Quality Gate - Phase 9)

   Non-VETO agents: 13/15

   🔧 TOOL USAGE
   -------------
   Most common tools:
   • Read:         15 agents (100%)
   • Grep:         12 agents (80%)
   • Task:         10 agents (67%)
   • Write:         5 agents (33%)
   • Edit:          5 agents (33%)

   📂 REGISTRY FILES
   -----------------
   • .claude/roles/implementers.yml (2 agents)
   • .claude/roles/verifiers.yml (2 agents)
   • .claude/agents/registry/specialists.yml (7 agents)
   • .claude/agents/registry/utilities.yml (3 agents)
   • .claude/agents/registry/orchestration.yml (1 agent)

   Last updated: 2026-01-08
   ```

---

## Phase 2 Limitations & Phase 3+ Features

### Phase 2 (Current - MVP)

✅ **Working**:
- Agent listing from YAML registries
- Agent info display
- Model cost comparisons
- VETO limit validation
- Statistics generation

⏳ **Limited**:
- Model reassignment: manual YAML edit required
- VETO grant/revoke: logged only, no enforcement
- Task assignment: audit log only (no workflow integration)

### Phase 3 (ProcessContext)

🔮 **Planned**:
- Automatic model reassignment (update YAML + reload)
- VETO enforcement in workflow gates
- Task assignment tracking with workflow IDs
- Agent availability status (busy/idle)
- Token budget per agent per phase

---

## Error Handling

**Agent not found**:
```
❌ Error: Agent not found: invalid-agent-name

To list all agents: /agent-registry list

Did you mean one of these?
• domain-application-implementer
• infrastructure-testing-implementer
• code-quality-verifier
```

**Invalid model**:
```
❌ Error: Invalid model: gpt4

Valid models:
• opus   - claude-opus-4-5 ($0.015/1K input, $0.075/1K output)
• sonnet - claude-sonnet-4-5 ($0.003/1K input, $0.015/1K output)
• haiku  - claude-haiku-4-5 ($0.00025/1K input, $0.00125/1K output)
```

**VETO limit reached**:
```
❌ Error: VETO power limit reached (2/2 agents)

Current VETO agents:
1. customer-value-guardian (Business Gate - Phase 1)
2. security-e2e-verifier (Quality Gate - Phase 9)

To grant VETO to another agent, first revoke VETO from one of these:
/agent-registry revoke-veto customer-value-guardian
/agent-registry revoke-veto security-e2e-verifier
```

**Missing required argument**:
```
❌ Error: Missing required argument: --task

Usage: /agent-registry assign <agent> --task=<task-id>

Example:
/agent-registry assign domain-application-implementer --task=TS-GEO-006
```

---

## Integration with Other Skills

- **Uses `/workflow`**: Task assignment integration (Phase 3)
- **Uses `/knowledge`**: Pattern scope per agent (Phase 6)
- **Uses `/validate`**: Agent compliance checks (Phase 4)

---

## Version History

- **1.0.0** (2026-01-12): Phase 2 MVP - Basic agent management via YAML registries
- **Planned 2.0.0** (Phase 3): Automatic model reassignment, VETO enforcement
- **Planned 3.0.0** (Phase 6): Knowledge scope per agent
