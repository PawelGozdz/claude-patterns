// Global (claude-patterns-wide, NOT per-project) collection seeders — patterns_global (rule cards
// + anti-patterns from patterns/**/*.md + rules/**/*.md) and library_reference_global (@vytches/ddd
// examples). Separate from indexer.ts (per-project code, one collection per project).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkCode } from "./code-chunker.js";
import { chunkMarkdown } from "./markdown-chunker.js";
import { QdrantStore } from "./store-qdrant.js";
import { HttpEmbedder } from "./embedder.js";
import type { Chunk } from "./types.js";

const BATCH = 64;

// Resolve paths relative to THIS module, not process.cwd() — the CLI is invoked as
// `node dist/global-indexer.js` from mcp-server/knowledge-retriever/, but a caller could run it
// from elsewhere, so anchor on import.meta.url instead of assuming cwd.
const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."); // mcp-server/knowledge-retriever
const REPO_ROOT = resolve(PKG_ROOT, "..", ".."); // claude-patterns repo root
const GLOBAL_CONFIG_PATH = join(PKG_ROOT, "global.config.json");

// Sibling repo, NOT inside claude-patterns — hardcoded absolute path, no relative path exists across repos.
const VYTCHES_EXAMPLES_ROOT = "/opt/projects/vytches-ddd/examples";
const SUITES = ["quickstart", "domain-services", "policies"] as const;

const SKIP_META_FILES = new Set(["README.md", "EXTERNAL.md", "UPSTREAM_VERSION", "PLUGINS.md"]);

function walkMarkdown(dir: string, acc: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkMarkdown(full, acc);
    else if (name.endsWith(".md") && !SKIP_META_FILES.has(name)) acc.push(full);
  }
}

async function embedAll(chunks: Chunk[], label: string): Promise<void> {
  const embedder = new HttpEmbedder();
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const vecs = await embedder.embedPassages(slice.map((c) => `${c.section}\n${c.text}`));
    slice.forEach((c, j) => (c.vector = vecs[j]));
    console.error(`  ${label} embedded ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
  }
}

/** patterns/** + rules/** → patterns_global. Walks TWO trees but upserts into ONE collection —
 *  collect all chunks from both before the single recreate()+add() (recreate() drops the
 *  collection, so calling it twice would wipe the first tree's data). */
export async function buildPatternsIndex(): Promise<number> {
  const files: string[] = [];
  walkMarkdown(join(REPO_ROOT, "patterns"), files);
  walkMarkdown(join(REPO_ROOT, "rules"), files);

  const chunks: Chunk[] = [];
  for (const abs of files) {
    const rel = relative(REPO_ROOT, abs);
    chunks.push(...chunkMarkdown(readFileSync(abs, "utf8"), rel));
  }
  if (!chunks.length) return 0;

  await embedAll(chunks, "patterns");
  const dim = chunks[0].vector!.length;
  const store = new QdrantStore("patterns_global");
  await store.recreate(dim);
  await store.add(chunks);
  return chunks.length;
}

function walkTs(dir: string, acc: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "tests" || name === "node_modules") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkTs(full, acc);
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) acc.push(full);
  }
}

function loadLevelMap(): Record<string, string> {
  try {
    const cfg = JSON.parse(readFileSync(GLOBAL_CONFIG_PATH, "utf8"));
    return cfg.vytchesLevels ?? {};
  } catch {
    console.error(`[global-indexer] ${GLOBAL_CONFIG_PATH} missing/unreadable — all examples default to 'medium'`);
    return {};
  }
}

/** @vytches/ddd examples (quickstart/domain-services/policies) → library_reference_global.
 *  Reuses code-chunker's AST chunker (already generic TS, works fine on these files) and annotates
 *  each chunk with kind='example', tags=['vytches-ddd', suite], level from global.config.json. */
export async function buildExamplesIndex(): Promise<number> {
  const levels = loadLevelMap();
  const chunks: Chunk[] = [];

  for (const suite of SUITES) {
    const srcDir = join(VYTCHES_EXAMPLES_ROOT, suite, "src");
    const files: string[] = [];
    try {
      walkTs(srcDir, files);
    } catch {
      console.error(`[global-indexer] ${srcDir} not found — skipping suite '${suite}'`);
      continue;
    }
    for (const abs of files) {
      const basename = abs.split("/").pop()!;
      const key = `${suite}/${basename}`;
      let level = levels[key];
      if (!level) {
        console.error(`[global-indexer] no level mapping for '${key}' — defaulting to 'medium'`);
        level = "medium";
      }
      for (const c of chunkCode(readFileSync(abs, "utf8"), abs)) {
        c.kind = "example";
        c.tags = ["vytches-ddd", suite];
        c.level = level as Chunk["level"];
        chunks.push(c);
      }
    }
  }
  if (!chunks.length) return 0;

  await embedAll(chunks, "examples");
  const dim = chunks[0].vector!.length;
  const store = new QdrantStore("library_reference_global");
  await store.recreate(dim);
  await store.add(chunks);
  return chunks.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const doPatterns = args.includes("--patterns") || args.includes("--all");
  const doExamples = args.includes("--examples") || args.includes("--all");
  if (!doPatterns && !doExamples) {
    console.error("usage: global-indexer.js --patterns | --examples | --all");
    process.exit(1);
  }
  (async () => {
    if (doPatterns) console.error(`[global-indexer] patterns_global: ${await buildPatternsIndex()} chunks`);
    if (doExamples) console.error(`[global-indexer] library_reference_global: ${await buildExamplesIndex()} chunks`);
  })().catch((e) => { console.error(e); process.exit(1); });
}
