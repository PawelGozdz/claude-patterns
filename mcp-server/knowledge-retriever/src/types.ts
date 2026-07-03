// kind distinguishes the content types across collections (code_<project>,
// best_practices_<project>, patterns_global, library_reference_global) — see schema.ts.
// 'concept' = curated prose (LLMGUIDE.md patterns/anti-patterns/hidden-features), 'api' =
// single-symbol reference row (LLMGUIDE.md Key API table, one row per chunk).
export type ChunkKind = "code" | "rule_card" | "example" | "anti_pattern" | "concept" | "api";

export interface Chunk {
  id: string;          // stable: `${source}#${index}` (code) or `${source}#${headingSlug}` (markdown)
  source: string;      // relative file path (code) or absolute file path (freshness re-embed)
  section: string;     // heading / symbol the chunk belongs to
  text: string;
  vector?: number[];   // embedding (present once indexed)
  startLine?: number;  // code chunks: 1-based start line
  endLine?: number;    // code chunks: 1-based end line
  kind?: ChunkKind;
  tags?: string[];     // e.g. [framework, layer, library]
  level?: "quickstart" | "core" | "advanced" | "exhaustive"; // examples/concepts only
  // feature = anchor/primary capability this chunk demonstrates (1:1 with a vytches-ddd package
  // name for library_reference_global, e.g. "policies"). combines = OTHER features the SAME
  // chunk also demonstrates alongside feature (e.g. feature:"policies", combines:["events"] for a
  // policy example that reacts to a domain event). Kept as two separate fields (not flattened)
  // so the section-0a combination coverage matrix (featureA × featureB) stays checkable, and so a
  // `retrieve_examples({feature})` query can match EITHER side via a Qdrant `should` clause — the
  // caller never needs to know whether a feature was the anchor or a secondary participant.
  feature?: string;
  combines?: string[];
  lib_version?: string; // @vytches/ddd version this chunk was extracted from (Lerna fixed-mode — one version for the whole library, not per-package)
  indexedAt?: string;  // ISO timestamp — freshness signal
}

export interface Hit {
  source: string;
  section: string;
  text: string;
  score: number;       // cosine similarity 0..1
  startLine?: number;
  endLine?: number;
  kind?: ChunkKind;
  tags?: string[];
  level?: "quickstart" | "core" | "advanced" | "exhaustive";
  feature?: string;
  combines?: string[];
  lib_version?: string;
  indexedAt?: string;
}
