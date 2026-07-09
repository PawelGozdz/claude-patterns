---
name: pr-ops
description: |
  List and triage open PRs in the current repo, or deep-dive one PR's review
  comments (blocking / question / resolved). Read-only, backed by gh CLI.

  Examples:
    /pr-ops
    /pr-ops 142
    /pr-ops --all

  Usage: /pr-ops [<PR number>] [--all]

tools: Read, Glob, Grep, Bash, Skill
disallowedTools: Write, Edit, MultiEdit, NotebookEdit
---

# /pr-ops — PR List & Comment Triage

Thin wrapper that invokes the `pr-ops` skill from `skills/vcs/pr-ops/`. The skill performs:

- **List mode** (no argument): all open PRs with CI status, review status, unresolved comment
  count, sorted by what needs attention first
- **Deep-dive mode** (`<PR number>`): classifies every review comment thread as blocking /
  needs-response / resolved, optionally links to a matching `docs/tasks/TASK-*.md`

**Read-only** — never posts comments, approves, or merges. For those actions use `gh pr review`
directly or ECC's `pr`/`review-pr` commands.

## When to use

- Start of day: "what PRs need my attention" → list mode
- Before re-requesting review or merging: "is everything on this PR actually resolved" →
  deep-dive mode

## Related

- `/review-panel` — run the reviewer-persona panel on a PR's diff (`--pr <n>`)
- `/code-review` — quick single-agent review
- Skill source: `skills/vcs/pr-ops/SKILL.md`

---

Invoke skill: `pr-ops`
