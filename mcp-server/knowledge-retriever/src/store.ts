// Flat vector store (MVP): JSON-backed, brute-force cosine.
// Fine for the patterns/rules corpus (small). Phase 2: swap for sqlite-vec when indexing CODE
// (6800+ files) — the StoreLike interface keeps that swap localized.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Chunk, Hit } from "./types.js";

export interface StoreLike {
  upsert(chunks: Chunk[]): void;
  search(queryVec: number[], k: number): Hit[];
  save(): void;
}

function cosine(a: number[], b: number[]): number {
  // vectors are already L2-normalized by the embedder → dot product == cosine
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export class FlatStore implements StoreLike {
  private chunks: Chunk[] = [];

  constructor(private path: string) {
    try {
      this.chunks = JSON.parse(readFileSync(path, "utf8")).chunks ?? [];
    } catch {
      this.chunks = [];
    }
  }

  upsert(chunks: Chunk[]): void {
    const byId = new Map(this.chunks.map((c) => [c.id, c]));
    for (const c of chunks) byId.set(c.id, c);
    this.chunks = [...byId.values()];
  }

  search(queryVec: number[], k: number): Hit[] {
    return this.chunks
      .filter((c) => c.vector)
      .map((c) => ({ source: c.source, section: c.section, text: c.text, score: cosine(queryVec, c.vector!) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify({ chunks: this.chunks }, null, 0));
  }

  get size(): number {
    return this.chunks.length;
  }
}
