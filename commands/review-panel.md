---
name: review-panel
description: |
  Multi-persona code review panel — dispatches specialized reviewer-* agents
  in parallel, synthesizes a severity-graded report, proposes fixes, supports
  snapshot-based incremental re-review.

  Examples:
    /review-panel
    /review-panel --thorough
    /review-panel --pr 142

  Usage: /review-panel [--full] [--thorough] [--pr <number>]

tools: Read, Write, Edit, Glob, Grep, Bash, Task, Skill
disallowedTools: MultiEdit, NotebookEdit
---

# /review-panel — Multi-Agent Code Review Panel

Thin wrapper that invokes the `review-panel` skill from `skills/quality/review-panel/`. The
skill performs:

- **Diff collection** for the current branch vs `origin/main` (or a GitHub PR via `--pr`)
- **Snapshot check** for incremental re-review (only changed files re-reviewed on later runs)
- **Panel dispatch**: standard mode uses a fixed persona set per `stack_profile`; `--thorough`
  dynamically selects 10 of the 16 `reviewer-*` personas based on diff signals
- **Synthesis**: dedupe findings, split auto-fixable vs requires-decision, severity-graded report
- **Apply fixes** one at a time on approval (never commits/pushes)
- **Snapshot save** so the next run on the same branch is incremental

## What this command may write — closed list

1. `~/.claude/review-panel-snapshots/<branch>.json` — the incremental-review snapshot;
2. source files touched by fixes the user explicitly approved in Phase 3.

Never commits, never pushes. `Write`/`Edit` were denied until 2026-08-14, which killed
both Phase 4 (apply approved fixes) and Phase 5 (save snapshot) — incremental mode could
never actually engage. The guard is the approval step in Phase 3, not a missing tool.

## When to use

- Before opening or updating a PR, when you want deeper coverage than a quick pass
- When the diff touches multiple concerns (security + performance + tests) and a single
  reviewer would miss cross-cutting issues
- Repeatedly on the same branch as it evolves — incremental mode keeps it cheap

## When NOT to use

- A quick sanity check on a small change — use `/code-review` instead (single-pass, faster)
- Full STRIDE/DREAD/LINDDUN security analysis — use `/security-review` (the panel's
  `reviewer-security` persona is a lighter pass, not a replacement)

## Related

- `/code-review` — quick, single-agent review
- `/security-review` — full STRIDE/DREAD/LINDDUN pass
- `/pr-ops` — list/triage PRs and their comments (before or after review)
- Skill source: `skills/quality/review-panel/SKILL.md`
- Agents: `agents/universal/reviewer-*.md` (16 personas)
- Pattern: `patterns/cross-layer/snapshot-incremental-review-pattern.md`

---

Invoke skill: `review-panel`
