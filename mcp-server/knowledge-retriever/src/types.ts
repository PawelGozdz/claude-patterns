// kind distinguishes the content types across collections (code_<project>,
// best_practices_<project>, patterns_global, library_reference_global) — see schema.ts.
// 'concept' = curated prose (LLMGUIDE.md patterns/anti-patterns/hidden-features), 'api' =
// single-symbol reference row (LLMGUIDE.md Key API table, one row per chunk).
export type ChunkKind = "code" | "rule_card" | "example" | "anti_pattern" | "concept" | "api";

export interface Chunk {
  id: string;          // stable: `${source}#${index}` (code) or `${source}#${headingSlug}` (markdown)
  // ALWAYS repo-relative ("src/contexts/auth/user.aggregate.ts"), never absolute. The index is a
  // pointer into a repo, not into one machine's checkout: twin worktrees of the same repo share one
  // collection, so an absolute path from api-1 handed to an agent in api-2 resolves to a file that
  // EXISTS and reads fine — the wrong branch's version, silently (TASK-RAG-004 R1).
  source: string;
  // Canonical repo name the source path is relative to (reseed.config.json::repoName). Tells a
  // caller which working tree to resolve `source` in when one daemon serves several repos.
  repo?: string;
  // Commit the chunk was extracted from, when the collection is indexed off a git ref instead of a
  // live worktree (TASK-RAG-004 R2). Lets a caller notice "index is develop@abc, I'm on a branch".
  indexedSha?: string;
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
  // scope/project: patterns_global only. A pattern-doc marks itself project-specific via a
  // `**Scope**: project-specific (<project>)` line (see markdown-chunker.ts) — undefined/absent
  // means "universal" (the default for all pre-existing pattern docs, no migration needed).
  // retrieve_patterns excludes scope=="project-specific" by default so one project's derived
  // pattern doesn't get surfaced as generic guidance in an unrelated project's session.
  // assumes: blocks whose concepts this doc depends on (the **Assumes** marker,
  // mirrored from the materializer check) — carried into the index so a retrieval
  // hit shows the dependency without opening the file.
  assumes?: string[];
  scope?: "universal" | "project-specific";
  project?: string;
}

export interface Hit {
  source: string;      // repo-relative for code (see Chunk.source) — open it in YOUR OWN worktree
  repo?: string;
  section: string;
  // Full chunk text. For code hits index.ts replaces this with a truncated `evidence` field before
  // handing the result to an agent — the index answers "where does this concept live", and the
  // content of record is the file on the caller's disk, not the snapshot in the vector store.
  text: string;
  evidence?: string;          // first N lines of `text` — proof the hit is real, NOT material to copy
  evidenceTruncated?: boolean;
  score: number;       // cosine similarity 0..1
  startLine?: number;
  endLine?: number;
  kind?: ChunkKind;
  tags?: string[];
  level?: "quickstart" | "core" | "advanced" | "exhaustive";
  feature?: string;
  combines?: string[];
  lib_version?: string;
  indexedSha?: string;
  indexedAt?: string;
  scope?: "universal" | "project-specific";
  project?: string;
}
