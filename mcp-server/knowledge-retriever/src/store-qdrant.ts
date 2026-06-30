// Qdrant vector store (shared infra). Collections per corpus (e.g. cp_patterns, code_<project>).
// Cosine, dim from first vector (e5-large = 1024). Full-rebuild model: recreate() then add().
import { QdrantClient } from "@qdrant/js-client-rest";
import type { Chunk, Hit } from "./types.js";

const URL = process.env.KR_QDRANT_URL ?? "http://192.168.0.150:6333";

export class QdrantStore {
  private client: QdrantClient;
  constructor(private collection: string, url: string = URL) {
    this.client = new QdrantClient({ url });
  }

  async recreate(dim: number): Promise<void> {
    try { await this.client.deleteCollection(this.collection); } catch { /* not present */ }
    await this.client.createCollection(this.collection, { vectors: { size: dim, distance: "Cosine" } });
  }

  async add(chunks: Chunk[]): Promise<void> {
    const withVec = chunks.filter((c) => c.vector);
    if (!withVec.length) return;
    const points = withVec.map((c, i) => ({
      id: i + 1,
      vector: c.vector as number[],
      payload: { source: c.source, section: c.section, text: c.text, startLine: c.startLine ?? null, endLine: c.endLine ?? null },
    }));
    for (let i = 0; i < points.length; i += 256) {
      await this.client.upsert(this.collection, { wait: true, points: points.slice(i, i + 256) });
    }
  }

  async search(queryVec: number[], k: number): Promise<Hit[]> {
    const res = await this.client.search(this.collection, { vector: queryVec, limit: k, with_payload: true });
    return res.map((r) => {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      return {
        source: String(p.source ?? ""),
        section: String(p.section ?? ""),
        text: String(p.text ?? ""),
        startLine: (p.startLine as number) ?? undefined,
        endLine: (p.endLine as number) ?? undefined,
        score: r.score,
      };
    });
  }

  async health(): Promise<boolean> {
    try { await this.client.getCollections(); return true; } catch { return false; }
  }
}
