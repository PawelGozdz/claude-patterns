---
name: task-tidy
description: |
  Automated task housekeeping: move done tasks, fix missing fields, validate YAML,
  standardize format. Non-destructive — previews changes before applying.
tools: Read, Write, Edit, Glob, Grep, Bash
---

# /task-tidy — Task Housekeeping

Automated cleanup of `project-orchestration/`. Validates structure, fixes
missing fields, moves completed tasks, and standardizes YAML frontmatter.

**Cost**: ~$0.03 (no agents) | **When**: Weekly, after sprint, or before /pulse

## Rules Source

Task schema is defined in `patterns/orchestration/project-management-system.md`
(section "Task YAML Schema") and `project-orchestration/README.md`.

### Required YAML Fields (minimum)

```yaml
---
id: TS-XXX                          # unique, matches filename
title: 'Descriptive task title'     # single-quoted string
status: planned|ready|in-progress|blocked|done|deferred
priority: P0|P1|P2|P3
story_points: 5                     # integer
created_date: YYYY-MM-DD
updated_date: YYYY-MM-DD            # MUST reflect last change
assignee: '@agent-or-person'
labels: [area, type]                # inline YAML array
---
```

### Extended Fields (optional, enable PM intelligence)

```yaml
due_date: YYYY-MM-DD
mobile_impact: none|low|medium|high
tech_debt: none|minor|major
dependencies: [TS-AAA, TS-BBB]
blocks: [TS-CCC]
story_id: US-XXX
```

### Valid Status Values

`planned` | `ready` | `in-progress` | `blocked` | `done` | `deferred`

### Valid Priority Values

`P0` | `P1` | `P2` | `P3`

### Task Lifecycle (folder rules)

- `tasks/` — active tasks (status: planned, ready, in-progress, blocked)
- `completed-tasks/` — done tasks (status: done)
- `_archive/` — deferred or deprecated tasks (status: deferred)

## Workflow

### 1. Scan all task files

Read all `.md` files from:
- `project-orchestration/tasks/`
- `project-orchestration/completed-tasks/`

Parse YAML frontmatter from each file. Build a list of issues.

### 2. Detect issues (in this order)

**A. Wrong folder (auto-fix)**
- `status: done` in `tasks/` → should be in `completed-tasks/`
- `status: deferred` in `tasks/` → should be in `_archive/`
- `status: planned|ready|in-progress|blocked` in `completed-tasks/` → should be in `tasks/`

**B. Missing required fields (auto-fix with defaults)**
- `id` missing → derive from filename (strip .md)
- `title` missing → use id as title (flag for manual review)
- `status` missing → set `planned`
- `priority` missing → set `P2`
- `created_date` missing → set today
- `updated_date` missing → set today
- `assignee` missing → set `'@unassigned'`
- `labels` missing → set `[]`
- `story_points` missing → set `0` (flag for estimation)

**C. Stale updated_date (warn only)**
- `updated_date` older than 14 days on non-done tasks → warn

**D. Invalid values (warn, suggest fix)**
- `status` not in valid set → warn
- `priority` not in valid set → warn
- Date fields not matching YYYY-MM-DD → warn

**E. Filename vs ID mismatch (warn)**
- Filename doesn't match `id` field → warn

**F. Broken dependencies (warn)**
- `dependencies:` or `blocks:` referencing IDs that don't exist in tasks/ or completed-tasks/

### 3. Preview changes

Print a grouped summary:

```
[TASK-TIDY] Scanned {N} tasks

WILL MOVE ({N} files):
  tasks/TS-XXX.md → completed-tasks/ (status: done)
  tasks/TS-YYY.md → _archive/ (status: deferred)

WILL FIX ({N} fields):
  TS-AAA: +priority: P2, +updated_date: 2026-04-03
  TS-BBB: +assignee: '@unassigned', +labels: []

WARNINGS ({N} issues):
  TS-CCC: updated_date is 22 days old (stale)
  TS-DDD: depends on TS-ZZZ which doesn't exist
  TS-EEE: filename 'old-name.md' doesn't match id 'TS-EEE'

NO CHANGES NEEDED: {N} tasks are clean
```

### 4. Ask for confirmation

> "Apply {N} moves and {N} field fixes? (Y/N/selective)"

- **Y** — apply all safe changes
- **N** — exit without changes
- **selective** — user picks which fixes to apply

### 5. Apply changes

For moves: use Bash `mv` command.
For field fixes: use Edit tool to update YAML frontmatter.
For each changed file: update `updated_date` to today.

### 6. Summary

```
[TASK-TIDY] Done
  Moved: 3 files (2 → completed-tasks/, 1 → _archive/)
  Fixed: 8 fields across 4 tasks
  Warnings: 5 (manual review needed)
```

## Safety Rules

- NEVER delete task files — only move between folders
- NEVER change `status`, `title`, `id`, or `description` content
- NEVER modify tasks in `completed-tasks/` (immutable archive)
- Only add/fix metadata fields, never remove them
- Always preview before applying
- Always update `updated_date` when modifying a file
