# /hero-progress - Visual Progress Tracking

> **Purpose**: Show current task progress with visual indicators, recent completions, and suggested next actions
> **Version**: 1.0.0
> **Inspired By**: GSD (get-shit-done) progress visualization
> **Model**: Haiku (60x cheaper, read-only display)

---

## Usage

```bash
/hero-progress
```

**Output**: Visual progress report with:
- Current task status and progress bar
- Recent completed tasks (last 5)
- Current in-progress task details
- Suggested next action
- Token efficiency metrics

---

## Implementation

When user invokes `/hero-progress`, execute:

### Step 1: Read STATE.md

```bash
# Check if STATE.md exists and has current task
if [ -f .claude/STATE.md ]; then
  # Extract current task info
  CURRENT_TASK=$(grep "^**Active Task**:" .claude/STATE.md | sed 's/^**Active Task**: //')
  PHASE=$(grep "^**Phase**:" .claude/STATE.md | sed 's/^**Phase**: //')
  PROGRESS=$(grep "^**Progress**:" .claude/STATE.md)
  NEXT_ACTION=$(sed -n '/^**Next Action**:/,/^---/p' .claude/STATE.md | grep -v "^---" | grep -v "^**Next Action**:")
fi
```

### Step 2: Get Recent Completed Tasks

```bash
# Get last 5 completed tasks from project-orchestration/completed-tasks/
COMPLETED=$(ls -t project-orchestration/completed-tasks/*.md 2>/dev/null | head -5)
```

### Step 3: Get Current Task Details

```bash
# If current task exists, read task file
if [ ! -z "$CURRENT_TASK" ]; then
  TASK_ID=$(echo "$CURRENT_TASK" | cut -d' ' -f1)
  TASK_FILE=$(find project-orchestration/tasks -name "${TASK_ID}.md" 2>/dev/null)
  
  if [ -f "$TASK_FILE" ]; then
    # Extract task metadata
    STATUS=$(grep "^status:" "$TASK_FILE" | sed 's/status: //')
    PRIORITY=$(grep "^priority:" "$TASK_FILE" | sed 's/priority: //')
    POINTS=$(grep "^points:" "$TASK_FILE" | sed 's/points: //')
  fi
fi
```

### Step 4: Generate Progress Report

**Output Format**:

```markdown
# LocalHero Progress Report

**Generated**: [timestamp]
**Session**: [current session info from STATE.md]

---

## Current Task

**Task**: [TS-XXX] - [Title]
**Status**: [in_progress/pending/blocked]
**Priority**: [critical/high/medium/low]
**Story Points**: [X]

**Progress**: [▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░] XX% ([Phase X of Y])

**Phase**: [Current phase description]

**Last Action**:
- [What was just completed]

**Next Action**:
→ [Clear next step to take]

**Blockers**: [None] or:
- [Active blocker 1]
- [Active blocker 2]

---

## Recent Completions (Last 5)

✅ **[TS-XXX]** - [Title] (Completed: YYYY-MM-DD)
   [Brief description or key achievement]
   
✅ **[TS-YYY]** - [Title] (Completed: YYYY-MM-DD)
   [Brief description or key achievement]

[... 3 more ...]

---

## Suggested Next Steps

Based on current state:

1. **Immediate** (Do Now):
   [Specific action from STATE.md Next Action]

2. **Follow-Up** (After Immediate):
   [Logical next step in workflow]

3. **Verification** (Before Completing):
   [Quality gates or verification needed]

---

## Context Status

**Active Bounded Context**: [context-name]

**Files in Focus**:
[List from STATE.md Quick Reference]

**Patterns Being Used**:
[List from STATE.md Quick Reference]

---

## Session Metrics

**Token Efficiency**: [XX]% (Target: >70%)

**Model Distribution**:
- Opus: [XX]% (~$X.XX)
- Sonnet: [XX]% (~$X.XX)
- Haiku: [XX]% (~$X.XX)

**Total Session Cost**: ~$[X.XX]

**Optimization Tips**:
[If Haiku <15%]: Consider delegating searches to @codebase-explorer
[If Opus >30%]: Consider using Sonnet agents for implementation
[If efficiency <70%]: Review delegation patterns

---

## Quick Actions

- 📝 Update progress: Edit `.claude/STATE.md`
- 🐛 Log blocker: Create file in `.claude/debug/`
- ✅ Complete task: Move to `completed-tasks/`, update STATE.md
- 🔄 Switch task: Update STATE.md Current Position
- 📊 Full report: `/hero-context-report`
```

---

## Expected Behavior

### Scenario 1: Active Task in Progress

```markdown
# LocalHero Progress Report

**Generated**: 2026-01-15 14:30:00
**Session**: 2026-01-15-auth-implementation

---

## Current Task

**Task**: TS-027 - Feature Flags System Implementation
**Status**: in_progress
**Priority**: high
**Story Points**: 3

**Progress**: [▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░] 50% (Phase 5 of 11)

**Phase**: Application Layer - Command Handlers

**Last Action**:
- Created CreateFeatureFlagHandler with @Transactional
- Registered handler in CommandBus

**Next Action**:
→ Implement UpdateFeatureFlagHandler
→ Add handler tests (L2-Handler)

**Blockers**: None

---

## Recent Completions (Last 5)

✅ **TS-AUDIT-001** - System-Wide GDPR Audit Handler (Completed: 2026-01-13)
   Implemented audit handlers for all Tier 1 domain events across 6 contexts
   
✅ **TS-MOD-004** - Moderation Persistence & Audit Refactor (Completed: 2026-01-12)
   Refactored moderation system with proper event handling

[... 3 more ...]

---

## Suggested Next Steps

1. **Immediate**: Create UpdateFeatureFlagHandler with Result pattern
2. **Follow-Up**: Write L2-Handler tests for update command
3. **Verification**: Run @code-quality-verifier before proceeding to infra

---

## Context Status

**Active Bounded Context**: auth

**Files in Focus**:
- auth/application/commands/update-feature-flag.handler.ts (NEXT)
- auth/domain/aggregates/feature-flag.ts (IN PROGRESS)

**Patterns Being Used**:
- PolicyBuilder - `.claude/knowledge/patterns/domain/specification-policy-pattern.md`
- Command Handler - `.claude/knowledge/patterns/application/command-handler-pattern.md`

---

## Session Metrics

**Token Efficiency**: 72% (Target: >70%) ✅

**Model Distribution**:
- Opus: 28% (~$2.10) ✅
- Sonnet: 58% (~$1.45) ✅
- Haiku: 14% (~$0.05) ⚠️ (Could be higher)

**Total Session Cost**: ~$3.60

**Optimization Tips**:
✅ Token efficiency on target
⚠️ Consider using @codebase-explorer for next search task

---

## Quick Actions

- 📝 Update progress: Edit `.claude/STATE.md`
- 🐛 Log blocker: Create file in `.claude/debug/`
- ✅ Complete task: Move to `completed-tasks/`, update STATE.md
- 🔄 Switch task: Update STATE.md Current Position
- 📊 Full report: `/hero-context-report`
```

### Scenario 2: No Active Task

```markdown
# LocalHero Progress Report

**Generated**: 2026-01-15 14:30:00
**Session**: New session

---

## Current Task

**No active task**

**Suggested Actions**:
1. Review STATE.md to resume previous work
2. Check `project-orchestration/tasks/` for pending tasks
3. Use `/hero-orchestrate` to start new feature

---

## Recent Completions (Last 5)

✅ **TS-AUDIT-001** - System-Wide GDPR Audit Handler (Completed: 2026-01-13)
✅ **TS-MOD-004** - Moderation Persistence & Audit Refactor (Completed: 2026-01-12)
[... 3 more ...]

---

## Session Metrics

**New session** - no metrics yet

Start work to track progress!
```

### Scenario 3: Blocked Task

```markdown
# LocalHero Progress Report

**Generated**: 2026-01-15 14:30:00
**Session**: 2026-01-15-auth-implementation

---

## Current Task

**Task**: TS-027 - Feature Flags System Implementation
**Status**: ⚠️ BLOCKED
**Priority**: high
**Story Points**: 3

**Progress**: [▓▓▓▓▓▓░░░░░░░░░░░░░░] 30% (Phase 3 of 11)

**Phase**: Domain Layer - Aggregate Implementation

**Blockers**:
⚠️ **Aggregate Boundary Question**
   - Issue: Unclear if FeatureFlag should own RolloutRules or reference them
   - Impact: Blocking domain implementation
   - Debug File: `.claude/debug/2026-01-15-aggregate-boundary-question.md`
   - Owner: Escalated to @ddd-application-expert

**Next Action**:
→ Wait for @ddd-application-expert decision on aggregate boundary
→ Meanwhile: Document alternative approaches in debug file

---

## Suggested Next Steps

1. **Immediate**: Review debug file and document trade-offs of each approach
2. **Escalation**: If no response in 1h, escalate to @technical-architecture-lead
3. **Alternative**: Work on parallel task while waiting

---

## Quick Actions

- 🐛 Update blocker: Edit `.claude/debug/2026-01-15-aggregate-boundary-question.md`
- 📝 Update STATE.md: Add decision once received
- 🔄 Switch task: Consider working on TS-028 while waiting
```

---

## Implementation Details

### Required Information Sources

1. **STATE.md**: Current task, phase, progress, next action
2. **project-orchestration/tasks/[TASK_ID].md**: Task metadata
3. **project-orchestration/completed-tasks/**: Recent completions
4. **.claude/analytics/** (if available): Token metrics
5. **.claude/debug/**: Active blockers

### Fallback Behavior

**If STATE.md doesn't exist**:
```markdown
⚠️ STATE.md not found

This is a new session or STATE.md hasn't been created yet.

**To get started**:
1. Create STATE.md: Copy from `.claude/STATE.md` template
2. Choose a task: Review `project-orchestration/tasks/`
3. Start work: Use `/hero-orchestrate` for implementation

**Or continue previous work**:
- Check git history for recent changes
- Review completed tasks for context
- Read task files to understand status
```

### Progress Bar Calculation

```javascript
// Calculate progress percentage from phase
// Example: "Phase 5 of 11" = 45%
const calculateProgress = (phaseText) => {
  const match = phaseText.match(/Phase (\d+) of (\d+)/);
  if (!match) return 0;
  
  const current = parseInt(match[1]);
  const total = parseInt(match[2]);
  const percent = Math.round((current / total) * 100);
  
  // Generate progress bar: 20 blocks total
  const filled = Math.round(percent / 5); // 5% per block
  const empty = 20 - filled;
  
  return `[${'▓'.repeat(filled)}${'░'.repeat(empty)}] ${percent}%`;
};
```

### Token Metrics Extraction

```bash
# If .claude/analytics/token-efficiency-tracker.sh exists
if [ -f .claude/analytics/token-efficiency-tracker.sh ]; then
  # Get latest snapshot metrics
  METRICS=$(.claude/analytics/token-efficiency-tracker.sh report)
fi
```

---

## Integration with Other Commands

**Related Commands**:
- `/hero-orchestrate` - Start new feature implementation
- `/hero-context-report` - Detailed context efficiency metrics
- `/hero-agent-status` - Agent assignments and verification status
- `/workflow status` - Detailed workflow phase tracking

**Workflow Integration**:
```
User: /hero-progress
→ See current status, progress bar, next action

User: [Do work based on next action]

User: /hero-progress
→ See updated progress, new next action

User: [Complete task]

User: /hero-progress
→ See task in Recent Completions, prompt for new task
```

---

## Benefits

**Visual Progress Tracking**:
- Clear progress bar shows how far along you are
- Phase information provides context
- Next action removes ambiguity

**Cross-Session Continuity**:
- Easy to resume work after break
- Recent completions show momentum
- Blockers are prominently displayed

**Cost Awareness**:
- Token metrics keep cost visible
- Optimization tips help reduce spending
- Model distribution shows efficiency

**Actionable Insights**:
- Suggested next steps guide workflow
- Quick actions provide immediate options
- Escalation paths clear when blocked

---

## Best Practices

**Use /hero-progress**:
- ✅ At start of session (orient yourself)
- ✅ Before taking break (capture state)
- ✅ When feeling lost (re-orient)
- ✅ After completing phase (see progress)
- ✅ When checking efficiency (see metrics)

**DON'T use /hero-progress**:
- ❌ As replacement for STATE.md (this reads STATE.md)
- ❌ For detailed debugging (use debug files)
- ❌ For full context report (use /hero-context-report)

---

**Version**: 1.0.0
**Created**: 2026-01-15
**Maintained By**: @localhero-project-orchestrator
**Inspired By**: GSD progress visualization
