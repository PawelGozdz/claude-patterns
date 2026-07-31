// Qdrant vector store (shared infra). Collections per corpus (e.g. cp_patterns, code_<project>).
// Cosine, dim from first vector (e5-large = 1024). Full-rebuild model: recreate() then add().
import { QdrantClient } from "@qdrant/js-client-rest";
import { v5 as uuidv5 } from "uuid";
import type { Chunk, ChunkKind, Hit } from "./types.js";

// Dedicated, isolated Qdrant (docker-compose) — NOT the shared prod :6333.
const URL = process.env.KR_QDRANT_URL ?? "http://localhost:6401";

// Fixed namespace for point IDs — RFC 4122 well-known DNS namespace, reused only as a stable seed
// (not a "real" DNS reference). uuidv5(chunk.id, NAMESPACE) is deterministic, so re-adding the same
// chunk.id (incremental re-embed, or seeding from two separate source walks) upserts in place
// instead of colliding with an unrelated sequential id.
const NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

export interface SearchOpts {
  diversify?: boolean; // default true — server-side group_by:'source' caps hits-per-file
  maxPerSource?: number; // default 2
  filter?: Record<string, unknown>; // Qdrant filter, e.g. { must: [{ key: "kind", match: { value: "anti_pattern" } }] }
}

function toHit(p: { score: number; payload?: Record<string, unknown> | null }): Hit {
  const payload = (p.payload ?? {}) as Record<string, unknown>;
  return {
    source: String(payload.source ?? ""),
    section: String(payload.section ?? ""),
    text: String(payload.text ?? ""),
    startLine: (payload.startLine as number) ?? undefined,
    endLine: (payload.endLine as number) ?? undefined,
    kind: (payload.kind as ChunkKind) ?? undefined,
    tags: (payload.tags as string[]) ?? undefined,
    level: (payload.level as Hit["level"]) ?? undefined,
    feature: (payload.feature as string) ?? undefined,
    combines: (payload.combines as string[]) ?? undefined,
    lib_version: (payload.lib_version as string) ?? undefined,
    indexedAt: (payload.indexedAt as string) ?? undefined,
    scope: (payload.scope as Hit["scope"]) ?? undefined,
    project: (payload.project as string) ?? undefined,
    score: p.score,
  };
}

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
    const points = withVec.map((c) => ({
      id: uuidv5(c.id, NAMESPACE), // deterministic — safe to call add() repeatedly for the same chunk.id
      vector: c.vector as number[],
      payload: {
        source: c.source, section: c.section, text: c.text,
        startLine: c.startLine ?? null, endLine: c.endLine ?? null,
        kind: c.kind ?? null, tags: c.tags ?? null, level: c.level ?? null, indexedAt: c.indexedAt ?? null,
        feature: c.feature ?? null, combines: c.combines ?? null, lib_version: c.lib_version ?? null,
        scope: c.scope ?? null, project: c.project ?? null,
      },
    }));
    for (let i = 0; i < points.length; i += 256) {
      await this.client.upsert(this.collection, { wait: true, points: points.slice(i, i + 256) });
    }
  }

  /** Delete-by-filter on payload.source — used by indexer.ts::reindexFile to drop a file's stale
   *  chunks before re-adding fresh ones (add() alone would leave orphans if chunk count shrank). */
  async deleteBySource(source: string): Promise<void> {
    await this.client.delete(this.collection, { filter: { must: [{ key: "source", match: { value: source } }] } });
  }

  /** Idempotent keyword payload-index creation — only creates indexes missing from
   *  getCollection().payload_schema, so re-running migrate.ts is a safe no-op. Returns the fields
   *  actually created (empty = everything already present). */
  async ensurePayloadIndexes(fields: string[]): Promise<string[]> {
    const info = await this.client.getCollection(this.collection);
    const existing = new Set(Object.keys(info.payload_schema ?? {}));
    const created: string[] = [];
    for (const field of fields) {
      if (existing.has(field)) continue;
      await this.client.createPayloadIndex(this.collection, { field_name: field, field_schema: "keyword" });
      created.push(field);
    }
    return created;
  }

  async search(queryVec: number[], k: number, opts: SearchOpts = {}): Promise<Hit[]> {
    const { diversify = true, maxPerSource = 2, filter } = opts;
    const exists = () => this.client.collectionExists(this.collection).then((r) => r.exists).catch(() => false);
    try {
      if (diversify) {
        const res = await this.client.searchPointGroups(this.collection, {
          vector: queryVec,
          group_by: "source",
          group_size: maxPerSource,
          limit: Math.ceil(k / maxPerSource) + 1,
          with_payload: true,
          filter,
        });
        const flat = res.groups.flatMap((g) => g.hits);
        flat.sort((a, b) => b.score - a.score);
        return flat.slice(0, k).map(toHit);
      }
      const res = await this.client.search(this.collection, { vector: queryVec, limit: k, with_payload: true, filter });
      return res.map(toHit);
    } catch (e) {
      // Collection not yet seeded (project registered via .mcp.json but not indexed) → graceful empty,
      // so retrieve_code falls back to grep instead of erroring. Re-throw genuine failures (Qdrant down).
      if (!(await exists())) {
        console.error(`[knowledge-retriever] collection '${this.collection}' not found — returning [] (reseed to populate)`);
        return [];
      }
      throw e;
    }
  }

  async health(): Promise<boolean> {
    try { await this.client.getCollections(); return true; } catch { return false; }
  }
}
