---
name: pr-ops
description: List and triage open PRs in the current repo, or deep-dive one PR's review comments and classify them into blocking/question/resolved action items. Read-only — never posts comments or changes PR state. Use when asked "what PRs are open", "check my PRs", "triage comments on PR 142", or "/pr-ops".
origin: LocalHero-patterns
allowed-tools: Read, Glob, Grep, Bash
model: sonnet
effort: low
---

# pr-ops

Advisory, read-only PR triage for the current repo, backed by the `gh` CLI. Two modes: list all
open PRs (spot what needs attention), or deep-dive one PR's comments (spot what's actually
blocking vs already resolved).

**Boundary**: this skill never posts comments, approves, or changes PR state. For that, use
`gh pr review`/`gh pr comment` directly, or the ECC `pr`/`review-pr` commands. `pr-ops` only reads
and reports.

## Arguments

`$ARGUMENTS` — optional:
- (none) → list mode, all open PRs in the current repo
- `<PR number>` → deep-dive mode on that PR's comments
- `--all` (list mode only) → include closed/merged PRs from the last 30 days, not just open

## Mode A: List open PRs

1. `gh pr list --state open --json number,title,author,createdAt,updatedAt,isDraft` (add
   `--state all --limit 30` if `--all`).
2. For each PR, gather:
   - `gh pr checks <n>` → CI status (passing/failing/pending)
   - Review status from the `gh pr list --json reviewDecision` field (or `gh pr view <n>`)
   - Unresolved comment count: `gh api repos/{owner}/{repo}/pulls/{n}/comments --jq 'length'`
   - Age: days since `createdAt`; staleness: days since `updatedAt`
3. Sort: failing CI or `REVIEW_REQUIRED`/changes-requested first, then by staleness (oldest
   `updatedAt` first).
4. Report as a table:
   ```
   | # | Title | Author | Age | CI | Review | Unresolved comments |
   |---|-------|--------|-----|----|----|----|
   | 142 | Add X | @user | 5d (stale 3d) | ❌ failing | changes requested | 3 |
   ```
5. One-line flag per PR that needs action today (failing CI, changes requested, stale >7 days).

## Mode B: Deep-dive one PR's comments

1. `gh pr view <n> --json title,body,state,reviews` for PR metadata and formal reviews.
2. `gh api repos/{owner}/{repo}/pulls/{n}/comments` for inline review comments (includes
   `in_reply_to_id` for threading — use it to detect resolved threads: a comment thread where the
   last reply is from the PR author acknowledging/fixing counts as resolved even without GitHub's
   "Resolved" flag, which the API doesn't always expose cleanly).
3. `gh api repos/{owner}/{repo}/issues/{n}/comments` for top-level (non-inline) conversation
   comments.
4. Classify each comment thread:
   - 🔴 **Blocking/unresolved** — a change was requested and the thread has no reply, or the last
     reply doesn't address it.
   - 🟡 **Question/needs response** — a reviewer asked something, no answer yet.
   - 🟢 **Resolved/nitpick** — last reply acknowledges or fixes it, or it's phrased as optional
     ("nit:", "non-blocking", "up to you").
5. If the PR's branch name or title matches `TASK-[A-Z]+-\d+`, check whether
   `docs/tasks/<match>.md` exists in this repo and note the link.
6. Report:
   ```
   ## PR #142 — <title>
   🔴 Blocking (2): <file:line — one-line summary> ...
   🟡 Needs response (1): ...
   🟢 Resolved (4): ...
   Linked task: docs/tasks/TASK-XXX-001.md (if matched)
   ```

## Notes

- If `gh` is not authenticated or the repo has no `origin` pointing at GitHub, say so and stop —
  don't guess at a repo slug.
- Never fabricate a PR's status — every field comes from an actual `gh`/`gh api` call, not
  inference from the title.
- This is advisory only: it never calls `gh pr review`, `gh pr comment`, `gh pr merge`, or
  anything that mutates PR state.
