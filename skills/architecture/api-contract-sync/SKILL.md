---
name: api-contract-sync
description: On-demand check for OpenAPI schema drift between a backend and its consumer repos (mobile/web). Diffs the current schema against a saved snapshot and reports concretely what changed and which files in each consumer repo need updating. Never edits consumer repos automatically. Use when asked "did the API schema change", "what breaks in mobile/web from this backend change", or "/api-schema-sync".
origin: LocalHero-patterns
allowed-tools: Read, Write, Glob, Grep, Bash, WebFetch
model: sonnet
effort: medium
---

# api-contract-sync

Cross-repo advisory scan: reads the backend's current OpenAPI document, diffs it against the
last-known snapshot, and for every changed/added/removed endpoint or schema field, greps each
consumer repo (mobile/web) for usages and reports exactly what needs to change and where.
On-demand only — no background daemon, no hook. Full rationale and mechanism documented in
`patterns/architecture/api-contract-sync-pattern.md` (schema diff) and
`patterns/cross-layer/snapshot-incremental-review-pattern.md` (the hash-per-item snapshot
technique this reuses).

**Never edits consumer repos.** Output is always an advisory report — the developer applies
changes in each consumer repo's own context.

## Prerequisite

Requires `.claude/rules/api-clients-context.md` in the backend project (copy from
`templates/api-clients-context.md` and fill in). If missing, tell the user to create it first
and stop — don't guess at repo paths or the OpenAPI source.

## Phase 1: Resolve config and current schema

1. Read `.claude/rules/api-clients-context.md`: backend shortcut/path/`openapi_source`, list of
   consumers (shortcut/path/kind), task-id branch pattern.
2. Resolve the current OpenAPI document from `openapi_source`:
   - file path → `Read` it directly
   - URL → `WebFetch` it
   - generation command → run it (`Bash`), then read the file it produces
3. Parse endpoints (method + path) and schema components (request/response body shapes,
   required fields, types, enums).

## Phase 2: Load snapshot

Snapshot at `~/.claude/api-schema-snapshots/<backend-shortcut>.json`, same shape as
`patterns/cross-layer/snapshot-incremental-review-pattern.md`'s generic `items` map, keyed by
`"<method> <path>"` for endpoints and by schema component name for shared schemas, each with a
content hash. No snapshot yet → baseline mode (report everything as new, no "changed" diff).

## Phase 3: Diff

Compare current schema to snapshot:
- **Added endpoints** — new `"<method> <path>"` keys
- **Removed endpoints** — keys present in snapshot, absent now (breaking)
- **Changed schemas** — hash differs; drill into the fragment to report exactly what changed:
  field added / field removed / type changed / `required` changed / enum values changed

## Phase 4: Cross-repo impact scan

For each change, and for each consumer repo in the config:
1. Grep for the endpoint path as a string literal (`grep -r "<path>" <consumer-path>`).
2. Grep for generated client type/interface names matching the changed schema component.
3. Grep for the specific field name(s) that changed.
4. For every hit, produce one action item: `<consumer-shortcut>/<file>:<line> — <what changed> —
   <what to do>` (e.g. "backend changed `total` from `string` to `number` — update the parser at
   this line").

If a consumer repo's path in the config doesn't exist locally, skip it and note it was skipped
(don't fail the whole run).

## Phase 5: Task-id tagging

If the current backend branch name matches the config's task-id pattern, tag the report header
with that ID: `Coordinated change: TASK-XXX-001 — check matching branches in mobile/web`.

## Phase 6: Report and save snapshot

```
## API Contract Sync Report
**Backend:** <shortcut>  **Coordinated change:** <task-id, if matched>

### Breaking changes
- REMOVED `DELETE /orders/{id}` — used in: mobile/src/api/orders.ts:88, web/src/hooks/useOrder.ts:12

### Field changes
- `Order.total`: string → number
  - mobile/src/api/orders.ts:42 — parses `total` as string, needs update
  - web/src/hooks/useOrder.ts:30 — displays `total` directly, needs update

### New (non-breaking)
- ADDED `GET /orders/{id}/history` — no consumer usage found yet

### Skipped
- web: path ../my-web-app not found locally, skipped
```

After the developer confirms they've reviewed the report, save the updated snapshot (hash every
current endpoint/schema, per the incremental-review pattern's timing rule — after review, not
before).

## Notes

- This is a developer tool run on demand, not a CI/merge gate — don't wire it into automated
  pipelines expecting it to block deploys.
- If the OpenAPI document can't be resolved (file missing, URL unreachable, command fails),
  report that clearly and stop — don't fabricate a schema.
- Grep-based usage detection is a heuristic, not exhaustive static analysis — the report is a
  starting point for the developer's own review, not a guarantee every affected line is found.
