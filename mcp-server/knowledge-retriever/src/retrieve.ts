// Retrieval — embed query (pluggable embedder), KNN in the dedicated Qdrant. Shared by all three
// tools (retrieve_code, retrieve_patterns, retrieve_examples): same embed+search+format shape,
// just against different fixed collection names and different optional filters.
import { QdrantStore, type SearchOpts } from "./store-qdrant.js";
import { HttpEmbedder, type Embedder } from "./embedder.js";
import type { Hit } from "./types.js";

const CODE_COLLECTION = process.env.KR_CODE_COLLECTION ?? "code_default";

let embedder: Embedder | null = null;
const emb = (): Embedder => (embedder ??= new HttpEmbedder());

export function reload(): void {
  embedder = null;
}

export async function retrieveFromCollection(query: string, k: number, collection: string, opts?: SearchOpts): Promise<Hit[]> {
  const qv = await emb().embedQuery(query);
  return new QdrantStore(collection).search(qv, k, opts);
}

export async function retrieveCode(query: string, k = 8, collection = CODE_COLLECTION): Promise<Hit[]> {
  return retrieveFromCollection(query, k, collection);
}
