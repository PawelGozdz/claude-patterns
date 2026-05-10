---
name: task-tidy
description: "Automated task housekeeping: move done tasks, fix missing fields, validate YAML frontmatter"
origin: claude-patterns
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
model: haiku
effort: low
---

# /task-tidy — Task Housekeeping

Automated cleanup of `project-orchestration/`. Validates structure, fixes
missing fields, moves completed tasks, and standardizes YAML frontmatter.

**Cost**: ~$0.01 (Haiku scan + main-session writes) | **When**: Weekly, after sprint, or before /pulse

## Architecture

**Phase 1: scan (Haiku)** — `state-reader` agent extracts YAML from every
task file and detects missing/stale/wrong-folder issues. Bounded mechanical
work, no judgment.

**Phase 2: apply (main session)** — operator confirms previewed changes,
then writes are applied. No second agent — writes are simple enough.

This split saves ~70% tokens vs. running the entire scan in main session.

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

### Phase 1 — Scan (delegated to state-reader/Haiku)

```
Agent(subagent_type='state-reader',
      prompt='Scan project-orchestration/tasks/ and completed-tasks/ — for
              every .md file extract YAML frontmatter. Report per file:
              { path, id, status, priority, has_all_required_fields[],
                missing_fields[], wrong_folder (true if status=done but in
                tasks/ or vice versa), stale (updated_date >30d ago),
                invalid_values[] }. Format: YAML.
              Required fields: id, title, status, priority, story_points,
              created_date, updated_date, assignee, labels.',
      description='Task scan (Haiku)')
```

### Phase 2 — Preview, confirm, apply (main session)

1. Group findings: moves (wrong folder), missing fields, stale, invalid
2. Display preview to user
3. Confirm Y/N/selective
4. Apply: write missing fields with defaults below; move via Bash; update `updated_date`

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
