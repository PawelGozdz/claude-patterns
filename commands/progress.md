---
name: progress
description: |
  Visual progress tracking - show current task status, recent completions, and next actions.
  Reads TEAM-STATE.md, KANBAN.md, task files and git history to generate a progress report.
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

### Step 1: Read the living project state

```bash
Read(project-orchestration/TEAM-STATE.md)   # header + latest pulse only (first ~80 lines)
Read(project-orchestration/KANBAN.md)       # first table = current scope/order
```

Extract:
- Next milestone and date (TEAM-STATE header)
- Tasks currently `in_progress` / `ready` at the top of the board (KANBAN)
- Blockers named in the latest pulse
- Next Action = first not-done row of the top KANBAN table

Do NOT read `.claude/STATE.md` or `.claude/SESSION_STATE.md` — those files are
either removed or git-ignored session scratch (`/checkpoint handoff`), never
project state.

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
→ [First not-done row of the top KANBAN table]

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

1. **Immediate** (Do Now): [from KANBAN top table / latest pulse]
2. **Follow-Up**: [logical next step]
3. **Verification**: [quality gates needed]
```

---

## Notes

- Uses Haiku for cost efficiency (read-only operations)
- Safe to run multiple times (idempotent)
- Does NOT modify any files
- Helpful for quick status check without navigating files
