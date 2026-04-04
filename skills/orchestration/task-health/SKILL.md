---
name: task-health
description: "Deep task audit: blocked, stale, missing deps, format issues, orphaned tasks"
origin: LocalHero
allowed-tools: Read, Glob, Grep, Agent
effort: medium
---

# /task-health — Task Audit

Deep audit of the entire task graph. Identifies structural issues that
accumulate silently over weeks of development.

**Cost**: ~$0.05 (one @tech-lead call)
**When**: Weekly, or before sprint planning

## Steps

1. Run @tech-lead with focused prompt:
   "Perform a task health audit of project-orchestration/tasks/. Report:
   1. Tasks with broken dependencies (dep file doesn't exist in tasks/)
   2. Tasks stuck in 'in-progress' for >7 days
   3. Tasks with 'blocked' status and no explanation in description
   4. Tasks missing required YAML fields (priority, updated_date, assignee)
   5. Tasks with no corresponding story_id (orphaned)
   6. Circular dependency chains
   7. P0/P1 tasks with no due_date
   Provide a prioritized fix list."

2. Display audit results with fix recommendations

3. Ask user: "Fix issues automatically where safe (missing fields)? Y/N"

## Output Example

```
[TASK HEALTH AUDIT] 2026-04-03 — 74 tasks scanned

BROKEN DEPENDENCIES (fix immediately):
  • TS-PERF-003 depends on TS-INFRA-002 — but TS-INFRA-002 not in tasks/
  • TS-SEC-003 depends on TS-AUTH-001 — TS-AUTH-001 is completed, update dep

STUCK IN-PROGRESS (>7d):
  • TS-TEST-LOAD-002 (in-progress for 22d) — no recent commits
  • TS-GEO-015 (in-progress for 9d) — check assignee

MISSING REQUIRED FIELDS:
  • 12 tasks missing updated_date
  • 5 tasks missing assignee
  • 3 P0 tasks missing due_date

ORPHANED (no story_id):
  • TS-B2G-COMPLIANCE-001 — no US-XXX reference
  • TS-ANNOUNCE-001 — no US-XXX reference

CIRCULAR DEPS: None found ✅

→ 4 critical fixes needed | 17 field updates recommended
```
