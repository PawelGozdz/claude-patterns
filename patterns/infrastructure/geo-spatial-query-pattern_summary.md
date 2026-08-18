# Rule Card: Geo-Spatial Query (PostGIS)

**Tags**: "api:geo:radius", "api:data-access"

**Pattern**: `patterns/infrastructure/geo-spatial-query-pattern.md`
**Layer**: Infrastructure
**Level**: core

## Why this card exists

Spatial predicates are access control, not tuning. Wrong units publish private content;
wrong casts silently disable the index.

## Rules

| ID | Rule | Failure if broken |
|----|------|-------------------|
| **GEO1** | Classify every predicate: **metric** (`ST_DWithin`/`ST_Distance`, metres), **topological** (`ST_Intersects`), **containment** (`ST_Contains`/`ST_Within`), **KNN** (`<->`). Each has its own cast and index shape. | Applying the metric recipe to a topological predicate adds a cast that disables the index |
| **GEO2** | Cast shape must match index shape. Cast a column **only** when a functional GiST exists on exactly that expression. | `Index Cond` degrades to `Filter`; permanent seq scan, correct results, no warning |
| **GEO3** | Metric predicate on a `geometry` column: buffer the **point** in `geography` and cast the buffer back — never cast the column. | Either wrong units (degrees) or a dead index; both have shipped |
| **GEO4** | `ST_DWithin` on two `geometry` operands measures **degrees**, not metres. | `ST_DWithin(Warsaw, Kraków, 500) = true` — nationwide over-exposure of local content |
| **GEO5** | Column type comes from the migration + live schema. Never from an ADR, doc, or JSDoc. | Docs have been observed declaring `GEOGRAPHY` for a `geometry` column and producing the bug |
| **GEO6** | Verify in order: `pg_indexes` catalogue → `EXPLAIN` (no ANALYZE) → `SET enable_seqscan=off` → ANALYZE optional. | On 3–300 row tables `EXPLAIN ANALYZE` cannot distinguish correct from broken |
| **GEO7** | Every `EXPLAIN` assertion includes the partial index's own `WHERE` predicate, matching its literal exactly. | False negative: a seq scan measured for an unrelated reason |
| **GEO8** | One canonical predicate builder; express the column kind in the **type** (discriminated union), not a comment. Reference implementation (juz-ide): `src/shared/geo/` — `buildSpatialPredicate`/`buildDistanceExpression`/`buildKnnOrderExpression` over `SpatialSource`. Where a kernel exists, use it; don't hand-roll a call site. | Five parallel implementations, each with its own answer on casting — the observed steady state |
| **GEO9** | L1 guardian on emitted predicate shape (CI blocker) + L2 with a point exactly on the area boundary. | `geography` edges are geodetic, `geometry` planar — a cast change can flip visibility with no data change |
| **GEO10** | Assert **both** directions: sees and does not see. | Over-exposure produces no complaints; a green suite hid it for a week |
| **GEO11** | Triggers read only their own context's tables; cross-context reads go through the ACL adapter in the handler. | DDL coupling is invisible to import-graph linters |
| **GEO12** | Pick one discovery model (creator-centric vs viewer-centric) and record every exception in the ADR, not in a comment. | An undocumented exception is indistinguishable from a bug |
| **GEO13** | `DROP INDEX` on a spatial duplicate only after static reader enumeration **and** `pg_stat_user_indexes` from real traffic. | One-way door; the surviving index may be the unused one |
| **GEO14** | The comparison point in a metric predicate must be a server-resolved, branded value (`VerifiedResidencePoint`), never a raw caller-supplied `lat`/`lng`, even with correct casts. | Correct-cast predicate against a caller-controlled point is an intersection oracle — 3 probes at chosen origins recover exact coordinates (shipped twice, `-17`/`-18`/`-19`) |
| **GEO15** | Geo review (`@geo-postgres-specialist` or project equivalent) is mandatory BEFORE finalizing ANY SQL touching a geo column — including migrations authoring triggers/functions/generated columns, not only `*.repository.ts` queries. A trigger/function additionally MUST be checked for cross-context table reads (AP10). | Review gate scoped by file location instead of by content let a cross-context trigger (`compute_service_area()`, migration 063) ship unreviewed — the exact incident this rule exists to prevent from recurring |
| **GEO16** | Containment is its own class: `ST_Contains` excludes the boundary (`ST_Intersects` includes it) and has **no `geography` overload** — pin the operand kind to `geometry` in the type. Choose containment vs topological by the boundary behaviour the product intends. | "Which area is this point in" via `ST_Intersects` + `LIMIT 1` returns either of two adjacent areas nondeterministically for a boundary point |
| **GEO17** | Snap private points at **write** time (handler + backfill migration), never `ST_SnapToGrid` per-query at read; distance exposed to an untrusted consumer is a coarse bucket (`same_cell`/`adjacent_cell`/`beyond`), never metres. | Read-time snapping leaves the exact column live — one forgotten call site reopens the oracle; a metric distance API is a trilateration oracle (3 probes recover exact coordinates) |
| **GEO18** | Cross-context residence data: live ACL when the value is **persisted as a content anchor** or feeds an **authz/guardrail decision**; per-context read projection (e.g. `economy_users.residences`) when the read is display, cross-user discovery filtering, or bulk/scheduled work. EDIT of unrelated fields touches neither. See Pattern Rule 11, `ADR-0114`. | Persisting/authorizing off a stale projection is a permanent data error or a live access-control gap; ACL on every discovery-list read is an unjustified N+1 |
| **GEO19** | A per-context projection column feeding a spatial predicate MUST be native `geography`/`geometry` with a matching GiST index, never JSONB requiring `jsonb_array_elements`. Promote the needed field into its own indexed column, maintained by the same sync handlers — mirror `activity_feed_users.current_location`. See Pattern Rule 12. | `jsonb_array_elements(...)` has no functional GiST — guaranteed seq scan at scale, invisible on a small table (GEO6) and in a green suite (GEO10); `economy_users.residences` already drifted from source in production (migration 259 backfill) |

## Non-negotiable

**Correcting the doc that taught the bug is part of the fix, not a follow-up** (GEO5).
