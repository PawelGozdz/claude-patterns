# Database Migrations — Expand/Contract & Irreversibility

> Added by TS-INFRA-RELEASE-001 (trunk-based CI/CD: every merge to `main` deploys and migrates
> automatically). Once `main` deploys on every merge, there is no longer a human gate between
> "migration written" and "migration applied to the environment with live user data" — these two
> rules exist to keep that automatic path safe.

## Expand/Contract is mandatory

Every merge to `main` deploys **and** migrates. There is no window to hand-run a migration,
watch it, and decide whether to proceed — the pipeline does both in the same run
(`.github/workflows/deploy-demo.yml`, job `migrate`, before `deploy`). This makes the classic
two-step schema change (rename a column, drop a column, change a type) unsafe as a single
migration: the OLD application code (still serving traffic from the previous revision while the
new one boots, and any in-flight request against the old revision) can be hit by a schema shape
the new migration already changed underneath it.

**Rule**: a breaking schema change is always **two separate migrations in two separate
releases**, never one:

1. **Expand** (this release): add the new column/table/index alongside the old one. Both old and
   new application code must work against the expanded schema. Backfill data if needed.
2. **Contract** (a later, separate release, after the expand release has been running with no old
   code path left referencing the old shape): drop/rename the old column/table.

Never combine expand and contract in the same migration file or the same release. See
`src/shared/database/migrations/211_service_offerings_category_expand_contract.ts` and
`212_job_requests_category_expand_contract.ts` for the pattern already in use in this codebase.

## Marking a migration irreversible

Some migrations cannot be safely undone by their own `down()` — a destructive `DROP COLUMN`
that already ran, a data transform with no inverse, an enum value removal. The interface still
requires a `down()` implementation (best-effort or a documented throw), but the migration must
additionally declare itself via the optional `irreversible` field:

```ts
export default class DropLegacyColumn implements Migration {
  readonly id = '312_drop_legacy_column';
  // ...
  readonly irreversible = {
    reason: 'DROP COLUMN legacy_status — data is not recoverable from down(); down() is a no-op.',
  };
  // ...
}
```

This is an **opt-in field on the existing `Migration` interface**
(`src/shared/database/migrations/types.ts`) — not a source comment (too easy to miss in review or
a CI scan) and not a required field on every migration (would force editing ~309 existing files
for zero safety benefit).

### What the pipeline does with it

The migration entrypoint (`src/shared/database/migrations/cli.ts`, run by the Container Apps Job
`localhero-migrate` in `deploy-demo.yml`) refuses to apply any migration flagged `irreversible`
when the run was triggered automatically (`push` to `main`). To proceed, re-run the
`Deploy to Demo` workflow manually via `workflow_dispatch`, setting
`confirm_irreversible_migration_ids` to the **exact, comma-separated list of migration IDs**
being confirmed — never a bare `confirm_irreversible=true`. Confirmation is bound to specific
IDs so a human reviewing the `workflow_dispatch` form cannot wave through an irreversible
migration they never saw named.

## PR checklist

`.github/PULL_REQUEST_TEMPLATE.md` asks explicitly whether a PR's migration is expand/contract
shaped and whether any migration in it is irreversible — answer honestly, not by omission; a
"no" that should have been "yes" reaches production on the next merge with no further review
step in between.
