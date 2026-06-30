// Retrieval — embed query (CT 301), KNN in Qdrant. Store resolver:
//   patterns → Qdrant primary, FALLBACK to git-mirror FlatStore (offline resilience)
//   code     → Qdrant only (rebuild from source if unavailable)
import { FlatStore } from "./store.js";
import { QdrantStore } from "./store-qdrant.js";
import { HttpEmbedder, type Embedder } from "./embedder.js";
import type { Hit } from "./types.js";

const PATTERNS_COLLECTION = process.env.KR_PATTERNS_COLLECTION ?? "cp_patterns";
const PATTERNS_MIRROR = process.env.KR_PATTERNS_MIRROR ?? "./mirror/cp_patterns.json";
const CODE_COLLECTION = process.env.KR_CODE_COLLECTION ?? "code_default";

let embedder: Embedder | null = null;
const emb = (): Embedder => (embedder ??= new HttpEmbedder());

export function reload(): void {
  embedder = null;
}

/** patterns: Qdrant → git-mirror fallback. */
export async function retrieve(query: string, k = 5): Promise<Hit[]> {
  const qv = await emb().embedQuery(query);
  try {
    return await new QdrantStore(PATTERNS_COLLECTION).search(qv, k);
  } catch (e) {
    console.error(`[knowledge-retriever] Qdrant unavailable, using git-mirror: ${(e as Error).message}`);
    return new FlatStore(PATTERNS_MIRROR).search(qv, k); // offline fallback
  }
}

/** code: Qdrant only. */
export async function retrieveCode(query: string, k = 8): Promise<Hit[]> {
  const qv = await emb().embedQuery(query);
  return new QdrantStore(CODE_COLLECTION).search(qv, k);
}
