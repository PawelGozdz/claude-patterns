# /workflow - Workflow Management Skill

**Version**: 1.0.0 (Phase 2 - Basic Implementation)
**Status**: Active
**Full API**: See `.claude/skills/workflow.md` for complete specification

---

## Quick Reference

```bash
/workflow start <type> --task=<file>     # Start workflow
/workflow status [<workflow-id>]         # Check status
/workflow checkpoint [--message="..."]   # Create checkpoint
/workflow pause [--message="..."]        # Pause workflow
/workflow resume <workflow-id>           # Resume workflow
/workflow close <workflow-id>            # Close workflow
```

---

## Behavior Instructions (Phase 2 MVP)

### When User Invokes This Skill

**Parse Arguments**:
- Extract command: `start`, `status`, `checkpoint`, `pause`, `resume`, `close`
- Extract workflow type: `implementation`, `investigation`, `review`, `analysis`
- Extract options: `--task`, `--issue`, `--files`, `--message`, etc.

**Current Phase 2 Limitations**:
- No ProcessContext isolation yet (Phase 3)
- No checkpoint files yet (Phase 3)
- No token budget enforcement yet (Phase 3)
- Workflows tracked via audit log only

---

## Command: /workflow start

### Implementation Workflow

**When user runs**: `/workflow start implementation --task="TS-XXX.md"`

**Execute these steps**:

1. **Validate Task File**:
   ```bash
   # Check if task file exists
   if [ ! -f "project-orchestration/tasks/TS-XXX.md" ]; then
     echo "❌ Error: Task file not found"
     exit 1
   fi
   ```

2. **Generate Workflow ID**:
   ```
   workflow_id="wf-$(date +%Y-%m-%d-%H%M%S)-$(head -c 4 /dev/urandom | xxd -p)"
   Example: wf-2026-01-12-143022-a3f9
   ```

3. **Log Workflow Start**:
   ```bash
   echo "[$(date)] WORKFLOW_START: $workflow_id (implementation, TS-XXX.md)" >> .claude/audit.log
   ```

4. **Display Workflow Plan**:
   ```
   ✅ Workflow started: $workflow_id
   Type: Implementation (11 phases)
   Task: TS-XXX.md

   Phases:
   Phase 1: Business Value Validation (@customer-value-guardian)
   Phase 2: Task Analysis (@localhero-project-orchestrator)
   Phase 3: Expert Consultation (Domain/Tech/Security experts)
   Phase 4: Domain Layer (@domain-application-implementer)
   Phase 5: Application Layer (@domain-application-implementer)
   Phase 6: Infrastructure Layer (@infrastructure-testing-implementer)
   Phase 7: Testing (@infrastructure-testing-implementer)
   Phase 8: Code Quality Review (@code-quality-verifier)
   Phase 9: Security & E2E Verification (@security-e2e-verifier) [VETO]
   Phase 10: Documentation (@documentation-writer)
   Phase 11: Commit & Report (@localhero-project-orchestrator)

   Starting Phase 1...
   ```

5. **Delegate to Phase 1** (Business Gate):
   ```
   Invoke Task tool with:
   - subagent_type: "localhero-project-orchestrator"
   - prompt: "Execute Phase 1 (Business Validation) for workflow $workflow_id. Delegate to @customer-value-guardian for business gate validation. Task: [task content]. Check: segment (B2C/B2B/B2G), Mom Test evidence, Full vs MVP justification."
   ```

6. **Return to User**:
   ```
   Workflow $workflow_id started.
   Current phase: 1/11 (Business Value Validation)
   Agent: @customer-value-guardian

   [Agent will report back when phase completes]
   ```

### Investigation Workflow

**When user runs**: `/workflow start investigation --issue="Bug description"`

**Execute these steps**:

1. **Generate Workflow ID**
2. **Log Start**
3. **Display 5-Phase Plan**:
   ```
   Phase 1: Issue Analysis
   Phase 2: Context Discovery (@codebase-explorer)
   Phase 3: Root Cause Analysis (debug tools)
   Phase 4: Expert Consultation
   Phase 5: Solution Recommendation
   ```

4. **Delegate to Phase 1**:
   ```
   Invoke Task tool:
   - subagent_type: "localhero-project-orchestrator"
   - prompt: "Execute investigation workflow $workflow_id. Issue: [description]. Phases: 1) Analyze issue 2) Find related code 3) Debug + trace 4) Consult expert 5) Recommend solution (NO implementation)."
   ```

### Review Workflow

**When user runs**: `/workflow start review --files="src/contexts/auth/**/*.ts"`

**Execute these steps**:

1-2. **Generate ID + Log**
3. **Display 3-Phase Plan**:
   ```
   Phase 1: Code Quality Analysis (@code-quality-verifier)
   Phase 2: Security Analysis (@security-e2e-verifier)
   Phase 3: Combined Report
   ```

4. **Delegate**:
   ```
   Invoke Task tool:
   - subagent_type: "code-quality-verifier"
   - prompt: "Review workflow $workflow_id. Files: [glob pattern]. Check: DDD patterns, CQRS, test pyramid, code quality. Then delegate to @security-e2e-verifier for security check."
   ```

### Analysis Workflow

**When user runs**: `/workflow start analysis --task="TS-XXX.md"`

**Execute these steps**:

1-2. **Generate ID + Log**
3. **Display 2-Phase Plan**:
   ```
   Phase 1: Task Understanding (read + context discovery)
   Phase 2: Report Findings (complexity, dependencies, approach)
   ```

4. **Delegate**:
   ```
   Invoke Task tool:
   - subagent_type: "localhero-project-orchestrator"
   - prompt: "Analysis workflow $workflow_id. Task: [file]. Read task, discover context via @codebase-explorer, report: complexity assessment, dependencies, recommended approach. NO IMPLEMENTATION."
   ```

---

## Command: /workflow status

**When user runs**: `/workflow status [<workflow-id>]`

**Execute**:

1. **If workflow-id provided**:
   ```bash
   # Search audit log for workflow
   grep "WORKFLOW_START: $workflow_id" .claude/audit.log
   grep "PHASE_COMPLETE: $workflow_id" .claude/audit.log | tail -1
   ```

   **Report**:
   ```
   Workflow: wf-2026-01-12-143022-a3f9
   Type: implementation
   Task: TS-GEO-006.md
   Started: 2026-01-12 14:30:22
   Current Phase: 4/11 (Domain Layer)
   Status: Active
   Agent: @domain-application-implementer
   ```

2. **If no workflow-id** (list all active):
   ```bash
   # Find all workflows started in last 24h
   grep "WORKFLOW_START" .claude/audit.log | tail -10
   ```

   **Report**:
   ```
   Active Workflows:

   1. wf-2026-01-12-143022-a3f9 (implementation)
      Task: TS-GEO-006.md
      Phase: 4/11
      Started: 2h ago

   2. wf-2026-01-12-150015-b7c2 (review)
      Files: src/contexts/auth/**/*.ts
      Phase: 2/3
      Started: 30min ago
   ```

---

## Command: /workflow checkpoint

**When user runs**: `/workflow checkpoint [--message="..."]`

**Phase 2 Behavior**:

```
⚠️  Note: Checkpoint functionality requires Phase 3 (ProcessContext)

Phase 2 MVP: Checkpoint logged to audit trail only.

Checkpoint created:
- Timestamp: 2026-01-12 15:45:30
- Message: [message or "Manual checkpoint"]
- Current state logged to .claude/audit.log

Full checkpoint files (.claude/workflows/*.json) will be available in Phase 3.
```

**Log to audit**:
```bash
echo "[$(date)] CHECKPOINT: $workflow_id - ${message}" >> .claude/audit.log
```

---

## Command: /workflow pause

**When user runs**: `/workflow pause [--message="..."]`

**Phase 2 Behavior**:

```
⚠️  Note: Pause/Resume requires Phase 3 (ProcessContext + checkpoint files)

Phase 2 MVP: Workflow state logged, manual resume required.

Workflow paused:
- Workflow ID: wf-2026-01-12-143022-a3f9
- Message: [message or "Manual pause"]
- State logged to .claude/audit.log

To resume: Tell Claude to continue workflow wf-2026-01-12-143022-a3f9
```

**Log**:
```bash
echo "[$(date)] WORKFLOW_PAUSE: $workflow_id - ${message}" >> .claude/audit.log
```

---

## Command: /workflow resume

**When user runs**: `/workflow resume <workflow-id>`

**Phase 2 Behavior**:

```
⚠️  Note: Automatic resume requires Phase 3 (checkpoint files)

Phase 2 MVP: Manual context restoration.

Resuming workflow: wf-2026-01-12-143022-a3f9

Please provide:
1. What was the last completed phase?
2. What work was done?
3. What should happen next?

I'll continue from there.

(Full automatic resume from checkpoint files in Phase 3)
```

---

## Command: /workflow close

**When user runs**: `/workflow close <workflow-id>`

**Execute**:

1. **Log Close**:
   ```bash
   echo "[$(date)] WORKFLOW_CLOSE: $workflow_id" >> .claude/audit.log
   ```

2. **Report**:
   ```
   ✅ Workflow closed: wf-2026-01-12-143022-a3f9

   Summary:
   - Type: implementation
   - Task: TS-GEO-006.md
   - Duration: 3h 42m (estimated from logs)
   - Status: Completed

   Workflow logged in .claude/audit.log
   ```

---

## Phase 2 Limitations & Phase 3+ Features

### Phase 2 (Current - MVP)

✅ **Working**:
- Workflow start with type validation
- Agent delegation to phases
- Audit log tracking
- Status queries via log grep
- Workflow ID generation

⏳ **Limited**:
- Checkpoints: logged only, no files
- Pause/Resume: manual, no automatic state
- Status: approximate from logs

### Phase 3 (ProcessContext)

🔮 **Planned**:
- Checkpoint files (`.claude/workflows/*.json`)
- Automatic pause/resume with state restoration
- Token budget per phase (15K limit)
- Auto-close context after phase
- Summary-only return to parent (< 600 tokens)

### Phase 5 (Long-Running)

🔮 **Planned**:
- Overnight workflow support (8h+)
- Checkpoint-based resumption
- Notification system (email/webhook/file)

---

## Error Handling

**Task file not found**:
```
❌ Error: Task file not found: project-orchestration/tasks/TS-XXX.md

Please check:
1. File path is correct
2. File exists in repository
3. Use /hero-orchestrate to list available tasks
```

**Invalid workflow type**:
```
❌ Error: Invalid workflow type: 'test'

Valid types:
- implementation (11 phases, 2-4h)
- investigation (5 phases, 30min)
- review (3 phases, 20min)
- analysis (2 phases, 15min)
```

**Workflow not found**:
```
❌ Error: Workflow not found: wf-2026-01-12-999999-xxxx

To list active workflows: /workflow status
```

---

## Integration with Other Skills

- **Uses `/agent-registry`**: Agent assignment (future)
- **Uses `/knowledge`**: Pattern loading per phase (Phase 6)
- **Uses `/validate`**: Gates at phases 1, 8, 9

---

## Version History

- **1.0.0** (2026-01-12): Phase 2 MVP - Basic workflow tracking via audit log
- **Planned 2.0.0** (Phase 3): Checkpoint files, ProcessContext isolation
- **Planned 3.0.0** (Phase 5): Long-running workflows, notifications
