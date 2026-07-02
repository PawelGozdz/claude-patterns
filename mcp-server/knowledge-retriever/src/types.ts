// kind distinguishes the 4 content types across collections (code_<project>,
// best_practices_<project>, patterns_global, library_reference_global) — see schema.ts.
export type ChunkKind = "code" | "rule_card" | "example" | "anti_pattern";

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
  level?: "simple" | "medium" | "complex"; // examples only
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
  level?: "simple" | "medium" | "complex";
  indexedAt?: string;
}
