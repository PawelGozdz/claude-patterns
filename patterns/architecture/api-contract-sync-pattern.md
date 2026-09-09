# Pattern: Cross-Repo API Contract Sync

**Tags**: "api:api-surface:contract", "any:process"

**Layer**: Architecture
**Status**: production

## What This Is

A way to keep a backend's API contract (OpenAPI/Swagger schema) and its consumers (mobile app,
web app — each in their own repo) from silently drifting apart. Instead of consumers discovering
a breaking change at runtime (or a human manually diffing `openapi.json` by eye), a skill reads
the backend's current schema, diffs it against the last-known snapshot (see the
snapshot-based-incremental-review pattern for the diff mechanism), and for every changed endpoint
or schema fragment, greps each consumer repo for usages and reports concretely what needs to
change and where — per repo, without editing any of them automatically.

This is advisory tooling, not a build-time contract-testing gate (e.g. Pact, OpenAPI diff CI
checks) — it's meant for the moment a developer is *about to* make a coordinated backend + client
change and wants a concrete "here's what breaks" report before splitting the work across repos.

## When to Use

**Use this pattern for:**
- ✅ Backend and its consumers (mobile/web) live in **separate repositories** with no shared
  monorepo tooling to catch contract drift automatically.
- ✅ A change to the backend's API is being planned or is in progress, and you want to know its
  blast radius across consumers before (or while) making the change.
- ✅ You want to coordinate a backend change with matching client changes under the same task/PR
  identifier, so the work can proceed in parallel across repos instead of serially.

**Do NOT use for:**
- ❌ A substitute for real contract testing (schema validation in CI) — this is a point-in-time
  advisory scan a developer runs on demand, not a merge gate.
- ❌ Auto-editing consumer repos — always leave the edit to a human (see Anti-Patterns).
- ❌ A monorepo with shared types already catching drift at compile time — no need for the scan.

## Implementation

**Per-project config** (`.claude/rules/api-clients-context.md` in the consuming project, not in
claude-patterns itself — this is project-specific data):
```markdown
## Backend
- shortcut: backend
- path: ../my-backend
- openapi_source: <path to openapi.json, a URL, or a command that generates it>

## Consumers
- shortcut: mobile
  path: ../my-mobile-app
  kind: mobile
- shortcut: web
  path: ../my-web-app
  kind: web

## Task-id convention
- branch pattern: TASK-<ID>-*
```

**Flow**:
1. Resolve the backend's current OpenAPI document from `openapi_source` (read local file, run the
   declared generation command, or fetch the URL).
2. Load the last snapshot for this backend (`~/.claude/api-schema-snapshots/<backend-shortcut>.json`)
   using the snapshot-based-incremental-review pattern — hash per endpoint/schema fragment.
3. Diff: added endpoints, removed endpoints, changed request/response fields (added/removed/
   type-changed/required-changed), changed enum values.
4. For each change, grep every consumer repo for usages: endpoint path string literals, generated
   client type names, field names matching the changed schema. Produce one concrete action item
   per hit ("`mobile-app/src/api/orders.ts:42` uses `order.total` — backend changed `total` from
   `string` to `number`, update the parser").
5. If the current branch name matches the configured task-id convention, tag the report with that
   ID so matching branches in the consumer repos (same task, different repo) can be worked in
   parallel and cross-referenced.
6. Never edit consumer repos automatically — cross-repo writes without a human reviewing each
   repo independently are too risky; the output is always an advisory report.
7. After the developer has acted on the report, save the updated snapshot (same timing rule as
   the incremental-review pattern: after review, not before).

## Anti-Patterns

- **Auto-editing consumer repos** — even a "safe-looking" field rename can hide semantic changes
  a grep-based scan can't see; always leave the edit to a human in the consumer repo's own context.
- **Treating this as a CI gate** — it's an on-demand developer tool, not contract-testing
  automation; don't wire it into a merge check expecting it to block bad deploys.
- **Storing the config or snapshot inside claude-patterns** — both are project-specific
  (`.claude/rules/` in the consuming project) or session state (`~/.claude/`), never checked into
  this shared repo.
- **Skipping the task-id tag** — without it, a backend change and its matching mobile/web changes
  have no way to be recognized as "the same coordinated change" across separate repos and PRs.
