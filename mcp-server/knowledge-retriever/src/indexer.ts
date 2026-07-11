// Indexer — code-only. Embeds via pluggable embedder (CT 301 / openai-compat), stores in the
// dedicated Qdrant. Patterns/decisions are NOT embedded (served as markdown — see DECISIONS-LOG).
// Usage: node dist/indexer.js --collection code_juzide1 --dir ../../../juz-ide-api-1/src
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chunkCode } from "./code-chunker.js";
import { chunkDart } from "./dart-chunker.js";
import { QdrantStore } from "./store-qdrant.js";
import { HttpEmbedder } from "./embedder.js";
import type { Chunk } from "./types.js";

const BATCH = 64;
const MANIFEST = process.env.KR_MANIFEST ?? "./mirror/collections.json"; // tiny, git-committed: model+dim per collection
const SKIP_DIR = (n: string) => n === "node_modules" || n === "dist" || n === "__tests__" || n.startsWith(".");
const isTs = (n: string) => (n.endsWith(".ts") || n.endsWith(".tsx")) && !n.endsWith(".spec.ts") && !n.endsWith(".d.ts");
// Dart: skip generated files (.g/.freezed — build_runner output, retrieval noise) and tests
const isDart = (n: string) =>
  n.endsWith(".dart") && !n.endsWith(".g.dart") && !n.endsWith(".freezed.dart") && !n.endsWith("_test.dart");
const isCode = (n: string) => isTs(n) || isDart(n);
const chunkFile = (content: string, source: string): Chunk[] =>
  source.endsWith(".dart") ? chunkDart(content, source) : chunkCode(content, source);

// `dir` must already be absolute (callers resolve() before the first call) — `source` is stored
// as an absolute path so retrieve_code results are Read-able regardless of the caller's cwd
// (the daemon is a shared process; callers' cwd varies per project/session).
function walk(dir: string, acc: Chunk[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) { if (!SKIP_DIR(name)) walk(full, acc); }
    else if (isCode(name)) acc.push(...chunkFile(readFileSync(full, "utf8"), full));
  }
}

function recordManifest(collection: string, model: string, dim: number): void {
  let m: Record<string, unknown> = {};
  try { m = JSON.parse(readFileSync(MANIFEST, "utf8")); } catch { /* new */ }
  m[collection] = { model, dim };
  mkdirSync(MANIFEST.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

/** code → dedicated Qdrant (full rebuild). Recreates collection with the model's detected dim,
 *  so swapping the embed model + reseeding "just works". */
export async function buildCodeIndex(dirs: string[], collection: string): Promise<number> {
  const chunks: Chunk[] = [];
  for (const d of dirs) walk(resolve(d), chunks);
  if (!chunks.length) return 0;

  const embedder = new HttpEmbedder();
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const vecs = await embedder.embedPassages(slice.map((c) => `${c.section}\n${c.text}`));
    slice.forEach((c, j) => (c.vector = vecs[j]));
    console.error(`  embedded ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
  }

  const dim = chunks[0].vector!.length;
  const store = new QdrantStore(collection);
  await store.recreate(dim);
  await store.add(chunks);
  recordManifest(collection, embedder.describe(), dim);
  return chunks.length;
}

/** Incremental freshness — reindex ONE file (not a whole directory). deleteBySource() first drops
 *  this file's stale chunks (chunk count may have shrunk), then add() upserts the fresh ones —
 *  safe/idempotent thanks to the UUID v5 id scheme in store-qdrant.ts, unlike recreate() which
 *  would wipe the rest of the collection. Called from index.ts's POST /reindex-file (hook-driven). */
export async function reindexFile(absPath: string, collection: string): Promise<number> {
  const store = new QdrantStore(collection);
  await store.deleteBySource(absPath);

  const chunks = chunkFile(readFileSync(absPath, "utf8"), absPath);
  if (!chunks.length) return 0;

  const embedder = new HttpEmbedder();
  const now = new Date().toISOString();
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const vecs = await embedder.embedPassages(slice.map((c) => `${c.section}\n${c.text}`));
    slice.forEach((c, j) => { c.vector = vecs[j]; c.indexedAt = now; });
  }

  await store.add(chunks);
  return chunks.length;
}

function parseArgs(argv: string[]): { dirs: string[]; collection: string } {
  let collection = "code_default";
  const dirs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--collection" && argv[i + 1]) collection = argv[++i];
    else if (argv[i] === "--dir" && argv[i + 1]) dirs.push(argv[++i]);
  }
  return { dirs, collection };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { dirs, collection } = parseArgs(process.argv.slice(2));
  if (dirs.length === 0) { console.error("usage: indexer --collection <name> --dir <dir> [--dir <dir>...]"); process.exit(1); }
  buildCodeIndex(dirs, collection)
    .then((n) => console.error(`[knowledge-retriever] code: indexed ${n} chunks → Qdrant/${collection}`))
    .catch((e) => { console.error(e); process.exit(1); });
}
