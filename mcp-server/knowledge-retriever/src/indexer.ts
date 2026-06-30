// Indexer — code-only. Embeds via pluggable embedder (CT 301 / openai-compat), stores in the
// dedicated Qdrant. Patterns/decisions are NOT embedded (served as markdown — see DECISIONS-LOG).
// Usage: node dist/indexer.js --collection code_juzide1 --dir ../../../juz-ide-api-1/src
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { chunkCode } from "./code-chunker.js";
import { QdrantStore } from "./store-qdrant.js";
import { HttpEmbedder } from "./embedder.js";
import type { Chunk } from "./types.js";

const BATCH = 64;
const MANIFEST = process.env.KR_MANIFEST ?? "./mirror/collections.json"; // tiny, git-committed: model+dim per collection
const SKIP_DIR = (n: string) => n === "node_modules" || n === "dist" || n === "__tests__" || n.startsWith(".");
const isCode = (n: string) => (n.endsWith(".ts") || n.endsWith(".tsx")) && !n.endsWith(".spec.ts") && !n.endsWith(".d.ts");

function walk(dir: string, root: string, acc: Chunk[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) { if (!SKIP_DIR(name)) walk(full, root, acc); }
    else if (isCode(name)) acc.push(...chunkCode(readFileSync(full, "utf8"), relative(root, full)));
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
  const root = process.cwd();
  const chunks: Chunk[] = [];
  for (const d of dirs) walk(d, root, chunks);
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
