# Rule: Geo-Spatial Query (PostGIS)
**Governs**: `patterns/infrastructure/geo-spatial-query-pattern.md` (card: `geo-spatial-query-pattern_summary.md`)
**Applies to**: any file containing `ST_*`, `<->`, or `&&` in executable SQL — query repositories,
shared query builders, migrations adding spatial columns/indexes, ACL adapters gating by location

> A spatial predicate decides **who sees whose content**. Treat it as an access-control
> mechanism with a performance profile, not a performance detail with a side effect.

## ALWAYS
- Classify the predicate before writing it: **metric** (`ST_DWithin`/`ST_Distance` in metres),
  **topological** (`ST_Intersects`), **containment** (`ST_Contains`/`ST_Within` — boundary
  **excluded**, no `geography` overload, pin `geometry` in the type), or **KNN**
  (`ORDER BY col <-> point LIMIT n`). The class dictates the cast and the index — they are
  not interchangeable, and containment vs topological is a product decision about boundary
  points, not a style choice.
- Read the column's type from the **migration** and confirm it against the live schema
  (`\d+ <table>`). Docs and ADRs have been observed declaring `GEOGRAPHY` for a `geometry`
  column and generating the bug that way.
- Confirm a matching index exists in `pg_indexes` **before** running `EXPLAIN` — if no index
  covers the predicate's exact expression, no plan can save it. This is the cheapest and most
  conclusive check.
- Include the partial index's own `WHERE` predicate (with its exact literal — `'approved'` ≠
  `'APPROVED'`) in every `EXPLAIN` assertion.
- Look for `Index Cond` in the plan, not merely `Index Scan`. A predicate demoted to `Filter`
  under an `Index Scan` node is not using the index.
- For a metric predicate on a `geometry` column: buffer the **point** in `geography` and cast
  the buffer back to `geometry`. The indexed column stays untouched.
- Route all spatial predicates through one canonical builder, and encode the column kind in
  the **type** (discriminated union), so an unsafe combination cannot compile.
- Keep an L1 guardian test asserting the emitted predicate shape per column kind (CI blocker,
  same convention as the `eventMap` guardian in [repository.md](./repository.md)), plus an L2
  case with a point exactly on the area boundary.
- Assert **both** visibility directions on the same fixture: sees, and does **not** see.
- Snap private point columns at **write** time (handler + backfill migration); expose distance
  to an untrusted consumer as a coarse bucket, never metres.
- Correct the doc/ADR that taught the wrong shape in the SAME change as the query fix.

## NEVER
- NEVER cast an indexed column (`col::geography`) unless a functional GiST exists on exactly
  that expression — the cast silently disables the index.
- NEVER use `ST_DWithin` on two `geometry` operands with a metre value: PostGIS reads it as
  degrees. `ST_DWithin(Warsaw, Kraków, 500)` is `true`.
- NEVER rebuild a point inline from `lat`/`lng` columns when an indexed geometry column exists
  — measured: cost 2050 without `Index Cond` versus 27 with it.
- NEVER `ST_Buffer` a `geometry` in EPSG:4326 to express a radius in metres — that buffers by
  degrees, and the error varies with latitude.
- NEVER accept `EXPLAIN (ANALYZE, BUFFERS)` as the only proof on a small table — at 3–300 rows
  the correct and the broken variant have measured identical.
- NEVER justify adding or removing a cast with "row counts unchanged" — `geography` computes
  edges geodetically, `geometry` planar; boundary rows can flip.
- NEVER evaluate a viewport/radius filter against a raw, unfuzzed point column when the point
  is meant to be private — a caller can binary-search the true coordinates (intersection oracle).
- NEVER let a DB trigger read another bounded context's table — import-graph linters do not
  read DDL, so the coupling is invisible to the tool the project relies on.
- NEVER leave a second discovery model (viewer-supplied radius alongside creator-published area)
  undocumented — record the exception in the ADR, not in a code comment.
- NEVER `DROP` a duplicate spatial index on static analysis alone; confirm with
  `pg_stat_user_indexes` from real traffic first. It is a one-way door.
- NEVER "fix" an index/query cast mismatch by stripping a semantically-required cast from the
  query — that silently turns metres into degrees. Rebuild the **index** on the cast
  expression instead (`DROP` + `CREATE` under the same name; Postgres has no
  `ALTER INDEX ... SET expression`).
- NEVER apply `ST_SnapToGrid` per-query as the privacy mechanism — the exact column stays
  live and one forgotten call site reopens the oracle. Snapping happens at write time.

## Why
PostGIS accepts predicates no index can serve and reports no warning: the rows come back
correct and the scan is sequential forever. The unit trap is worse — a metre value on
`geometry` operands is read as degrees, which turns a neighbourhood filter into a national
one. That exact failure shipped and stayed invisible for a week, because the error direction
was **over**-exposure: every user saw more than they should and nobody had a reason to
complain. Tests phrased as "can the user see their own content" pass throughout. Hence the
paired assertion, the guardian on predicate shape, and the insistence that the documentation
which taught the mistake gets corrected in the same change.
