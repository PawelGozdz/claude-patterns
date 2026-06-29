export interface Chunk {
  id: string;          // stable: `${source}#${index}`
  source: string;      // relative file path
  section: string;     // heading the chunk belongs to
  text: string;
  vector?: number[];   // embedding (present once indexed)
}

export interface Hit {
  source: string;
  section: string;
  text: string;
  score: number;       // cosine similarity 0..1
}
