// Retrieval — embed query (pluggable embedder), KNN in the dedicated Qdrant.
// Code-only: retrieve_code is the validated, high-value use case (find existing impl by intent).
// Patterns/decisions are served as markdown (decision cards + README), NOT embedded — see DECISIONS-LOG.
import { QdrantStore } from "./store-qdrant.js";
import { HttpEmbedder, type Embedder } from "./embedder.js";
import type { Hit } from "./types.js";

const CODE_COLLECTION = process.env.KR_CODE_COLLECTION ?? "code_default";

let embedder: Embedder | null = null;
const emb = (): Embedder => (embedder ??= new HttpEmbedder());

export function reload(): void {
  embedder = null;
}

export async function retrieveCode(query: string, k = 8, collection = CODE_COLLECTION): Promise<Hit[]> {
  const qv = await emb().embedQuery(query);
  return new QdrantStore(collection).search(qv, k);
}
