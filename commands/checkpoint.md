---
name: checkpoint
description: Write or refresh `.claude/work/SESSION_STATE.md` — the handoff note for the next session. Git checkpoints live in `/ecc:checkpoint`.
allowed-tools: Read, Write, Edit, Bash, Glob
---

# Checkpoint Command (handoff only)

## Usage

`/checkpoint handoff` — the only mode this command has.

Tryby `create` / `verify` / `list` / `clear` (stash + `.claude/checkpoints.log`) przeszły
do ECC: **`/ecc:checkpoint`**. Zostaje tu wyłącznie `handoff`, bo ECC nie ma równoważnika —
patrz [ADR 0009](../docs/adr/0009-wynik-spike-fazy-0-i-lista-retire.md).

## Handoff Mode

`/checkpoint handoff` creates or updates `.claude/work/SESSION_STATE.md` — a human-readable
note for cross-session continuity. **It is a scratch note, not a project document:**
`.claude/work/` is git-ignored (add it to `.gitignore` if it is not), so a stale handoff
never gets committed and never gets read as project state months later. Project state
lives in `project-orchestration/TEAM-STATE.md` and `KANBAN.md`; decisions in
`docs/decisions/`. Different from `/ecc:checkpoint create`: no git stash, just a
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
3. Write `.claude/work/SESSION_STATE.md` using `templates/SESSION_STATE.md.template` format:

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

4. Report: `.claude/work/SESSION_STATE.md updated — {N} remaining items, resume with: {command}`

## Arguments

$ARGUMENTS:
- `handoff` (default) — write/update `.claude/work/SESSION_STATE.md` (git-ignored scratch)
- anything else — powiedz użytkownikowi, że ten tryb jest w `/ecc:checkpoint`, i nie rób nic
