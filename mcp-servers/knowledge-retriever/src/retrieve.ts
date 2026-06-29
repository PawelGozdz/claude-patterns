// Retrieval — embed query, KNN over the relevant store.
//   patterns → FlatStore (JSON+cosine)
//   code     → SqliteVecStore (sqlite-vec)
import { FlatStore } from "./store.js";
import { SqliteVecStore } from "./store-sqlite.js";
import { TransformersEmbedder, type Embedder } from "./embedder.js";
import type { Hit } from "./types.js";

const INDEX = process.env.KR_INDEX ?? "./.knowledge/index.json";
const CODE_INDEX = process.env.KR_CODE_INDEX ?? "./.knowledge/code.db";

let patternStore: FlatStore | null = null;
let codeStore: SqliteVecStore | null = null;
let embedder: Embedder | null = null;

function emb(): Embedder {
  if (!embedder) embedder = new TransformersEmbedder();
  return embedder;
}

export function reload(): void {
  patternStore = new FlatStore(INDEX);
  if (codeStore) {
    codeStore.close();
    codeStore = null;
  }
}

export async function retrieve(query: string, k = 5): Promise<Hit[]> {
  if (!patternStore) patternStore = new FlatStore(INDEX);
  const qv = await emb().embedQuery(query);
  return patternStore.search(qv, k);
}

export async function retrieveCode(query: string, k = 8): Promise<Hit[]> {
  if (!codeStore) codeStore = new SqliteVecStore(CODE_INDEX);
  const qv = await emb().embedQuery(query);
  return codeStore.search(qv, k);
}
