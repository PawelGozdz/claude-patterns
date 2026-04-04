---
name: task-tidy
description: "Automated task housekeeping: move done tasks, fix missing fields, validate YAML frontmatter"
origin: claude-patterns
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
effort: low
---

# /task-tidy — Task Housekeeping

Automated cleanup of `project-orchestration/`. Validates structure, fixes
missing fields, moves completed tasks, and standardizes YAML frontmatter.

**Cost**: ~$0.03 (no agents) | **When**: Weekly, after sprint, or before /pulse

## Rules Source

Task schema defined in `patterns/orchestration/project-management-system.md`.

### Required YAML Fields

```yaml
---
id: TS-XXX                          # unique, matches filename
title: 'Descriptive task title'
status: planned|ready|in-progress|blocked|done|deferred
priority: P0|P1|P2|P3
story_points: 5
created_date: YYYY-MM-DD
updated_date: YYYY-MM-DD
assignee: '@agent-or-person'
labels: [area, type]
---
```

### Folder Rules

- `tasks/` — active (planned, ready, in-progress, blocked)
- `completed-tasks/` — done
- `_archive/` — deferred

## Steps

1. **Scan** all `.md` in `tasks/` and `completed-tasks/`, parse YAML frontmatter
2. **Detect**: wrong folder, missing fields, stale dates, invalid values, broken deps
3. **Preview** grouped changes (moves, fixes, warnings)
4. **Confirm** with user (Y/N/selective)
5. **Apply** moves + field fixes, update `updated_date`

## Auto-Fix Defaults

| Missing Field | Default |
|---------------|---------|
| status | `planned` |
| priority | `P2` |
| created_date | today |
| updated_date | today |
| assignee | `'@unassigned'` |
| labels | `[]` |
| story_points | `0` |

## Safety

- Never delete files — only move between folders
- Never change status, title, id, or description
- Never modify files in completed-tasks/ (immutable)
- Always preview before applying
