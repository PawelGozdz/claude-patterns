# Pattern: Snapshot-Based Incremental Review

**Layer**: Cross-Layer
**Status**: production

## What This Is

A technique for making repeated automated reviews (code review, schema-drift checks, or any
"scan a moving target and report what changed") cheap on the second and subsequent runs. The
first run reviews everything and writes a **snapshot**: a JSON file keyed by branch/target,
recording a content hash per reviewed item (file, endpoint, schema fragment — whatever the unit
of review is) plus the findings themselves. Every later run loads the snapshot, re-hashes the
current items, and only re-reviews items whose hash changed. Everything else is reported as
"previously reviewed, no changes" without spending a single agent call on it.

This is the mechanism behind the `review-panel` skill (code review) and the
`api-contract-sync` skill (OpenAPI drift detection) — both scan a target that changes
incrementally between invocations, and both would waste tokens re-reviewing unchanged material
on every run without this.

## When to Use

- The same target (repo branch, API surface, config set) gets reviewed/scanned **repeatedly**
  over its lifetime (e.g. every time a PR is updated), not just once.
- The unit of review is hashable and stable enough that "hash unchanged" reliably means "content
  unchanged" (files via git object hash, JSON schema fragments via a stable serialization hash).
- Re-running the full review every time would be expensive (many agent dispatches) relative to
  how much actually changed between runs.

Don't use it for one-shot reviews (a single PR that will never be re-reviewed) — the snapshot
bookkeeping is pure overhead there.

## Implementation

**Snapshot location**: `~/.claude/<tool-name>-snapshots/<target-key>.json` (target-key is
typically a branch name or a repo shortcut — never write snapshots into the reviewed repo itself,
they are session/tool state, not project state).

**Snapshot shape** (generic — adapt `items` to the domain, example values are placeholders):
```json
{
  "timestamp": "2026-07-07T12:00:00Z",
  "target": "feature/example-branch",
  "mode": "full | incremental",
  "items": {
    "src/example/file.ts": { "hash": "a1b2c3d4", "status": "reviewed" }
  },
  "findings": [
    { "id": "C1", "item": "src/example/file.ts", "severity": "CRITICAL", "status": "fixed | skipped | pending" }
  ],
  "summary": { "total": 0, "fixed": 0, "skipped": 0, "pending": 0 }
}
```

**Flow on each invocation**:
1. Load snapshot for the target if it exists and `--full` was not requested. No snapshot or
   `--full` → full mode, review everything, write a fresh snapshot at the end.
2. Compute current hashes for all items in scope.
3. Diff against snapshot: hash changed → include in this run; hash unchanged → skip, mark
   "previously reviewed, no changes".
4. For unit types with dependencies (e.g. a file importing another file, an endpoint sharing a
   schema with another), also re-check items *adjacent* to changed ones — a changed dependency can
   silently break something whose own hash didn't move.
5. If the snapshot recorded prior findings with `status: pending` or `fixed`, spot-check that
   fixed items are still fixed (read the relevant line) rather than trusting the old status blindly.
6. Run the actual review/scan only on the reduced set from steps 3-4.
7. Report explicitly: "Incremental run: N items changed, M skipped unchanged, K previously-fixed
   items verified, J new findings" — never silently hide the skip count, the user needs to know
   the run wasn't exhaustive.
8. Write the updated snapshot after the user has reviewed/applied findings (not before — a
   snapshot written before fixes are applied would mark unfixed issues as if the run were final).

## Anti-Patterns

- **Snapshot written before findings are resolved** — locks in "reviewed" status for items that
  still have open findings, so a later run treats them as clean.
- **Trusting hash-unchanged for cross-item dependencies** — a file's own content didn't change but
  a type it imports did; skipping it without the adjacency check in step 4 produces false
  negatives.
- **Snapshot stored inside the reviewed repo** — pollutes the repo with tool state and risks being
  committed; always store under `~/.claude/`, keyed by target, never in-repo.
- **Silent skip counts** — reporting only the new findings without saying how many items were
  skipped as unchanged makes an incremental run look like a full one; always report both numbers.
