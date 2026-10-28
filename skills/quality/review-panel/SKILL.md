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
complement to `/ecc:code-review` (single-pass, quick) — use `/ecc:code-review` for a fast sanity check,
`/review-panel` when you want the full panel or you're about to open/update a PR.

Never commits or pushes — it stages fixes with `Edit` only. Committing is the user's call.

## Arguments

`$ARGUMENTS` — optional:
- `--full` — ignore any saved snapshot, review everything from scratch **and** run the whole
  planned panel with no adaptive skipping (Phase 2c).
- `--thorough` — dynamically select 10 of the 16 personas based on what the diff actually
  contains (see Phase 2b), instead of the fixed per-stack set. Also disables adaptive skipping.
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

Read `.claude/config/runtime.yml` and take its top-level `stack_blocks:` list — the
composition is what actually describes this project (ADR 0008). `stack_profile` in
`project.yml` is only a CLAUDE.md template selector and must not be used here.

Take the **union** of the persona sets of every block that matches, then cap the panel at
six by dropping the personas the fewest matched rows asked for. If `runtime.yml` is missing
or nothing matches, use the generic default row.

| block in `stack_blocks` | Personas |
|---|---|
| `nestjs`, `node`, any `ddd/*` (`ddd/core`, `ddd/cqrs`, `ddd/events`, `ddd/acl`, `ddd/layers`) | eagle, security, skeptic, pragmatist, compatibility |
| `flutter`, `clean-arch`, `mobile-security` | eagle, performance, user, nitpicker, newbie |
| `nextjs`, `sveltekit` | eagle, performance, user, nitpicker, newbie |
| `ts-library`, `library-layers` | eagle, compatibility, tester, pragmatist, professor |
| `kysely`, `zod`, `polyglot-store` | security, compatibility, skeptic |
| `python`, `ml-pipeline` | eagle, security, pragmatist, tester, skeptic |
| (no `runtime.yml` / nothing matched) | eagle, security, pragmatist, tester, skeptic |

`reviewer-pragmatist` is always included regardless of composition (production-blocker
baseline) — it survives the cap.

The first three rows are the old `stack_profile` sets carried over unchanged
(`nestjs-ddd`, `flutter-clean-arch`, `react/nextjs/frontend-generic`). The rest are new:
`ts-library` leans on the API-surface personas because a library's breaking change is its
whole risk, and `python`/`ml-pipeline` had no profile row, so they inherit the generic
default.

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

### 2c. Adaptive reviewer selection (B3, TASK-GSTACK-ADOPT-001)

A reviewer that found nothing in its last 10 invocations in this project is skipped by default —
the panel costs less without losing detection, because the reviewers that keep finding things
still run. The data is the panel's own telemetry events (`process: review-panel`, see "Stats log"
below).

**Skip this step entirely — run the whole panel from 2a/2b — when** `--full` or `--thorough` was
given (or inferred), or the stats call below fails. Otherwise, after 2a/2b produced the planned
panel, ask the script what to do with it (`<project>` = repo directory name, or the PR's repo):

```
node <claude-patterns>/scripts/reviewer-stats.mjs --select eagle,security,pragmatist,... --project <project> --json
```

It returns `run` (dispatch these), `skip` (do not dispatch; each has a `reason`) and `probe`
(reviewers in `run` that are control invocations of a skipped reviewer). Rules:

- no data or fewer than 10 invocations for a reviewer = **always run** (the script says `brak danych` /
  `za mało danych`);
- `NEVER_GATE` — `reviewer-security`, `reviewer-compliance`, `reviewer-pragmatist` — are never in `skip`,
  whatever their history (pragmatist is the panel's blocking-decision floor);
- every 10th skipped panel a skipped reviewer is run once as a `probe`; a finding resets its streak;
- the script exits non-zero (exit 2 = corrupt telemetry event or legacy log: it names the file and
  line) → **run the full panel** and say in the report "adaptive selection off: <error>". Never treat
  a failed call as "no skips needed" silently and never repair or delete the data file yourself.

Every skipped reviewer is named in the report (Phase 3, section "Skipped reviewers"). Nothing
disappears silently, and the user can override with `--full`.

### 2d. Dispatch

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

**Record the outcome** (one call per panel run, right after collecting, before deduplication — a
finding later merged into another reviewer's entry still counts for the reviewer who found it):

```
node <claude-patterns>/scripts/reviewer-stats.mjs --record --project <project> \
  --ran eagle=<N inline_comments>,security=<N>,... --skipped nitpicker,newbie
```

- `--ran` lists only reviewers that returned a parseable response; `N` = length of that
  reviewer's `inline_comments` array (0 for a clean response). A reviewer that errored, timed out
  or returned garbage is **not** recorded as `ran` (a failure is not a clean pass) — mention it in
  the report.
- `--skipped` lists the reviewers from the `skip` list of 2c. In forced mode (`--full` /
  `--thorough` / stats call failed) there is no `--skipped`.
- Incremental run with nothing to dispatch → nothing to record.
- A failed `--record` is reported to the user in one line; it does not stop the review.

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
   Add one more section to every report, even when the list is empty:
   ```
   ### Skipped reviewers (adaptive selection)
   - reviewer-nitpicker — 12 invocations in a row without a finding (threshold 10); control run in 6 panels
   - none skipped — <reason: forced by --full/--thorough | too little data | stats unavailable: <error>>
   ```
   One line per skipped reviewer, with the `reason` from the script. `--full` runs the whole panel.
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

## Stats log (adaptive selection)

- Source: telemetry v1 events (ADR 0012, annex "review-panel") in `telemetry/events/<YYYY-MM>.jsonl` of
  claude-patterns, outside git and per machine like the rest of the telemetry. One `step.end` per
  reviewer per panel run: `step.id` = reviewer name, `outcome` `ok` + `step.findings` (count) or
  `skipped`. Counts only — no diff, paths, branch or finding text. Written only through
  `reviewer-stats.mjs --record`, never into the reviewed repo.
- Location: the events live in the claude-patterns checkout the script runs from (`telemetry/events/`,
  override: `CLAUDE_TELEMETRY_DIR`), no longer under `~/.claude/`. A fresh clone or worktree starts with
  no data, so every reviewer runs (fail-safe) until it collects its own history.
- Migration: a legacy log from before telemetry (`~/.claude/review-panel-stats/invocations.jsonl`)
  is imported once, on the first `--record` / `--select` / table call, and renamed to
  `invocations.jsonl.migrated`. No such file = nothing happens. A corrupt legacy file stays untouched
  and the call exits 2.
- Inspect: `node <claude-patterns>/scripts/reviewer-stats.mjs [--project <name>] [--json]` prints per
  reviewer the invocations, invocations with a finding, the trailing zero streak, and
  `[GATE_CANDIDATE]` / `[NEVER_GATE]`. Wiring check: `reviewer-stats.mjs --check-config`.

## Notes

- If the branch's diff vs `origin/main` is empty, say so and stop — nothing to review.
- If `origin/main` doesn't exist, try `origin/master`, then ask the user for the base branch.
- Do not invent issues — every finding must quote actual code from the diff, not assumptions
  (each `reviewer-*` agent enforces this itself via its own Verification Requirement section).
- Full agent roster: `agents/universal/reviewer-{eagle,security,performance,user,nitpicker,
  newbie,skeptic,pragmatist,money,compatibility,compliance,tester,ops,product,champion,
  professor}.md`.
