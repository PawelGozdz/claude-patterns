// Indexer — embeds via shared CT 301 (e5-large), stores in Qdrant. Modes:
//   patterns: walk *.md → chunkMarkdown → Qdrant(cp_patterns) + git-mirror JSON (offline fallback)
//   code:     walk *.ts/*.tsx → chunkCode (AST) → Qdrant(code_<project>)
// Usage:
//   node dist/indexer.js --patterns ../../patterns --rules ../../rules
//   node dist/indexer.js --mode code --collection code_juzide1 --dir ../../../juz-ide-api-1/src
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { chunkMarkdown } from "./chunker.js";
import { chunkCode } from "./code-chunker.js";
import { FlatStore } from "./store.js";
import { QdrantStore } from "./store-qdrant.js";
import { HttpEmbedder } from "./embedder.js";
import type { Chunk } from "./types.js";

const PATTERNS_COLLECTION = process.env.KR_PATTERNS_COLLECTION ?? "cp_patterns";
const PATTERNS_MIRROR = process.env.KR_PATTERNS_MIRROR ?? "./mirror/cp_patterns.json"; // git-committed offline fallback
const BATCH = 64;

const SKIP_DIR = (n: string) => n === "node_modules" || n === "dist" || n === "__tests__" || n.startsWith(".");
const isCode = (n: string) => (n.endsWith(".ts") || n.endsWith(".tsx")) && !n.endsWith(".spec.ts") && !n.endsWith(".d.ts");

function walk(dir: string, root: string, accept: (n: string) => boolean, chunk: (t: string, s: string) => Chunk[], acc: Chunk[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) { if (!SKIP_DIR(name)) walk(full, root, accept, chunk, acc); }
    else if (accept(name)) acc.push(...chunk(readFileSync(full, "utf8"), relative(root, full)));
  }
}

async function embedAll(chunks: Chunk[]): Promise<void> {
  const embedder = new HttpEmbedder();
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const vecs = await embedder.embedPassages(slice.map((c) => `${c.section}\n${c.text}`));
    slice.forEach((c, j) => (c.vector = vecs[j]));
    console.error(`  embedded ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
  }
}

/** patterns/rules → Qdrant + git-mirror (offline fallback). */
export async function buildIndex(dirs: string[], collection = PATTERNS_COLLECTION): Promise<number> {
  const root = process.cwd();
  const chunks: Chunk[] = [];
  for (const d of dirs) walk(d, root, (n) => n.endsWith(".md"), chunkMarkdown, chunks);
  await embedAll(chunks);
  // git-mirror FIRST (offline fallback) — so it exists even if Qdrant is down. Patterns small+stable.
  const mirror = new FlatStore(PATTERNS_MIRROR);
  mirror.upsert(chunks);
  mirror.save();
  // Qdrant best-effort — don't fail the whole index if the vector DB is unavailable.
  try {
    const store = new QdrantStore(collection);
    await store.recreate(chunks[0].vector!.length);
    await store.add(chunks);
  } catch (e) {
    console.error(`[knowledge-retriever] Qdrant upsert skipped (${(e as Error).message}); git-mirror written, retrieval will use fallback.`);
  }
  return chunks.length;
}

/** code → Qdrant (no git-mirror — too large/churny; rebuild from source if needed). */
export async function buildCodeIndex(dirs: string[], collection: string): Promise<number> {
  const root = process.cwd();
  const chunks: Chunk[] = [];
  for (const d of dirs) walk(d, root, isCode, chunkCode, chunks);
  await embedAll(chunks);
  const store = new QdrantStore(collection);
  await store.recreate(chunks[0].vector!.length);
  await store.add(chunks);
  return chunks.length;
}

function parseArgs(argv: string[]): { mode: "patterns" | "code"; dirs: string[]; collection?: string } {
  let mode: "patterns" | "code" = "patterns";
  let collection: string | undefined;
  const dirs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--mode" && argv[i + 1]) mode = argv[++i] as "patterns" | "code";
    else if (argv[i] === "--collection" && argv[i + 1]) collection = argv[++i];
    else if ((argv[i] === "--patterns" || argv[i] === "--rules" || argv[i] === "--dir") && argv[i + 1]) dirs.push(argv[++i]);
  }
  return { mode, dirs, collection };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { mode, dirs, collection } = parseArgs(process.argv.slice(2));
  if (dirs.length === 0) { console.error("usage: indexer [--mode patterns|code] [--collection NAME] --dir <dir> ..."); process.exit(1); }
  const run = mode === "code"
    ? buildCodeIndex(dirs, collection ?? "code_default")
    : buildIndex(dirs, collection ?? PATTERNS_COLLECTION);
  run
    .then((n) => console.error(`[knowledge-retriever] ${mode}: indexed ${n} chunks → Qdrant${mode === "patterns" ? " + mirror" : ""}`))
    .catch((e) => { console.error(e); process.exit(1); });
}
