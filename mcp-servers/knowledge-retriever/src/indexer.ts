// Indexer — two modes:
//   patterns (default): walk *.md → chunkMarkdown → FlatStore (JSON+cosine), small corpus
//   code:               walk *.ts/*.tsx → chunkCode (AST) → SqliteVecStore (sqlite-vec), large corpus
// Usage:
//   node dist/indexer.js --patterns ../../patterns --rules ../../rules
//   node dist/indexer.js --mode code --dir ../../../juz-ide-api-1/src
// Index paths: KR_INDEX (patterns, ./.knowledge/index.json), KR_CODE_INDEX (code, ./.knowledge/code.db)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { chunkMarkdown } from "./chunker.js";
import { chunkCode } from "./code-chunker.js";
import { FlatStore } from "./store.js";
import { SqliteVecStore } from "./store-sqlite.js";
import { TransformersEmbedder } from "./embedder.js";
import type { Chunk } from "./types.js";

const INDEX = process.env.KR_INDEX ?? "./.knowledge/index.json";
const CODE_INDEX = process.env.KR_CODE_INDEX ?? "./.knowledge/code.db";
const BATCH = 32;

const SKIP_DIR = (n: string) => n === "node_modules" || n === "dist" || n === "__tests__" || n.startsWith(".");
const isCode = (n: string) => (n.endsWith(".ts") || n.endsWith(".tsx")) && !n.endsWith(".spec.ts") && !n.endsWith(".d.ts");

function walk(dir: string, root: string, accept: (n: string) => boolean, chunk: (text: string, src: string) => Chunk[], acc: Chunk[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIR(name)) walk(full, root, accept, chunk, acc);
    } else if (accept(name)) {
      acc.push(...chunk(readFileSync(full, "utf8"), relative(root, full)));
    }
  }
}

async function embedAll(chunks: Chunk[]): Promise<void> {
  const embedder = new TransformersEmbedder();
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const vecs = await embedder.embedPassages(slice.map((c) => `${c.section}\n${c.text}`));
    slice.forEach((c, j) => (c.vector = vecs[j]));
    if (i % (BATCH * 10) === 0) console.error(`  embedded ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
  }
}

/** Patterns/rules → flat JSON store. */
export async function buildIndex(dirs: string[], indexPath = INDEX): Promise<number> {
  const root = process.cwd();
  const chunks: Chunk[] = [];
  for (const d of dirs) walk(d, root, (n) => n.endsWith(".md"), chunkMarkdown, chunks);
  await embedAll(chunks);
  const store = new FlatStore(indexPath);
  store.upsert(chunks);
  store.save();
  return chunks.length;
}

/** Code → sqlite-vec store (full rebuild). */
export async function buildCodeIndex(dirs: string[], dbPath = CODE_INDEX): Promise<number> {
  const root = process.cwd();
  const chunks: Chunk[] = [];
  for (const d of dirs) walk(d, root, isCode, chunkCode, chunks);
  await embedAll(chunks);
  const store = new SqliteVecStore(dbPath);
  store.clear();
  store.add(chunks);
  store.close();
  return chunks.length;
}

function parseArgs(argv: string[]): { mode: "patterns" | "code"; dirs: string[] } {
  let mode: "patterns" | "code" = "patterns";
  const dirs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--mode" && argv[i + 1]) mode = argv[++i] as any;
    else if ((argv[i] === "--patterns" || argv[i] === "--rules" || argv[i] === "--dir") && argv[i + 1]) dirs.push(argv[++i]);
  }
  return { mode, dirs };
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const { mode, dirs } = parseArgs(process.argv.slice(2));
  if (dirs.length === 0) {
    console.error("usage: indexer [--mode patterns|code] --dir <dir> [--patterns <dir>] [--rules <dir>]");
    process.exit(1);
  }
  const run = mode === "code" ? buildCodeIndex(dirs) : buildIndex(dirs);
  run
    .then((n) => console.error(`[knowledge-retriever] ${mode}: indexed ${n} chunks → ${mode === "code" ? CODE_INDEX : INDEX}`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
