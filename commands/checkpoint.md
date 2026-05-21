---
description: Save session state snapshot for cross-session continuity
---

# Checkpoint Command

Create or verify a checkpoint in your workflow.

## Usage

`/checkpoint [create|verify|list] [name]`

## Create Checkpoint

When creating a checkpoint:

1. Run `/verify quick` to ensure current state is clean
2. Create a git stash or commit with checkpoint name
3. Log checkpoint to `.claude/checkpoints.log`:

```bash
echo "$(date +%Y-%m-%d-%H:%M) | $CHECKPOINT_NAME | $(git rev-parse --short HEAD)" >> .claude/checkpoints.log
```

4. Report checkpoint created

## Verify Checkpoint

When verifying against a checkpoint:

1. Read checkpoint from log
2. Compare current state to checkpoint:
   - Files added since checkpoint
   - Files modified since checkpoint
   - Test pass rate now vs then
   - Coverage now vs then

3. Report:
```
CHECKPOINT COMPARISON: $NAME
============================
Files changed: X
Tests: +Y passed / -Z failed
Coverage: +X% / -Y%
Build: [PASS/FAIL]
```

## List Checkpoints

Show all checkpoints with:
- Name
- Timestamp
- Git SHA
- Status (current, behind, ahead)

## Workflow

Typical checkpoint flow:

```
[Start] --> /checkpoint create "feature-start"
   |
[Implement] --> /checkpoint create "core-done"
   |
[Test] --> /checkpoint verify "core-done"
   |
[Refactor] --> /checkpoint create "refactor-done"
   |
[PR] --> /checkpoint verify "feature-start"
```

## Handoff Mode

`/checkpoint handoff` creates or updates `.claude/SESSION_STATE.md` — a human-readable
document for cross-session continuity. Different from `create`: no git stash, just a
prose snapshot of where you are so the next session can pick up without reconstructing
context from git log.

When running handoff mode:

1. Run `git rev-parse --short HEAD` to get current SHA
2. Ask the user (or infer from conversation):
   - **Current phase** — what task/wave/epic are we in?
   - **Completed this session** — concrete items done (commits, decisions)
   - **Remaining work** — ordered list, top = next thing to do
   - **Environment state** — pending migrations, services that need to be running
   - **Resume command** — exact command(s) for next session start
   - **Notes for next Claude** — gotchas, in-progress decisions, what NOT to touch
3. Write `.claude/SESSION_STATE.md` using `templates/SESSION_STATE.md.template` format:

```markdown
# Session State — {project name}

> Handoff document. Update at end of each session with `/checkpoint handoff`.
> Read at start of next session before doing anything.

---

## Last Updated

{YYYY-MM-DD HH:MM} | {git SHA}

## Current Phase

{current phase}

## Completed This Session

- {item}

## Remaining Work

- [ ] {next}
- [ ] {after that}

## Environment State

- Migrations: {pending/applied}
- Services: {anything that needs to be running}
- Notes: {anything non-obvious}

## Resume Command

```bash
{command}
```

## Notes for Next Claude

{notes}
```

4. Report: `SESSION_STATE.md updated — {N} remaining items, resume with: {command}`

## Arguments

$ARGUMENTS:
- `create <name>` - Create named git checkpoint
- `verify <name>` - Verify against named checkpoint
- `list` - Show all checkpoints
- `clear` - Remove old checkpoints (keeps last 5)
- `handoff` - Write/update `.claude/SESSION_STATE.md` for cross-session continuity
