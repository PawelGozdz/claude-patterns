# Pattern: Geo-Spatial Query (PostGIS)

**Layer**: Infrastructure
**Status**: production
**Scope**: project-specific (juz-ide) — single-project derivation, not yet validated
in a second codebase. Excluded from `retrieve_patterns` by default; pass
`project: "juz-ide"` to include it. Promote to universal once a second project adopts
this shape.

> Derived from two production audits of the same codebase (`TS-GEO-SPATIAL-QUERY-AUDIT-001`,
> 2026-07-29, and `-002`, 2026-08) plus the incident that triggered them. Every anti-pattern
> below was found in production code, not imagined. The headline one cost a week of
> content over-exposure before anyone noticed.

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

### Rule 1 — Three predicate classes, three shapes

Every spatial predicate belongs to exactly one class. The class determines the cast, the
index, and the recipe. Conflating them is the root cause of most bugs in this pattern.

| Class | Looks like | Unit | Index it needs | Cast rule |
|---|---|---|---|---|
| **Metric** | `ST_DWithin`, `ST_Distance` with metres | metres | functional GiST on `((col)::geography)` — or a native `geography` column | cast **both operands**, on the **column** only if a functional index exists for exactly that expression |
| **Topological** | `ST_Intersects`, `ST_Contains`, `ST_Within` | none | native GiST on the `geometry` column | **no cast** — the predicate needs no metric, and casting destroys index usability |
| **KNN** | `ORDER BY col <-> point LIMIT n` | ordering | functional GiST on exactly the ordered expression | cast consistently on both sides; the index only helps **with `LIMIT`** |

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

### Rule 8 — Spatial predicates are access control: test both directions

A visibility bug has two directions and they are not equally visible. Under-exposure
generates complaints within hours. **Over-exposure generates nothing** — everyone sees more
than they should and nobody files a ticket. Tests written as "can the user see their own
content" only catch the direction that would have reported itself anyway.

Every spatial access path needs a paired assertion on one fixture: **sees** and **does not
see**. In the incident behind this pattern, 121 of 125 events with declared local scope were
visible nationwide for at least a week, and the test suite was green throughout.

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
Filter against the published area geometry, or fuzz the point before it becomes queryable.
Content types that fuzz on one path and not another are the common form of this bug.

### ❌ AP10 — A trigger in one bounded context reading another context's table

```sql
-- trigger on service_offerings (context A) computing a derived area:
SELECT latitude, longitude INTO ... FROM user_residences   -- context B  ❌
```

Import-graph linters do not read DDL, so this coupling is invisible to the tool the project
relies on for context isolation. A migration in context B then breaks context A with no
compile error. **Fix**: resolve the value through the ACL adapter in the command handler
before the write; keep triggers to the context's own tables.

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
- `cross-layer/security-invariants-pattern.md` — spatial predicates as an access-control surface
- `testing/testing-pyramid-pattern.md` — L1 shape guardian vs L2 index assertion split

---

## Checklist

- [ ] Predicate classified: metric / topological / KNN (Rule 1)
- [ ] Column type read from the migration and confirmed against the live schema (Rule 6)
- [ ] Index matching the predicate expression confirmed in `pg_indexes` (Rule 4, step 0)
- [ ] No cast applied to an indexed column unless a functional index covers that exact expression
- [ ] Partial index predicate included in every `EXPLAIN` assertion (Rule 5)
- [ ] `Index Cond` present, not a demoted `Filter`
- [ ] Predicate built through the canonical builder; column kind expressed in the type (Rule 3)
- [ ] L1 guardian on predicate shape; L2 with a boundary point (Rules 7–8)
- [ ] Both visibility directions asserted — sees **and** does not see (Rule 8)
- [ ] Documentation and ADRs corrected in the same change as the query (Rule 6)
