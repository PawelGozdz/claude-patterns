---
name: progress
description: |
  Visual progress tracking - show current task status, recent completions, and next actions.
  Reads STATE.md, task files, and git history to generate comprehensive progress report.
tools: Read, Bash, Grep, Glob
model: haiku
temperature: 0.2
---

# /progress - Visual Progress Tracking

> **Purpose**: Show current task progress with visual indicators, recent completions, and suggested next actions
> **Model**: Haiku (60x cheaper, read-only display)

---

## Workflow

When user invokes `/progress`:

### Step 1: Read STATE.md

```bash
Read(.claude/STATE.md)
```

Extract:
- Active Task
- Current Phase
- Progress percentage
- Next Action

### Step 2: Get Recent Completed Tasks

```bash
Bash(ls -t project-orchestration/completed-tasks/*.md 2>/dev/null | head -5)
```

### Step 3: Get Current Task Details

If current task exists:
```bash
# Find task file
Bash(find project-orchestration/tasks -name "*${TASK_ID}*" -type f)

# Read task file
Read(task-file-path)
```

Extract status, priority, points.

### Step 4: Get Git Status

```bash
Bash(git status --short)
Bash(git log --oneline -5)
Bash(git branch --show-current)
```

### Step 5: Get Token Efficiency Metrics (if available)

```bash
Bash(.claude/analytics/token-efficiency-tracker.sh report 2>/dev/null | tail -30)
```

### Step 6: Generate Progress Report

**Output Format**:

```markdown
# LocalHero Progress Report

**Generated**: [timestamp]
**Branch**: [current-branch]

---

## Current Task

**Task**: [TS-XXX] - [Title]
**Status**: [in_progress/pending/blocked]
**Priority**: [critical/high/medium/low]
**Story Points**: [X]

**Progress**: [▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░] XX% ([Phase X of Y])

**Phase**: [Current phase description]

**Next Action**:
→ [Clear next step from STATE.md]

**Blockers**: [None] or:
- [Active blocker 1]

---

## Recent Completions (Last 5)

✅ **[TS-XXX]** - [Title] (Completed: YYYY-MM-DD)

[... more ...]

---

## Git Status

**Modified files**: [count]
**Uncommitted changes**: [list]

---

## Token Efficiency

[If available, show agent efficiency metrics]

---

## Suggested Next Steps

1. **Immediate** (Do Now): [from STATE.md]
2. **Follow-Up**: [logical next step]
3. **Verification**: [quality gates needed]
```

---

## Notes

- Uses Haiku for cost efficiency (read-only operations)
- Safe to run multiple times (idempotent)
- Does NOT modify any files
- Helpful for quick status check without navigating files
