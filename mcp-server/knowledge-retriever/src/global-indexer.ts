// Global (claude-patterns-wide, NOT per-project) collection seeders — patterns_global (rule cards
// + anti-patterns from patterns/**/*.md + rules/**/*.md) and library_reference_global (@vytches/ddd
// TS examples + curated LLMGUIDE.md concepts/api reference). Separate from indexer.ts (per-project
// code, one collection per project).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkCode } from "./code-chunker.js";
import { chunkMarkdown, slugify } from "./markdown-chunker.js";
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
const VYTCHES_ROOT = "/opt/projects/vytches-ddd";
const VYTCHES_EXAMPLES_ROOT = join(VYTCHES_ROOT, "examples");
const SUITES = ["quickstart", "domain-services", "policies"] as const;

// Curated JSON chunks extracted from packages/*/LLMGUIDE.md + docs/llm-context.md — NOT mechanically
// parsed. Their structure (Key API table rows, bold-paragraph-led Anti-Patterns/Hidden Features,
// enterprise's re-export cross-reference) doesn't fit markdown-chunker's H2/H3-heading model, so an
// LLM extraction pass classifies each file into {section,text,kind,feature,combines,tags,level}
// chunks and commits the result here as a versioned artifact (see TASK-RAG-003 sec 0.1) — re-run the
// extraction only when vytches-ddd's LLMGUIDE.md content actually changes, not on every seed.
const CONCEPTS_DATA_DIR = join(PKG_ROOT, "data", "library-reference");

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

// global.config.json::vytchesLevels predates the quickstart/core/advanced/exhaustive taxonomy (it
// used a simple/medium/complex complexity scale for runnable TS examples) — recreate()'s full-wipe
// model means no migration path is needed, just a one-time remap at read time.
const LEGACY_EXAMPLE_LEVEL_MAP: Record<string, Chunk["level"]> = {
  simple: "quickstart",
  medium: "core",
  complex: "advanced",
};

function loadLibVersion(): string {
  try {
    const lerna = JSON.parse(readFileSync(join(VYTCHES_ROOT, "lerna.json"), "utf8"));
    return String(lerna.version);
  } catch {
    console.error(`[global-indexer] ${VYTCHES_ROOT}/lerna.json missing/unreadable — lib_version left 'unknown'`);
    return "unknown";
  }
}

/** @vytches/ddd runnable TS examples (quickstart/domain-services/policies) → Chunk[], kind='example'.
 *  Reuses code-chunker's AST chunker (already generic TS, works fine on these files). */
function gatherExampleChunks(libVersion: string): Chunk[] {
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
      const legacyLevel = levels[key];
      if (!legacyLevel) console.error(`[global-indexer] no level mapping for '${key}' — defaulting to 'medium'`);
      else if (!(legacyLevel in LEGACY_EXAMPLE_LEVEL_MAP)) console.error(`[global-indexer] unrecognized level '${legacyLevel}' for '${key}' (expected simple/medium/complex) — defaulting to 'core'`);
      const level = LEGACY_EXAMPLE_LEVEL_MAP[legacyLevel ?? "medium"] ?? "core";
      for (const c of chunkCode(readFileSync(abs, "utf8"), abs)) {
        c.kind = "example";
        c.tags = ["vytches-ddd", suite];
        c.level = level;
        c.feature = suite;
        c.lib_version = libVersion;
        chunks.push(c);
      }
    }
  }
  return chunks;
}

interface RawConceptChunk {
  section: string;
  text: string;
  kind: "concept" | "api" | "anti_pattern";
  feature?: string;
  combines?: string[];
  tags: string[];
  level: "quickstart" | "core" | "advanced" | "exhaustive";
}

/** Reads the LLM-extracted per-package JSON chunks (CONCEPTS_DATA_DIR/<pkg>.json, plus
 *  _llm-context.json for the cross-cutting master doc) and turns them into full Chunk objects —
 *  id/source/lib_version are filled in here since the extraction pass only produces the
 *  content-classification fields (section/text/kind/feature/combines/tags/level). */
function loadConceptChunks(libVersion: string): Chunk[] {
  let files: string[];
  try {
    files = readdirSync(CONCEPTS_DATA_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    console.error(`[global-indexer] ${CONCEPTS_DATA_DIR} not found — skipping LLMGUIDE.md concepts/api (run the extraction pass first)`);
    return [];
  }

  const chunks: Chunk[] = [];
  const seenIds = new Set<string>();
  for (const file of files) {
    const pkg = file.replace(/\.json$/, "");
    const source = pkg === "_llm-context" ? "docs/llm-context.md" : `packages/${pkg}/LLMGUIDE.md`;
    let raw: RawConceptChunk[];
    try {
      raw = JSON.parse(readFileSync(join(CONCEPTS_DATA_DIR, file), "utf8"));
    } catch (e) {
      console.error(`[global-indexer] ${file} — malformed JSON, skipping this file: ${(e as Error).message}`);
      continue;
    }
    for (const r of raw) {
      const id = `${source}#${slugify(r.section)}`;
      // Two chunks in the same file with the same section text collapse to the same Qdrant point ID
      // (uuidv5(id, NAMESPACE) in store-qdrant.ts) — the second upsert silently overwrites the first.
      // Warn now rather than let it surface only as an unexplained count drop on a future re-seed.
      if (seenIds.has(id)) console.error(`[global-indexer] duplicate chunk id '${id}' in ${file} — later chunk will overwrite the earlier one on upsert`);
      seenIds.add(id);
      chunks.push({
        id,
        source,
        section: r.section,
        text: r.text,
        kind: r.kind,
        tags: r.tags,
        level: r.level,
        feature: r.feature,
        combines: r.combines,
        lib_version: libVersion,
      });
    }
  }
  return chunks;
}

/** @vytches/ddd runnable examples + curated LLMGUIDE.md concepts/api reference → ONE
 *  library_reference_global. Both sources are gathered before a SINGLE recreate()+add() —
 *  recreate() drops the whole collection, so seeding the two sources independently would let the
 *  second call wipe the first's data. */
export async function buildLibraryReferenceIndex(): Promise<number> {
  const libVersion = loadLibVersion();
  const chunks = [...gatherExampleChunks(libVersion), ...loadConceptChunks(libVersion)];
  if (!chunks.length) return 0;

  await embedAll(chunks, "library-reference");
  const dim = chunks[0].vector!.length;
  const store = new QdrantStore("library_reference_global");
  await store.recreate(dim);
  await store.add(chunks);
  return chunks.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const doPatterns = args.includes("--patterns") || args.includes("--all");
  const doLibrary = args.includes("--examples") || args.includes("--library") || args.includes("--all");
  if (!doPatterns && !doLibrary) {
    console.error("usage: global-indexer.js --patterns | --examples | --all  (--library is an alias for --examples)");
    process.exit(1);
  }
  (async () => {
    if (doPatterns) console.error(`[global-indexer] patterns_global: ${await buildPatternsIndex()} chunks`);
    if (doLibrary) console.error(`[global-indexer] library_reference_global: ${await buildLibraryReferenceIndex()} chunks`);
  })().catch((e) => { console.error(e); process.exit(1); });
}
