# Pattern: Geo-Spatial Query (PostGIS)

**Tags**: "api:geo:radius", "api:data-access"

**Layer**: Infrastructure
**Status**: production

> Derived from two production audits (`TS-GEO-SPATIAL-QUERY-AUDIT-001`, 2026-07-29, and
> `-002`, 2026-08) plus the `TS-GEO-QUERY-KERNEL-001/002/002a/002b` refactor series
> (2026-08-13 → 2026-08-15) of the juz-ide codebase, and the incident that triggered them.
> Every anti-pattern below was found in production code, not imagined. The headline one cost
> a week of content over-exposure before anyone noticed.
>
> **Promoted to universal 2026-08-16** (owner decision): the rules are stack-agnostic PostGIS
> discipline. juz-ide remains the reference implementation — the "Reference implementation"
> callouts cite its files as evidence, not as a dependency; every rule stands without them.

---

## What This Is

A discipline for writing spatial predicates that actually use their index, actually
mean what they say, and cannot silently become a privacy leak.

Three claims hold this pattern together:

1. **A spatial predicate is an access-control mechanism, not a performance detail.**
   `ST_DWithin(a, b, 5000)` decides who sees whose content. Get the units wrong and you
   have not written a slow query — you have published private content nationwide.
2. **The shape of the predicate must match the shape of the index.** PostGIS will happily
   accept a predicate that no index can serve. Nothing warns you. The query returns correct
   rows and scans the whole table forever.
3. **The type of a column is knowable only from the migration and the live schema.**
   Not from the ADR, not from the architecture doc, not from the JSDoc above the query.
   All three have been observed lying about it in the same codebase.

---

## When to Use

**Use this pattern for:**

- ✅ Any query with `ST_*`, `<->`, or `&&` that touches a table (discovery feeds, map
  markers, radius search, boundary lookups, "near me")
- ✅ Designing or reviewing a `geometry`/`geography` column and its GiST index
- ✅ Reviewing a migration that adds a spatial column, index, or CHECK constraint
- ✅ Deciding whether a spatial query is a correctness bug, a performance debt, or fine
- ✅ Building a shared helper/builder that constructs spatial predicates for several repositories

**Do NOT use for:**

- ❌ Non-spatial pagination, joins, and btree indexing — that is ordinary query tuning, and
  a spatial reviewer will give you worse advice than a general one
- ❌ Deciding the *business* radius, reach level, or visibility tier — that is a product
  parameter. This pattern tells you how to express a rule correctly, never what the rule is
- ❌ Choosing a discovery model (creator-centric vs viewer-centric) — that is an
  architectural decision deserving its own ADR. This pattern only insists you make it
  **once** and enforce it consistently
- ❌ Geocoding, routing, or tiling pipelines — different concerns, different failure modes

---

## Implementation

### Rule 1 — Four predicate classes, four shapes

Every spatial predicate belongs to exactly one class. The class determines the cast, the
index, and the recipe. Conflating them is the root cause of most bugs in this pattern.

| Class | Looks like | Unit | Index it needs | Cast rule |
|---|---|---|---|---|
| **Metric** | `ST_DWithin`, `ST_Distance` with metres | metres | functional GiST on `((col)::geography)` — or a native `geography` column | cast **both operands**, on the **column** only if a functional index exists for exactly that expression |
| **Topological** | `ST_Intersects` | none | native GiST on the `geometry` column | **no cast** — the predicate needs no metric, and casting destroys index usability |
| **Containment** | `ST_Contains`, `ST_Within`, `ST_Covers` | none | native GiST on the `geometry` column | **no cast** — and none is possible: `ST_Contains`/`ST_Within` have **no `geography` overload**, so pin the operand kind to `geometry` in the type |
| **KNN** | `ORDER BY col <-> point LIMIT n` | ordering | functional GiST on exactly the ordered expression | cast consistently on both sides; the index only helps **with `LIMIT`** |

Containment earns its own class for a **correctness** reason, not a performance one:
`ST_Contains(area, point)` returns `false` for a point exactly **on** the boundary, while
`ST_Intersects(area, point)` returns `true` there. A lookup meant to resolve "which single
area is this point in" written with `ST_Intersects` + `LIMIT 1` can return either of two
adjacent areas nondeterministically; the same lookup with `ST_Contains` deliberately excludes
the shared boundary. Choose the class by the boundary behaviour the product intends, and
record the choice (juz-ide: ADR-0113, which added `containment` as a distinct class after
shipping with the wrong one).

```sql
-- METRIC: column is geometry, functional GiST exists on ((location)::geography)
ST_DWithin(e.location::geography, ST_MakePoint($lng, $lat)::geography, $radiusMeters)

-- TOPOLOGICAL: target_area is geometry(Geometry,4326), only a native gist(target_area) exists
ST_Intersects(c.target_area, ST_SetSRID(ST_MakePoint($lng, $lat), 4326))

-- KNN: needs LIMIT to be worth anything
ORDER BY e.location::geography <-> ST_MakePoint($lng, $lat)::geography
LIMIT $maxResults
```

The trap this table exists to prevent: a task once described both "add `::geography`" and
"remove `::geography`" as fixes and looked self-contradictory. It was not. Those were a
metric and a topological predicate, and both recipes were right for their own class.

### Rule 2 — Metric predicate on a `geometry` column: buffer the point, never cast the column

You cannot measure metres on `geometry` without involving `geography` somewhere. The naive
fix casts the column, which kills the index. Cast the **constant** instead:

```sql
-- ❌ kills the GiST on target_area
ST_DWithin(c.target_area::geography, ST_MakePoint($lng,$lat)::geography, $r)

-- ✅ index on the column stays usable; the buffer is computed geodetically
ST_Intersects(
  c.target_area,
  ST_Buffer(ST_MakePoint($lng, $lat)::geography, $radiusMeters)::geometry
)
```

The column side of the predicate must stay in whatever type its index speaks. Everything
else is a constant and can be cast freely.

**When the index and the query disagree, the index may be the wrong one.** If the query's
cast is semantically required (the predicate genuinely needs metres) and the functional GiST
was built on the bare expression, the fix is to rebuild the **index** on the cast expression —
`DROP INDEX` + `CREATE INDEX` under the same name, since Postgres has no
`ALTER INDEX ... SET expression` — not to strip the cast from the query, which silently turns
metres into degrees (AP3). Reference implementation: juz-ide migration
`266_fix_neighborhoods_centroid_gist_geography_cast` — the query casting `::geography` was
correct; the index built without the cast was the bug.

### Rule 3 — One canonical builder, with the column type in the contract

If more than one repository builds spatial predicates, they will drift. In the codebase this
pattern comes from, the same predicate was being constructed **five different ways** — a
shared helper, three flavours of inline SQL, and a separate service — each with its own answer
to "should this be cast". That divergence produced two separate production findings.

Centralise it, and make the ambiguity impossible to express:

```typescript
// ❌ one parameter, two possible column types, one unconditional cast
interface GeoColumnConfig {
  areaCol?: string;   // sometimes geography (cast is a no-op), sometimes geometry (cast kills the index)
}
sql`ST_Intersects(${sql.ref(cols.areaCol)}::geography, ...)`   // wrong half the time

// ✅ discriminated union — the compiler forces the caller to say which shape it is
type AreaColumn =
  | { areaCol: string; areaColKind: 'geography' }  // cast is a no-op, native geography GiST
  | { areaCol: string; areaColKind: 'geometry' }   // NO cast — native geometry_ops GiST
  | { areaCol?: undefined; areaColKind?: undefined };
```

A comment saying "remember not to cast here" is not a contract. A type that refuses to
compile is. If your canonical builder cannot express a legitimate call site, the builder is
wrong — do not let the call site fork off its own inline SQL, because that fork is how you
get back to five implementations.

**Reference implementation (juz-ide)** (`src/shared/geo/`, `ADR-0112`/`ADR-0113`, closed by
the `TS-GEO-QUERY-KERNEL-001/002/002a/002b` series, 2026-08-13 → 2026-08-15): the discriminated
union above is not a sketch, it is `SpatialSource` (`spatial-column.types.ts`) — four
variants (`column`+topological/metric, `column`+containment pinned to `geometry`,
`derived-point`+metric, `derived-point`+containment pinned to `geometry`), each carrying
`kind`/`class`/`indexable` so a caller cannot construct a combination PostGIS itself cannot
execute (e.g. `ST_Contains` has no `geography` overload — `kind: 'geometry'` is pinned at
the type level for containment, a compile error not a runtime SQL failure). Three functions
consume it:

```typescript
buildSpatialPredicate(left: SpatialSource, right: SpatialSource, opts?): Expression<SqlBool>
buildDistanceExpression(a: SpatialSource, b: SpatialSource): RawBuilder<number>   // SELECT-list value, casts both operands
buildKnnOrderExpression(column: IndexedSpatialColumn, target: VerifiedResidencePoint): RawBuilder<unknown>  // ORDER BY <->
```

`VerifiedResidencePoint` (`toVerifiedResidencePoint`) is a branded type for the second rule
this pattern doesn't cover on its own but the codebase learned the hard way: **who supplies
the comparison point is as much an access-control question as the predicate shape.** A
metric predicate built correctly (this pattern) against an operand the caller fully controls
(any `lat`/`lng` from a request body) is an intersection/trilateration oracle regardless of
cast correctness — three `ST_Distance` probes at different caller-chosen origins recover a
target's exact coordinates. `VerifiedResidencePoint` can only be constructed from a
server-resolved value, so a raw `{ lat, lng }` from user input cannot type-check into
`buildDistanceExpression`/`buildKnnOrderExpression` without going through a resolution step
the compiler can see. Two production incidents shipped from skipping this (`TM-TS-GEO-SPATIAL-QUERY-AUDIT-002` `-17`/`-18`, `TM-TS-GEO-QUERY-KERNEL-002` `-19`) — see AP9, which
this type directly closes for every caller of these three functions.

The same branded-type trick covers the opposite proof obligation. Rule 2's escape hatch —
the one call shape that legitimately **does** cast a column (`ST_DWithin` on
`col::geography`, legal only when a functional GiST exists on exactly that expression) —
should demand evidence, not trust. juz-ide's `buildCastGeometryMetricPredicate` accepts only
a `VerifiedGeographyIndexedColumn`, constructible solely via
`toVerifiedGeographyIndexedColumn`: "I checked `pg_indexes` and the functional index exists"
becomes a value of a branded type at the call site, not a comment that goes stale when the
index is dropped.

**Adoption in the reference implementation (verified 2026-08-15 by grep-diff, corrected
2026-08-15 by @geo-postgres-specialist after checking the guardian allowlist itself, not just
grepping for kernel calls):**
`grep -rl 'buildSpatialPredicate\|buildDistanceExpression\|buildKnnOrderExpression' src/contexts/` —
20 files across `neighborhood-economy`, `geographic-auth`, `community-communication`,
`discovery`, `user-profile`. `discussions`, `mentions`, `engagement` have zero spatial SQL
(not applicable — they don't query by location). `pricing`/`reputation` only reference geo
concepts through their ACL adapter or in comments, never build SQL directly — correct
pattern, not a gap. **Two files build raw, unmigrated spatial SQL**, found by this same
grep-diff: `geographic-auth/infrastructure/repositories/address-point-kysely.repository.ts:184`
(`ORDER BY ST_Distance(...) ASC`, address-lookup KNN tie-break) and
`geographic-auth/infrastructure/services/postgis/isochrone-postgis.adapter.ts:214`
(`ORDER BY the_geom <-> ...`, pgRouting nearest-vertex). **Both are already registered in the
guardian's allowlist** (Rule 7,
`src/shared/geo/__tests__/spatial-predicate-canonical-builder.guardian.spec.ts:538-547` and
`:699-721`) — the earlier claim that neither was registered came from grep-diffing kernel
adopters against raw-SQL hits without ever reading the allowlist contents, and was wrong.
The isochrone file's entry already carries the "routing-graph node lookup, not a content-row
predicate" reasoning this pattern's "Do NOT use for" section calls for — confirmed correct by
`@geo-postgres-specialist`, no further decision pending. The address-point file's entry only
covers its `ST_X`/`ST_Y` SELECT-projection hits, not the `ST_Distance` `ORDER BY` tie-break at
line 184 — that hit's allowlist reason still needs extending, and the tie-break itself is a
cheap, safe candidate for `buildDistanceExpression` (target column is
`GEOGRAPHY(Point, 4326)`, migration 114; `gpsCoords` is unverified caller input, but
`VerifiedResidencePoint`/AP9 does not apply here since the same query already returns the
compared point's exact coordinates in plaintext via `ST_X`/`ST_Y` — there is no secret left to
oracle). See `TS-GEO-GUARDIAN-ALLOWLIST-001`.

### Rule 4 — Verify against the catalogue first, the planner second

Small tables lie. At 3–300 rows the planner picks a sequential scan whether or not the index
is usable, so `EXPLAIN ANALYZE` proves nothing about correctness. Worse, a *different*
small index on the same table can be picked as a cheap carrier for an unrelated filter,
making two variants look identical.

Verify in this order — the first step is the cheapest and the most conclusive:

```sql
-- 0. CATALOGUE (decisive). Does an index matching this predicate exist at all?
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'community_events';
--    No functional index on ((target_area)::geography) anywhere? Then a cast predicate
--    CANNOT use an index, no matter what the planner reports.

-- 1. PLAN, no ANALYZE, WITH the partial index's own predicate (see Rule 5)
EXPLAIN SELECT ... WHERE status IN ('posted','draft') AND ST_Intersects(target_area, $1);
--    Look for `Index Cond`, not just `Index Scan`. A predicate demoted to `Filter` is not
--    using the index, even under an `Index Scan` node.

-- 2. STRUCTURAL PROBE
SET LOCAL enable_seqscan = off;
EXPLAIN SELECT ...;
--    Still a Seq Scan with seqscan disabled → no usable index exists. This is a
--    volume-independent proof, which is exactly what you need on a small table.

-- 3. ANALYZE, BUFFERS — optional, and only ever a supplement to steps 0–2.
```

### Rule 5 — A partial index needs its predicate in your test query

```sql
CREATE INDEX idx_job_requests_target_area ON job_requests USING gist (target_area)
  WHERE status IN ('posted','in_progress');
```

An `EXPLAIN` that omits `status` measures a sequential scan for an entirely different
reason and reports a false negative. Every assertion about this index must carry its
`WHERE` clause. This has produced wrong audit conclusions twice.

Watch the literal, too: an index built `WHERE moderation_status = 'APPROVED'` does nothing
for a repository filtering `'approved'`.

### Rule 6 — The migration is the only source of truth for a column's type

Documentation drifts and takes implementers with it. In one real case a technical doc and an
ADR both declared `target_area` as `GEOGRAPHY(Polygon,4326)` when every table had it as
`geometry(Geometry,4326)`. An implementer followed the doc, wrote the cast, and produced a
finding. Correcting the query without correcting the doc guarantees the next implementer
repeats it — so **doc correction is part of the fix, not a follow-up**.

Read the type from `src/**/migrations/*` and confirm against the live schema (`\d+ <table>`).
Then check what else drifted: an ADR that still teaches `ST_Buffer` where the codebase moved
to `ST_MakeEnvelope` is actively producing the next bug.

### Rule 7 — Guardian test on predicate shape (CI blocker)

Same rationale as the `eventMap` guardian in `repository-events-pattern.md`: a mechanical
scan answers in milliseconds a question that manual review has repeatedly got wrong.

```typescript
// L1: snapshot the SQL every builder branch emits, assert the cast shape per column kind
it('never casts a geometry area column to geography', () => {
  const sql = buildGeoFilter({ areaCol: 'c.target_area', areaColKind: 'geometry' }, viewport);
  expect(sql).toContain('ST_Intersects(c.target_area');
  expect(sql).not.toMatch(/target_area\)?::geography/);
});
```

Pair it with an L2 that asserts `Index Cond` on a real database, and one L2 edge case with a
point **exactly on the boundary** of the area — see Anti-Pattern 8.

**Reference implementation (juz-ide)**:
`src/shared/geo/__tests__/spatial-predicate-canonical-builder.guardian.spec.ts`.
Every raw `ST_*`/`<->` hit in the codebase is either migrated, or carries an ALLOWLIST entry
with `status: 'pending-migration'` (must name an open task file — an entry with no task
behind it is an orphaned promise) or `status: 'structural-exclusion'` (must cite the specific
remaining hit and why migrating it is wrong, not just hard). A hit with neither status fails
CI. This is what makes an unregistered raw hit a *known, closable* gap instead of invisible
debt — the fix is registering it in this allowlist with a reasoned status, not assuming it's
invisible until someone stumbles on it (as `TS-GEO-GUARDIAN-ALLOWLIST-001`, 2026-08-15, found:
the two call sites it set out to register already had entries — the audit that spawned it
never actually read the allowlist contents before concluding they were missing).

### Rule 8 — Spatial predicates are access control: test both directions

A visibility bug has two directions and they are not equally visible. Under-exposure
generates complaints within hours. **Over-exposure generates nothing** — everyone sees more
than they should and nobody files a ticket. Tests written as "can the user see their own
content" only catch the direction that would have reported itself anyway.

Every spatial access path needs a paired assertion on one fixture: **sees** and **does not
see**. In the incident behind this pattern, 121 of 125 events with declared local scope were
visible nationwide for at least a week, and the test suite was green throughout.

### Rule 9 — Geo review is mandatory for ANY SQL touching a geo column, not just repository queries

Rules 1-8 exist because *reviewed* spatial predicates still go wrong in subtle ways. AP10
(below) shipped because the review gate itself only fired for **application-layer repository
queries** — the reviewing rule was scoped by *where the code lives* (a `.repository.ts` file),
not by *what the code touches* (a geography/geometry column, an `ST_*` call, a residence/
location table). A migration authoring a trigger or stored function is not a repository query,
so it never entered the gate, and a cross-context DDL coupling (AP10) plus a wrong routing
field (this pattern's discovery-model guidance) both shipped unreviewed in the same trigger.

**The gate, corrected**: `@geo-postgres-specialist` (or this project's equivalent spatial
reviewer) review is required BEFORE finalizing **any** of the following, not only
`*.repository.ts` methods:

- A Kysely repository method with `ST_*`, `<->`, or `&&`
- A migration that creates or modifies a **trigger, stored function, or generated column**
  referencing a geography/geometry column or computing one from lat/lng
- A migration that creates or modifies a **spatial index** (GiST, functional or partial)
- Any raw SQL string (`sql\`...\``) anywhere in the codebase containing a spatial operator

The reviewer checks the same things regardless of where the SQL lives: predicate class
(Rule 1), cast-vs-index shape (Rule 2), canonical builder usage where the call site is
application code (Rule 3) — **and, for DDL specifically, whether the SQL reads a table
outside its own bounded context** (AP10) and whether the routing field it reads (creator
anchor vs viewer routing — see the ADR governing this project's discovery model) is the one
the product actually intends, not the one that happened to be at hand when the trigger was
written.

**Enforcement, not just guidance**: the implementer role that owns migrations/repositories
in this project (`@infrastructure-implementer` or equivalent) MUST treat this consult as a
blocking step with the same weight as the existing "consult before finalizing a repository
query" rule — see that agent's own file for the exact wording. A migration merged without
this consult is not a smaller violation than a repository query merged without it; AP10 is
the proof the DDL path is not the safer one.

### Rule 10 — Private points: snap at write time, bucket at read time

AP9 (the intersection/trilateration oracle) has two mitigations, and **where** each one runs
is the rule:

**Snap at write, never at read.** When a stored point must not be exactly recoverable
(a home location, a residence), fuzz it **before it is persisted** — snap to a coarse grid in
the write handler, and backfill existing rows in a migration so no exact value survives at
rest. The tempting alternative — `ST_SnapToGrid` applied per-query at read time — is wrong
three ways: the exact column stays live in the database (one forgotten call site reopens the
oracle), every reader must remember to apply it (the N-call-sites problem Rule 3 exists to
kill), and the per-row function call degrades the GiST index. Reference implementation
(juz-ide): `snapToGrid` with a 0.01° grid (~1.1 km) applied in the write handler, plus
backfill migration `267`; the read-time variant was considered and explicitly rejected.

**Bucket distances for untrusted consumers.** An API that returns metric distance to a caller
who controls the origin is a trilateration oracle even when every predicate is cast correctly
— three probes recover exact coordinates. Return coarse ordinal buckets
(`same_cell` / `adjacent_cell` / `beyond`) instead of metres; keep the metric value
server-side for ordering only. Reference implementation (juz-ide): `distance-bucket.ts` —
`buildDistanceExpression` still computes metres, but the value crossing the trust boundary is
the bucket.

The two halves compose: snap-at-write bounds what any query can leak; bucketing bounds what
the API narrates about it. Neither replaces `VerifiedResidencePoint` (Rule 3) — that closes
*who may supply the origin*, these close *what precision leaves the system*.

### Rule 11 — Cross-context residence data: live ACL when persisted or decisional, per-context projection when merely displayed or filtered

A per-context read projection of another bounded context's data (e.g. `economy_users`,
`community_communication_users`, `engagement_users` — each synced from `geographic-auth` via
`ResidenceRegistered`/`ActiveResidenceSwitched`/`ResidenceDeleted` integration events) is a
legitimate, standard consumer-owned read model — **not** an ACL substitute. The two mechanisms
answer different questions and the axis that decides between them is not "read vs write":

> Live ACL (`geoAuthACL.getResidenceCoordinates(...)`) when the value will be **persisted as a
> content anchor**, or used in an **authorization/guardrail decision** — both cases where
> staleness produces a permanent or access-control error. Per-context projection in every other
> case: display, cross-user discovery filtering, bulk/scheduled work — cases where staleness is
> bounded by the next sync and the error direction is tolerable.

| Case | Source | Why |
|---|---|---|
| CREATE — anchoring new geo content | live ACL | persisted once, permanently; a stale read cannot self-correct |
| Explicit re-anchor command (e.g. "change my listing's location") | live ACL | this is a new anchor write, not an edit |
| EDIT of unrelated fields | **neither** | the anchor is a snapshot from CREATE and does not move (see AP10's sibling rule in `docs/tech/geo.md`) |
| Authz/guardrail check (e.g. `BR-GEO-CENTER-001`) | live ACL | a stale allow is a live access-control gap |
| Discovery / list / "who's near" filtering over *other* users' content | per-context projection | eventual consistency is the correct, already-adopted trade-off (see Rule 12 for the shape it must have) |
| Displaying the caller's own last-known data | either; ACL if read-your-own-writes matters | low stakes, cheap either way |
| Bulk export, metrics, scheduled jobs | per-context projection | ACL here is an N+1 the freshness requirement does not justify |

**Verified adoption (2026-08-16):** all three content-creation handlers in `neighborhood-economy`
(`create-job-request`, `create-local-share`, `create-service-offering`) already call the live
ACL for anchoring; none reads the projection for this purpose. Discovery reads in the same
context (`local-share-query-kysely.repository.ts`, `job-offer-query-kysely.repository.ts`,
`job-request-query-kysely.repository.ts`, `service-offering-query.kysely.repository.ts`) already
read the projection. The rule was already the de facto convention before being written down —
this codifies it and gives it a name so it can be reviewed for, not just imitated. Formal record:
`ADR-0114`. Ubiquitous language name for the projection mechanism itself: **Per-Context Read
Projection** — a fourth entry alongside ACL Registry / Integration Events / Dedicated Queue in
`architecture/cross-context-communication.md`.

### Rule 12 — A projection column used in a spatial predicate must be native and indexed, never JSONB

Rule 11 says a projection is an acceptable *source*. It says nothing about *shape* — and the
two failures are independent. A projection that is architecturally the right choice can still be
the wrong column if it's JSONB.

`jsonb_array_elements(residences)` has no functional GiST to build on: the expression unwinds a
per-row array before any spatial operator runs, so `ST_DWithin`/`ST_Intersects` against an
extracted element is unindexable by construction (Rule 1/Rule 4 apply — verify with
`pg_indexes`, don't assume). At small volume this is invisible; it becomes a full sequential
scan as the table grows, with no error and no warning.

**Fix**: promote the one field the spatial predicate actually needs (the *active* residence
point, per Rule 11's discovery-filtering row) out of the JSONB array into its own native
`geography(Point,4326)` column with a matching GiST index, maintained by the same
`ResidenceRegistered`/`ActiveResidenceSwitched`/`ResidenceDeleted` handlers that already
maintain the JSONB array. This is not a new mechanism — `activity_feed_users.current_location`
already does exactly this in the same codebase (native `geography(Point,4326)`, GiST index
`idx_activity_feed_users_location`, DB column comment "Used for ST_DWithin feed queries") and is
the reference shape to copy, not a hypothetical.

The JSONB array is not thereby wrong to keep — it still serves non-spatial reads (display,
`isPrimary`/`isActive` bookkeeping). The point is narrower: **the column a spatial predicate
touches must independently satisfy Rule 1's index-shape requirement**; being "the projection" is
not a waiver.

**Live instance**: `economy_users.residences` (JSONB, no GiST) is read this way today by four
`neighborhood-economy` query repositories (see Rule 11). `migration
259_backfill_terc_economy_users_residences.ts` is direct evidence the copy has already drifted
from `user_residences` in production (orphaned `residenceId` entries required a repair sweep) —
the shape problem and the staleness problem compound, not just coexist. Tracked as part of
`TS-GEO-TRIGGER-CROSS-CONTEXT-001`.

---

## Anti-Patterns

### ❌ AP1 — `::geography` on a `geometry` column with no matching functional index

```sql
ST_Intersects(target_area::geography, $point::geography)   -- ❌
```

The only index is `gist(target_area)` in `geometry_ops`. The cast produces an expression no
index covers, so the predicate is demoted to a filter over every row. Correct results,
permanent sequential scan. **Fix**: drop the cast (topological predicates need no metric).

### ❌ AP2 — Rebuilding the point inline instead of referencing the indexed column

```sql
ST_DWithin(ST_SetSRID(ST_MakePoint(e.longitude, e.latitude),4326)::geography, $p, $r)  -- ❌
ST_DWithin(e.location::geography, $p, $r)                                              -- ✅
```

Measured on the same table: no `Index Cond`, cost 2050.77 versus `Index Cond`, cost 27.47.
The recipe "just add `::geography` to both sides" fixes the units and leaves the sequential
scan — it looks like a fix and passes review.

### ❌ AP3 — `ST_DWithin` on `geometry` without casts: metres silently become degrees

```sql
ST_DWithin(a.location, b.location, 5000)   -- ❌ 5000 DEGREES
```

`ST_DWithin(Warsaw, Kraków, 500)` returns true. This is the incident: content marked local,
visible across the country. **Fix**: cast both operands to `geography`, or use a topological
predicate against a proper area column.

### ❌ AP4 — One ambiguous parameter for columns of different types

A shared `areaCol` accepting both a `geography` column (cast harmless) and a `geometry`
column (cast fatal), with an unconditional cast in the builder. Half the callers are wrong
and nothing indicates which half. **Fix**: Rule 3.

### ❌ AP5 — Treating `EXPLAIN (ANALYZE, BUFFERS)` as the standard of proof

On a 125-row table both the correct and the broken variant came back at cost 2040.4 versus
2040.2, both using an index on a *different* column as a carrier for the status filter, both
running the spatial predicate as a plain `Filter`. Two hours of measurement, zero
information. **Fix**: Rule 4, catalogue first.

### ❌ AP6 — Documentation as the source of truth for column types

Covered in Rule 6. The specific failure: an agent instruction file told reviewers to read the
architecture doc "first, as the actual up-to-date source". That doc was wrong about the very
column under review. Correct the instruction alongside the code.

### ❌ AP7 — `ST_Buffer` on `geometry` to express a radius in metres

Buffering a `geometry` in EPSG:4326 buffers by **degrees**, producing an ellipse that is
wrong by a factor that varies with latitude. Either buffer in `geography` and cast the result
back (Rule 2), or build an envelope from metre-to-degree constants at the storage layer.

### ❌ AP8 — Assuming a cast change cannot alter results

`ST_Intersects` computes edges geodetically on `geography` and planar on `geometry`. A point
on the boundary of an area can flip visibility with no data change. Never justify adding or
removing a cast with "row counts are unchanged" on a small table. Add a boundary-point test.

### ❌ AP9 — Leaking exact location through the predicate (intersection oracle)

A viewport or radius filter evaluated against a **raw** point column lets a caller binary-search
the true coordinates by varying the viewport, even when the API never returns the point.
Filter against the published area geometry, or fuzz the point before it becomes queryable —
at **write** time, with a bucketed (never metric) distance in any untrusted-facing response
(Rule 10). Content types that fuzz on one path and not another are the common form of this bug.

### ❌ AP10 — A trigger in one bounded context reading another context's table

```sql
-- trigger on service_offerings (context A) computing a derived area:
SELECT latitude, longitude INTO ... FROM user_residences   -- context B  ❌
```

Import-graph linters do not read DDL, so this coupling is invisible to the tool the project
relies on for context isolation. A migration in context B then breaks context A with no
compile error. **Fix**: resolve the value through the ACL adapter in the command handler
before the write; keep triggers to the context's own tables.

**Live instance, not hypothetical**: `compute_service_area()` (`neighborhood-economy`,
migration `063`) reads `user_residences` (`geographic-auth`) directly in a DB trigger.
Confirmed by cataloguing `pg_trigger`+`pg_proc` against the live schema — the only
cross-context read among three residence-touching functions found (two others exist in
application code, not DDL — `organization/auto-binding.handler.ts:281` and
`mentions/mention-candidate-projection-kysely.repository.ts:72` — tracked separately, not part
of this trigger's fix). Tracked as `TS-GEO-TRIGGER-CROSS-CONTEXT-001` — analysis `approved`
(`project-orchestration/analysis/TS-GEO-TRIGGER-CROSS-CONTEXT-001.analysis.md`), fix is a
type-enforced "Anchor Snapshot" (one residence read per command, feeding geometry + guardrail +
denormalized columns together) — this is exactly the review gate Rule 9 exists to have caught
before the trigger ever shipped.

### ❌ AP13 — A per-context projection drifts from its source and is queried unindexed

`economy_users.residences` (JSONB array, synced from `user_residences` via integration events)
is read for spatial discovery filtering by four query repositories in `neighborhood-economy`
without ever building an index the query could use (Rule 12) — and has already produced a
production data-quality incident: `migration 259_backfill_terc_economy_users_residences.ts`
exists specifically to repair `residenceId` entries in this JSONB array that no longer matched
a row in `user_residences`. Two independent failure modes from one root cause (a materialized
copy with no schema-enforced consistency and no index): silent staleness, and a guaranteed
sequential scan at scale. Neither is visible in `EXPLAIN` on a small table (Rule 4) or in a
green test suite (Rule 8) — this is the projection-mechanism analogue of AP9's "over-exposure
generates nothing" problem. **Fix**: Rule 11 for whether the projection is the right source at
all, Rule 12 for the column shape when it is. Tracked as part of
`TS-GEO-TRIGGER-CROSS-CONTEXT-001`.

### ❌ AP11 — Two discovery models coexisting without a decision

One feed filters by a **viewer-supplied radius** while every other surface filters by the
**creator's published area**. Both are defensible; having both by accident is not. Pick one
as canonical, record it in an ADR, and record every exception *in that same ADR* — an
exception that lives only in a code comment is indistinguishable from a bug.

### ❌ AP12 — Duplicate and orphaned spatial indexes

Tables accumulate `gist(location)` alongside `gist((location)::geography)`, sometimes with a
third unpartialled copy. After a refactor one of each pair typically has no reader left.
Dead spatial indexes are pure write cost. But **which** one is dead depends on live query
patterns, so: enumerate readers statically first (cheap, often decisive), confirm with
`pg_stat_user_indexes` from real traffic, and only then drop — `DROP INDEX` is a one-way door.

---

## Related Patterns

- `infrastructure/repository-pattern.md` — where spatial SQL is allowed to live (query repos,
  `sql<Type>` template literals, explicit columns)
- `infrastructure/repository-events-pattern.md` — the guardian-test convention Rule 7 mirrors
- `architecture/acl-registry-pattern.md` — the correct channel for the cross-context read in AP10
- `architecture/cross-context-communication.md` — Per-Context Read Projection as a named
  mechanism (Rule 11), alongside ACL Registry / Integration Events / Dedicated Queue
- `cross-layer/security-invariants-pattern.md` — spatial predicates as an access-control surface
- `testing/testing-pyramid-pattern.md` — L1 shape guardian vs L2 index assertion split
- `ADR-0114` — formal record of the ACL-vs-projection decision rule (Rule 11)

---

## Checklist

- [ ] Predicate classified: metric / topological / containment / KNN (Rule 1)
- [ ] Class chosen by intended boundary behaviour — containment (`ST_Contains`) excludes the
      boundary, topological (`ST_Intersects`) includes it; "which area is this point in"
      lookups decided deliberately, not by habit (Rule 1)
- [ ] Column type read from the migration and confirmed against the live schema (Rule 6)
- [ ] Index matching the predicate expression confirmed in `pg_indexes` (Rule 4, step 0)
- [ ] No cast applied to an indexed column unless a functional index covers that exact expression
- [ ] Partial index predicate included in every `EXPLAIN` assertion (Rule 5)
- [ ] `Index Cond` present, not a demoted `Filter`
- [ ] Predicate built through the canonical builder; column kind expressed in the type (Rule 3)
- [ ] L1 guardian on predicate shape; L2 with a boundary point (Rules 7–8)
- [ ] Both visibility directions asserted — sees **and** does not see (Rule 8)
- [ ] Documentation and ADRs corrected in the same change as the query (Rule 6)
- [ ] Comparison point is a server-resolved `VerifiedResidencePoint`, never a raw caller
      `lat`/`lng`, even in a correctly-cast predicate (Rule 3, AP9)
- [ ] New raw `ST_*`/`<->` call site registered in the guardian allowlist — migrated,
      `pending-migration` with a task, or `structural-exclusion` with a cited reason (Rule 7)
- [ ] Geo reviewer consulted BEFORE finalizing — for a migration/trigger/function/generated
      column touching a geo column, not only for a repository query (Rule 9)
- [ ] If this is a trigger or stored function: confirmed it reads only tables in its own
      bounded context (Rule 9, AP10) — cross-context reads go through the ACL adapter in a
      command handler, never in DDL
- [ ] Private point columns snapped at write time (with a backfill for existing rows), never
      per-query at read; distance exposed to an untrusted consumer is a bucket, not metres
      (Rule 10, AP9)
- [ ] Cross-context residence/location value classified: persisted anchor or authz decision →
      live ACL; display/discovery-filter/bulk → per-context projection allowed (Rule 11)
- [ ] If a per-context projection feeds a spatial predicate: the column is native
      `geography`/`geometry` with a matching GiST index, never a JSONB field requiring
      `jsonb_array_elements` — verified in `pg_indexes`, not assumed (Rule 12, AP13)
