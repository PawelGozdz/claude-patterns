// Retrieval — embed query, cosine top-K over the flat store.
import { FlatStore } from "./store.js";
import { TransformersEmbedder, type Embedder } from "./embedder.js";
import type { Hit } from "./types.js";

const INDEX = process.env.KR_INDEX ?? "./.knowledge/index.json";

let store: FlatStore | null = null;
let embedder: Embedder | null = null;

export function reload(): void {
  store = new FlatStore(INDEX);
}

export async function retrieve(query: string, k = 5): Promise<Hit[]> {
  if (!store) reload();
  if (!embedder) embedder = new TransformersEmbedder();
  const qv = await embedder.embedQuery(query);
  return store!.search(qv, k);
}
