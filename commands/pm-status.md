---
name: pm-status
description: |
  Quick PM briefing — reads TEAM-STATE.md only, no agents spawned, instant (~$0).
  Shows: critical items, last pulse date, tech + business pulse summary.
tools: Read
model: haiku
---

# /pm-status — Quick Status

Instant project state. Reads `project-orchestration/TEAM-STATE.md` only.
No agents, no cost, results in seconds.

**Cost**: ~$0 | **When**: Any time — morning check, before a task, mid-session

## Workflow

### 1. Read TEAM-STATE.md

Read `project-orchestration/TEAM-STATE.md`.

If file doesn't exist:
> "TEAM-STATE.md not found. Run `/pulse` to initialize the project management system."
> Stop here.

### 2. Display formatted status

Output this format (fill from file content):

```
[PM STATUS] Last pulse: {date} by @{agent}

Sprint: {Sprint Focus content}

🔴 CRITICAL:
  {Critical Now section — each item as bullet}

Tech: Debt {icon+level} | Blocked: {N} | Stale: {N}
Business: {milestone} ~{weeks}w | Unvalidated: {N} | Mobile: {N}

Last notes:
  {3 most recent Team Notes, one per line}

→ Run /pulse for full analysis (updates both sections)
```

### 3. If TEAM-STATE.md is stale (>2 days since last sync)

Add warning:
```
⚠️  Last pulse was {N} days ago — consider running /pulse
```
