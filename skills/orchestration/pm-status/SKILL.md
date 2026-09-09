---
name: pm-status
description: "Quick PM briefing — reads TEAM-STATE.md only, no agent spawn, instant"
origin: LocalHero
allowed-tools: Read
model: haiku
effort: low
disable-model-invocation: true
---

# /pm-status — Quick Status

Instant project state. Reads `project-orchestration/TEAM-STATE.md` only.
No agents, no cost, results in seconds.

**Cost**: ~$0 (read only) | **When**: Any time — morning check, before a task, mid-session

## Steps

### 1. Read TEAM-STATE.md

Read `project-orchestration/TEAM-STATE.md`.

If the file doesn't exist:
> "TEAM-STATE.md not found. Run `/pulse` to initialize the project management system."
> Stop here.

### 2. Display formatted status

Output this format, filled **only** from the file's content — never from memory,
never from a plausible-looking guess. Every `{placeholder}` that the file does not
answer stays as `—`:

```
[PM STATUS] Last pulse: {date} by @{agent}

Sprint: {Sprint Focus content}

🔴 CRITICAL:
  {Critical Now section — each item as a bullet}

Tech: Debt {icon+level} | Blocked: {N} | Stale: {N}
Business: {milestone} ~{weeks}w | Unvalidated: {N} | Mobile: {N}

Last notes:
  {3 most recent Team Notes, one per line}

→ Run /pulse for full analysis (updates both sections)
```

### 3. If TEAM-STATE.md is stale (>2 days since last sync)

Append the warning:

```
⚠️  Last pulse was {N} days ago — consider running /pulse
```
