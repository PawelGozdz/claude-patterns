# Rule Card: Geo-Spatial Query (PostGIS)

**Tags**: "api:geo:radius", "api:data-access"

**Pattern**: `patterns/infrastructure/geo-spatial-query-pattern.md`
**Layer**: Infrastructure
**Scope**: project-specific (juz-ide)

Spatial predicates are access control, not tuning. Wrong units publish private content;
wrong casts silently disable the index.

| ID | Rule | Failure if broken |
|----|------|-------------------|
| **GEO1** | Classify every predicate: **metric** (`ST_DWithin`/`ST_Distance`, metres), **topological** (`ST_Intersects`/`ST_Contains`), **KNN** (`<->`). Each has its own cast and index shape. | Applying the metric recipe to a topological predicate adds a cast that disables the index |
| **GEO2** | Cast shape must match index shape. Cast a column **only** when a functional GiST exists on exactly that expression. | `Index Cond` degrades to `Filter`; permanent seq scan, correct results, no warning |
| **GEO3** | Metric predicate on a `geometry` column: buffer the **point** in `geography` and cast the buffer back — never cast the column. | Either wrong units (degrees) or a dead index; both have shipped |
| **GEO4** | `ST_DWithin` on two `geometry` operands measures **degrees**, not metres. | `ST_DWithin(Warsaw, Kraków, 500) = true` — nationwide over-exposure of local content |
| **GEO5** | Column type comes from the migration + live schema. Never from an ADR, doc, or JSDoc. | Docs have been observed declaring `GEOGRAPHY` for a `geometry` column and producing the bug |
| **GEO6** | Verify in order: `pg_indexes` catalogue → `EXPLAIN` (no ANALYZE) → `SET enable_seqscan=off` → ANALYZE optional. | On 3–300 row tables `EXPLAIN ANALYZE` cannot distinguish correct from broken |
| **GEO7** | Every `EXPLAIN` assertion includes the partial index's own `WHERE` predicate, matching its literal exactly. | False negative: a seq scan measured for an unrelated reason |
| **GEO8** | One canonical predicate builder; express the column kind in the **type** (discriminated union), not a comment. | Five parallel implementations, each with its own answer on casting — the observed steady state |
| **GEO9** | L1 guardian on emitted predicate shape (CI blocker) + L2 with a point exactly on the area boundary. | `geography` edges are geodetic, `geometry` planar — a cast change can flip visibility with no data change |
| **GEO10** | Assert **both** directions: sees and does not see. | Over-exposure produces no complaints; a green suite hid it for a week |
| **GEO11** | Triggers read only their own context's tables; cross-context reads go through the ACL adapter in the handler. | DDL coupling is invisible to import-graph linters |
| **GEO12** | Pick one discovery model (creator-centric vs viewer-centric) and record every exception in the ADR, not in a comment. | An undocumented exception is indistinguishable from a bug |
| **GEO13** | `DROP INDEX` on a spatial duplicate only after static reader enumeration **and** `pg_stat_user_indexes` from real traffic. | One-way door; the surviving index may be the unused one |

**Correcting the doc that taught the bug is part of the fix, not a follow-up** (GEO5).
