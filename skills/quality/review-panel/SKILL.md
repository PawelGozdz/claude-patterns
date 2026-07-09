---
name: review-panel
description: Multi-persona code review panel. Dispatches specialized reviewer-* agents (architecture, security, performance, tests, etc.) in parallel over the current branch's diff (or a GitHub PR), synthesizes one severity-graded report, proposes fixes, and supports snapshot-based incremental re-review on later runs. Use when asked for "a thorough review", "run the reviewer panel", "/review-panel", or "review this PR with the full panel".
origin: LocalHero-patterns
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
model: sonnet
effort: medium
---

# review-panel

Reviews the current branch's changes (or a specific PR) using a panel of specialized
`reviewer-*` persona agents from `agents/universal/`. Produces one severity-graded report,
proposes concrete fixes, applies the ones you approve, and — unlike a single-pass review — gets
cheaper on every later run against the same branch because it only re-reviews what changed.

**End goal**: a reviewed, optionally auto-fixed branch. This is a *deeper, multi-agent*
complement to `/code-review` (single-pass, quick) — use `/code-review` for a fast sanity check,
`/review-panel` when you want the full panel or you're about to open/update a PR.

Never commits or pushes — it stages fixes with `Edit` only. Committing is the user's call.

## Arguments

`$ARGUMENTS` — optional:
- `--full` — ignore any saved snapshot, review everything from scratch.
- `--thorough` — dynamically select 10 of the 16 personas based on what the diff actually
  contains (see Phase 2b), instead of the fixed per-stack set.
- `--pr <number>` — review a GitHub PR's diff (`gh pr diff <number>`) instead of the local
  branch vs `origin/main`.

Infer `--thorough` from the user's language too ("thorough", "deep", "comprehensive", "full
panel") even without the flag.

## Phase 1: Resolve scope and collect the diff

1. Determine the target: current repo at cwd, or `--pr <n>` if given.
2. Confirm the branch is not `main`/`master` (warn and stop if it is — nothing to review).
3. Collect the diff:
   ```
   git diff origin/main..HEAD          # or origin/master
   git log origin/main..HEAD --oneline
   git diff origin/main..HEAD --name-only
   ```
   or, in `--pr` mode: `gh pr diff <n>` + `gh pr view <n>` for metadata.
4. **Snapshot check** (incremental mode) — full mechanism documented in
   `patterns/cross-layer/snapshot-incremental-review-pattern.md`. Snapshot path:
   `~/.claude/review-panel-snapshots/<branch-name>.json`. If it exists and `--full` was not
   passed → incremental mode (hash the changed files, skip any whose hash matches the snapshot,
   also re-check files adjacent to changed ones that share imports/types). Otherwise → full mode.
5. Announce mode and scope to the user before dispatching anything:
   ```
   Scope: <repo/PR>, branch <name>
   Mode: incremental (N changed files, M skipped from last review) — or — Mode: full review
   ```

## Phase 2: Dispatch reviewer agents in parallel

### 2a. Standard mode (default)

Read `.claude/config/project.yml` for `stack_profile` if present. Pick the fixed persona set for
that profile from the table below; if no profile or an unrecognized one, use the generic default.

| stack_profile | Personas |
|---|---|
| nestjs-ddd | eagle, security, skeptic, pragmatist, compatibility |
| flutter-clean-arch | eagle, performance, user, nitpicker, newbie |
| react / nextjs / frontend-generic | eagle, performance, user, nitpicker, newbie |
| (no profile / generic) | eagle, security, pragmatist, tester, skeptic |

`reviewer-pragmatist` is always included regardless of profile (production-blocker baseline).

### 2b. Thorough mode — dynamic selection

Scan the collected diff for signals and map to personas:

| Signal in diff | Personas |
|---|---|
| Financial/numeric calculations, rounding, currency | money |
| API/schema/contract changes, endpoint signatures | compatibility |
| Auth, tokens, secrets, PII, data exposure | security, compliance |
| UI rendering, loading/empty/error states | user, performance |
| New hooks/complex state transitions | skeptic, eagle |
| Test files changed or missing | tester |
| Deployment config, logging, error handling | ops |
| Business logic / requirement-shaped changes | product |
| Naming, readability, cognitive load | newbie, nitpicker |
| Architecture, module boundaries | eagle |
| Notably good patterns worth keeping | champion |
| Subtle language/runtime behavior (closures, async, coercion) | professor |

Select exactly 10, always including `eagle` and `pragmatist`. Present the selection with a
one-line reason per pick and wait for confirmation (`yes` / `swap X for Y` / `no` → fall back to
standard mode) before dispatching — same as the standard-mode announcement.

### 2c. Dispatch

Run all selected `reviewer-*` agents in parallel (single message, multiple `Agent` calls) as
leaves — no nested Task/Agent calls inside them. Give each agent the same context block:

```
You are reviewing a feature branch diff for <repo/service> (<stack, if known>).
Branch: <branch-name>
Commits: <commit log>
Diff to review:
<diff content — only the changed-file subset in incremental mode>
```

Collect all responses (each returns `inline_comments` JSON + a summary + internal-only
`learnings`, per its own agent file's Output Format).

## Phase 3: Synthesize report

1. **Deduplicate**: if the same file+line+root-cause is flagged by multiple agents, merge into
   one entry, keep the highest severity, combine explanations.
2. **Split** auto-fixable (naming, missing null checks, import ordering, schema-type mismatches
   with an obvious correct shape, dead code, missing error handling with a clear pattern) from
   requires-a-decision (architecture, business-logic ambiguity, breaking schema changes,
   performance trade-offs needing context).
3. **Format**:
   ```
   ## Code Review Report
   **Scope:** <repo/PR>  **Branch:** <name>  **Mode:** Full / Incremental (N changed, M skipped)

   ### 🔴 CRITICAL — N issues
   [C1] **file/path.ts:42** — `issue title`
   > problematic code snippet
   Issue: <description>   Fix: <concrete fix>

   ### 🟠 HIGH — N   ### 🟡 MEDIUM — N   ### 🔵 LOW / Nitpicks — N

   ### Proposed fixes
   | # | File | Change |
   |---|------|--------|
   | 1 | path/to/file.ts:42 | Add null check before accessing `order.id` |

   **Requires your decision:** C2, H3 (architectural/business-logic — described above)
   ```
4. Ask: `Which fixes should I apply? → all / 1,2,4 / all except 3 / none / cancel`. Wait for the
   answer before Phase 4.

## Phase 4: Apply approved fixes

For each approved fix, in order: Read the target file → Edit → confirm
(`✅ [1] path/to/file.ts:42 — null check added`). One fix at a time, never batched, so each
change is traceable. If a fix fails (file changed since the diff was collected), report it and
continue with the rest. **Never commit or push** — the user reviews and commits.

## Phase 5: Save snapshot

Write `~/.claude/review-panel-snapshots/<branch>.json` per the shape in
`patterns/cross-layer/snapshot-incremental-review-pattern.md` — hash every reviewed file,
record findings with `status: fixed|skipped|pending`. Create the snapshots directory if it
doesn't exist. Save **after** the user has acted on Phase 3/4, not before.

## Phase 6: Final summary

```
## Review Complete
✅ Applied N fixes
⏭️ Skipped: [list]
⚠️ Pending (requires your decision): [list]

Snapshot saved — next /review-panel run on this branch will be incremental.
Ready for PR when all CRITICAL and HIGH issues are resolved.
```

## Notes

- If the branch's diff vs `origin/main` is empty, say so and stop — nothing to review.
- If `origin/main` doesn't exist, try `origin/master`, then ask the user for the base branch.
- Do not invent issues — every finding must quote actual code from the diff, not assumptions
  (each `reviewer-*` agent enforces this itself via its own Verification Requirement section).
- Full agent roster: `agents/universal/reviewer-{eagle,security,performance,user,nitpicker,
  newbie,skeptic,pragmatist,money,compatibility,compliance,tester,ops,product,champion,
  professor}.md`.
