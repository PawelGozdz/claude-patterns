// Indexer — walk corpus dirs, chunk markdown, embed (passages), persist to the store.
// Usage: node dist/indexer.js --patterns ../../patterns --rules ../../rules
// Index path: env KR_INDEX (default ./.knowledge/index.json)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { chunkMarkdown } from "./chunker.js";
import { FlatStore } from "./store.js";
import { TransformersEmbedder } from "./embedder.js";
import type { Chunk } from "./types.js";

const INDEX = process.env.KR_INDEX ?? "./.knowledge/index.json";

function walkMd(dir: string, root: string, acc: Chunk[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walkMd(full, root, acc);
    } else if (name.endsWith(".md")) {
      acc.push(...chunkMarkdown(readFileSync(full, "utf8"), relative(root, full)));
    }
  }
}

function parseDirs(argv: string[]): string[] {
  const dirs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === "--patterns" || argv[i] === "--rules" || argv[i] === "--dir") && argv[i + 1]) {
      dirs.push(argv[++i]);
    }
  }
  return dirs;
}

export async function buildIndex(dirs: string[], indexPath = INDEX): Promise<number> {
  const root = process.cwd();
  const chunks: Chunk[] = [];
  for (const d of dirs) walkMd(d, root, chunks);

  const embedder = new TransformersEmbedder();
  // batch to keep memory bounded
  const BATCH = 32;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const vecs = await embedder.embedPassages(slice.map((c) => `${c.section}\n${c.text}`));
    slice.forEach((c, j) => (c.vector = vecs[j]));
  }

  const store = new FlatStore(indexPath);
  store.upsert(chunks);
  store.save();
  return chunks.length;
}

// CLI entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const dirs = parseDirs(process.argv.slice(2));
  if (dirs.length === 0) {
    console.error("usage: indexer --patterns <dir> [--rules <dir>] [--dir <dir>]");
    process.exit(1);
  }
  buildIndex(dirs)
    .then((n) => console.error(`[knowledge-retriever] indexed ${n} chunks → ${INDEX}`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
