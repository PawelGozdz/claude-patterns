export interface Chunk {
  id: string;          // stable: `${source}#${index}`
  source: string;      // relative file path
  section: string;     // heading / symbol the chunk belongs to
  text: string;
  vector?: number[];   // embedding (present once indexed)
  startLine?: number;  // code chunks: 1-based start line
  endLine?: number;    // code chunks: 1-based end line
}

export interface Hit {
  source: string;
  section: string;
  text: string;
  score: number;       // cosine similarity 0..1
  startLine?: number;
  endLine?: number;
}
