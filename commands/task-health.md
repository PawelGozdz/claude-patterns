---
name: task-health
description: |
  Deep task audit: broken dependencies, stuck in-progress, missing fields, orphaned tasks.
  Uses @tech-lead for analysis. Run weekly or before sprint planning.
tools: Read, Glob, Grep, Agent
---

# /task-health — Task Audit

Deep structural audit of the task graph. Finds issues that accumulate
silently over weeks: broken dependencies, stuck tasks, missing metadata.

**Cost**: ~$0.05 | **When**: Weekly, or before sprint planning

## Workflow

### 1. Run @tech-lead with focused audit prompt

Invoke @tech-lead:
> "Perform a full task health audit of project-orchestration/tasks/.
> Scan all .md files with YAML frontmatter and report:
>
> 1. BROKEN DEPS: tasks with `dependencies:` listing IDs that don't exist in tasks/ or completed-tasks/
> 2. STUCK IN-PROGRESS: tasks with status: in-progress not updated in >7 days
> 3. MISSING FIELDS: tasks without priority, updated_date, or assignee
> 4. P0/P1 WITHOUT DUE DATE: high priority tasks with no deadline
> 5. ORPHANED: tasks with no story_id (no traceability to user story)
> 6. CIRCULAR DEPS: dependency chains that reference each other
> 7. STATUS MISMATCH: tasks with status: done still in tasks/ (should be in completed-tasks/)
>
> For each issue: list the task ID, describe the problem, suggest the fix.
> Prioritize: broken deps first, then stuck, then missing fields."

### 2. Display audit results

Show grouped by severity:
- Critical (broken deps, circular deps, wrong folder)
- Warning (stuck, missing P0/P1 due dates)
- Info (missing fields, orphaned)

### 3. Offer quick fixes

After showing results, ask:
> "Fix safe issues automatically? (missing updated_date → today, missing priority → P2, move done tasks) Y/N"

If Y: apply fixes with Edit tool, list what was changed.
