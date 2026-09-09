---
name: task-tidy
description: "Automated task housekeeping: move done tasks, fix missing fields, validate YAML frontmatter"
origin: claude-patterns
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
model: haiku
effort: low
disable-model-invocation: true
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

### Extended Fields (optional — these are what make the PM commands useful)

```yaml
due_date: YYYY-MM-DD
mobile_impact: none|low|medium|high
tech_debt: none|minor|major
dependencies: [TS-AAA, TS-BBB]
blocks: [TS-CCC]
story_id: US-XXX
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
                tasks/ or vice versa — deferred belongs in
                _archive/), stale (updated_date >14d ago and status is not
                done), invalid_values[] (status outside
                planned|ready|in-progress|blocked|done|deferred, priority
                outside P0|P1|P2|P3, any date not matching YYYY-MM-DD),
                filename_id_mismatch (filename stem != id field),
                broken_refs[] (IDs in dependencies:/blocks: that exist in
                neither tasks/ nor completed-tasks/) }. Format: YAML.
              Required fields: id, title, status, priority, story_points,
              created_date, updated_date, assignee, labels.',
      description='Task scan (Haiku)')
```

### Phase 2 — Preview, confirm, apply (main session)

1. Group findings into four buckets: **moves** (wrong folder), **field fixes**
   (missing required fields), **warnings** (stale, invalid values, filename/id
   mismatch, broken `dependencies:`/`blocks:` refs), **clean**.
2. Display the preview:

   ```
   [TASK-TIDY] Scanned {N} tasks

   WILL MOVE ({N} files):
     tasks/TS-XXX.md → completed-tasks/ (status: done)
     tasks/TS-YYY.md → _archive/ (status: deferred)

   WILL FIX ({N} fields):
     TS-AAA: +priority: P2, +updated_date: {today}

   WARNINGS ({N} issues):
     TS-CCC: updated_date is {N} days old (stale)
     TS-DDD: depends on TS-ZZZ which doesn't exist
     TS-EEE: filename 'old-name.md' doesn't match id 'TS-EEE'

   NO CHANGES NEEDED: {N} tasks are clean
   ```

   Warnings are reported, never auto-fixed — every one of them needs a human
   to decide what the right value is.
3. Ask: "Apply {N} moves and {N} field fixes? (Y / N / selective)"
   — **selective** lets the user name which fixes to take.
4. Apply: write missing fields with the defaults below (`mv` for moves, `Edit`
   for frontmatter), then set `updated_date` to today on every file touched.
5. Close with:

   ```
   [TASK-TIDY] Done
     Moved: {N} files ({N} → completed-tasks/, {N} → _archive/)
     Fixed: {N} fields across {N} tasks
     Warnings: {N} (manual review needed)
   ```

## Auto-Fix Defaults

| Missing Field | Default |
|---------------|---------|
| id | derived from the filename (stem, `.md` stripped) |
| title | the id — and flag it for manual review |
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
- Only add or fix metadata fields — never remove one
- Always preview before applying
