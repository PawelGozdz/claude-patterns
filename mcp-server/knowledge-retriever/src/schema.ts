// Single source of truth for the collection registry — consumed by migrate.ts (idempotent
// creation + payload indexes). Per-project collections (code_<project>, best_practices_<project>)
// are parameterized by project name at call time, so they're documented here as name templates,
// not enumerated instances.
export type CollectionScope = "per-project" | "global";

export interface CollectionSpec {
  name: string; // fixed name for global collections; "<project>" placeholder for per-project templates
  scope: CollectionScope;
  dim?: number; // global collections only — fixed embed dim (1024, multilingual-e5-large)
  seeded: boolean; // false = registered here but no seeder writes to it from this repo
  description: string;
}

export const COLLECTION_REGISTRY: CollectionSpec[] = [
  {
    name: "code_<project>",
    scope: "per-project",
    seeded: true,
    description: "real, current project code — indexer.ts::buildCodeIndex / reindexFile",
  },
  {
    name: "best_practices_<project>",
    scope: "per-project",
    seeded: false,
    description:
      "curated subset of project code flagged code-quality-verifier-clean — NOT seeded from " +
      "claude-patterns (no source data lives here; it's per-project agent-memory). Registered so " +
      "migrate.ts can create the collection + indexes on request, ahead of a project wiring its own seeder.",
  },
  {
    name: "patterns_global",
    scope: "global",
    dim: 1024,
    seeded: true,
    description: "Rule Cards + *-pattern.md (patterns/**, rules/**) — global-indexer.ts::buildPatternsIndex",
  },
  {
    name: "library_reference_global",
    scope: "global",
    dim: 1024,
    seeded: true,
    description: "@vytches/ddd TS examples + LLMGUIDE.md concepts/api (quickstart/core/advanced/exhaustive) — global-indexer.ts::buildLibraryReferenceIndex",
  },
];

export const GLOBAL_COLLECTIONS = COLLECTION_REGISTRY.filter((c) => c.scope === "global");

// Payload fields needing a keyword index on EVERY collection: kind/tags/level for filtering,
// source for diversity grouping (store-qdrant.ts::search groups by 'source'). feature/combines
// back the retrieve_examples OR-match (feature param matches either field, see index.ts::buildFilter);
// lib_version supports pinning/drift queries against a specific @vytches/ddd release.
export const PAYLOAD_INDEX_FIELDS = ["kind", "tags", "level", "source", "feature", "combines", "lib_version"] as const;
