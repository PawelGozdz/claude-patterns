// Indexer — code-only. Embeds via pluggable embedder (CT 301 / openai-compat), stores in the
// dedicated Qdrant. Patterns/decisions are NOT embedded (served as markdown — see DECISIONS-LOG).
// Usage: node dist/indexer.js --collection code_juzide1 --repo ../../../juz-ide-api-1 --dir src
//        node dist/indexer.js --collection code_juzide1 --repo <path> --ref origin/develop --dir src
import { readdirSync, readFileSync, statSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { chunkCode } from "./code-chunker.js";
import { chunkDart } from "./dart-chunker.js";
import { QdrantStore } from "./store-qdrant.js";
import { HttpEmbedder } from "./embedder.js";
import { PAYLOAD_INDEX_FIELDS } from "./schema.js";
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

/** Config for one code collection. `repoRoot` is what every stored `source` is relative to. */
export interface CodeIndexSpec {
  repoRoot: string;   // absolute path to the repo root
  dirs: string[];     // repo-relative subdirectories to index (e.g. ["src"])
  collection: string;
  repo?: string;      // canonical repo name written into the payload; defaults to basename(repoRoot)
  gitRef?: string;    // when set, index this ref's tree instead of the working tree (TASK-RAG-004 R2)
}

// `dir` is absolute; `repoRoot` is the absolute repo root every stored path is relative to.
// `source` is stored REPO-RELATIVE, not absolute: the daemon is shared and four checkouts of the
// same repo share one collection, so an absolute path from one checkout resolves in another to a
// file that exists and reads cleanly — from the wrong branch, with nothing to signal it. Relative
// means the caller resolves the hit in its own tree, which is the only tree it should be editing.
function walk(dir: string, acc: Chunk[], repoRoot: string): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) { if (!SKIP_DIR(name)) walk(full, acc, repoRoot); }
    else if (isCode(name)) acc.push(...chunkFile(readFileSync(full, "utf8"), relative(repoRoot, full)));
  }
}

function recordManifest(collection: string, model: string, dim: number, extra: Record<string, unknown> = {}): void {
  let m: Record<string, unknown> = {};
  try { m = JSON.parse(readFileSync(MANIFEST, "utf8")); } catch { /* new */ }
  m[collection] = { model, dim, ...extra };
  mkdirSync(MANIFEST.replace(/\/[^/]+$/, ""), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}

const git = (repoRoot: string, args: string[]): string =>
  execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();

/** Materialize `<ref>:<dirs>` into a throwaway directory and return its path.
 *  `git archive | tar -x` is ONE git process for the whole tree; `git show` per file would be one
 *  process per file (8k+ in juz-ide-api/src). The extracted tree is also a clean repoRoot by
 *  construction, so relative paths come out right without special-casing. */
function extractRef(repoRoot: string, ref: string, dirs: string[]): string {
  const tmp = mkdtempSync(join(tmpdir(), "kr-index-"));
  const tarPath = join(tmp, "tree.tar");
  execFileSync("git", ["-C", repoRoot, "archive", "--format=tar", "-o", tarPath, ref, "--", ...dirs], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  execFileSync("tar", ["-xf", tarPath, "-C", tmp]);
  rmSync(tarPath, { force: true });
  return tmp;
}

/** code → dedicated Qdrant (full rebuild). Recreates collection with the model's detected dim,
 *  so swapping the embed model + reseeding "just works".
 *
 *  Legacy call shape `buildCodeIndex(dirs, collection)` still works and means "index these live
 *  working-tree directories" — it is kept only so an unmigrated caller doesn't break, and it warns,
 *  because a live worktree puts one developer's WIP into a collection several checkouts read. */
export async function buildCodeIndex(spec: CodeIndexSpec): Promise<number>;
export async function buildCodeIndex(dirs: string[], collection: string): Promise<number>;
export async function buildCodeIndex(a: CodeIndexSpec | string[], b?: string): Promise<number> {
  const spec = Array.isArray(a) ? legacySpec(a, b!) : a;
  const repoRoot = resolve(spec.repoRoot);
  const repo = spec.repo ?? basename(repoRoot);

  let scanRoot = repoRoot;
  let sha: string | undefined;
  let tmpRoot: string | undefined;

  if (spec.gitRef) {
    sha = git(repoRoot, ["rev-parse", spec.gitRef]);
    console.error(`[indexer] ${spec.collection} ← ${repo}@${spec.gitRef} (${sha.slice(0, 9)}) — canonical ref, not the working tree`);
    tmpRoot = extractRef(repoRoot, spec.gitRef, spec.dirs);
    scanRoot = tmpRoot;
  } else {
    console.error(
      `[indexer] WARN ${spec.collection} ← ${repoRoot} working tree — uncommitted WIP will leak into a collection ` +
      `that other checkouts of this repo also read. Give the collection a "ref" in reseed.config.json (TASK-RAG-004 R2).`
    );
  }

  try {
    const chunks: Chunk[] = [];
    for (const d of spec.dirs) walk(join(scanRoot, d), chunks, scanRoot);
    if (!chunks.length) return 0;

    const indexedAt = new Date().toISOString();
    for (const c of chunks) { c.repo = repo; c.indexedSha = sha; c.indexedAt = indexedAt; }

    const embedder = new HttpEmbedder();
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      const vecs = await embedder.embedPassages(slice.map((c) => `${c.section}\n${c.text}`));
      slice.forEach((c, j) => (c.vector = vecs[j]));
      console.error(`  embedded ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
    }

    const dim = chunks[0].vector!.length;
    const store = new QdrantStore(spec.collection);
    await store.recreate(dim);
    await store.add(chunks);
    await store.ensurePayloadIndexes([...PAYLOAD_INDEX_FIELDS]);
    recordManifest(spec.collection, embedder.describe(), dim, {
      repo, ref: spec.gitRef ?? null, sha: sha ?? null, indexedAt,
    });
    return chunks.length;
  } finally {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  }
}

/** Old positional signature: bare directories, no repo root. Everything above `dirs[0]`'s deepest
 *  common ancestor is unknowable, so we anchor on the first dir's parent and say so out loud. */
function legacySpec(dirs: string[], collection: string): CodeIndexSpec {
  const first = resolve(dirs[0]);
  const repoRoot = first.replace(/\/(src|lib|packages)(\/.*)?$/, "") || first;
  console.error(
    `[indexer] WARN legacy buildCodeIndex(dirs, collection) — repoRoot inferred as ${repoRoot}. ` +
    `Pass {repoRoot, dirs, collection, repo, gitRef} instead so 'source' is anchored deliberately.`
  );
  return { repoRoot, dirs: dirs.map((d) => relative(repoRoot, resolve(d)) || "."), collection };
}

/** Incremental freshness — reindex ONE file (not a whole directory). deleteBySource() first drops
 *  this file's stale chunks (chunk count may have shrunk), then add() upserts the fresh ones —
 *  safe/idempotent thanks to the UUID v5 id scheme in store-qdrant.ts, unlike recreate() which
 *  would wipe the rest of the collection. Called from index.ts's POST /reindex-file (hook-driven).
 *
 *  `repoRoot` is REQUIRED in practice: stored sources are repo-relative since TASK-RAG-004 R1, and
 *  deleteBySource matches the exact stored string. Passing an absolute path here would delete
 *  nothing and then add a second, differently-keyed copy of every chunk — orphans that accumulate
 *  silently on every save. Without a repoRoot we refuse rather than corrupt the collection. */
export async function reindexFile(absPath: string, collection: string, repoRoot?: string): Promise<number> {
  const abs = resolve(absPath);
  if (!repoRoot) {
    throw new Error(
      `reindexFile(${collection}) needs a repoRoot: stored sources are repo-relative, so an absolute ` +
      `path deletes nothing and duplicates every chunk (TASK-RAG-004 R1).`
    );
  }
  const root = resolve(repoRoot);
  const rel = relative(root, abs);
  if (rel.startsWith("..")) throw new Error(`reindexFile: ${abs} is outside repoRoot ${root}`);

  // A collection pinned to a git ref is DELIBERATELY a snapshot of that ref (R2). Letting one
  // checkout's file-save dribble into it is exactly the asymmetric contamination R2 closes — and
  // it was invisible, because the injected chunks look like any other hit.
  const pinned = pinnedCollections();
  if (pinned.has(collection)) {
    throw new Error(
      `reindexFile refused: '${collection}' is indexed from a canonical git ref ` +
      `(${pinned.get(collection)}), so per-file freshness from a working tree would contaminate it. ` +
      `Use your own worktree via Read/Grep; reseed after merging (TASK-RAG-004 R2.3).`
    );
  }

  const store = new QdrantStore(collection);
  await store.deleteBySource(rel);

  const chunks = chunkFile(readFileSync(abs, "utf8"), rel);
  if (!chunks.length) return 0;

  const repo = basename(root);
  const embedder = new HttpEmbedder();
  const now = new Date().toISOString();
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const vecs = await embedder.embedPassages(slice.map((c) => `${c.section}\n${c.text}`));
    slice.forEach((c, j) => { c.vector = vecs[j]; c.indexedAt = now; c.repo = repo; });
  }

  await store.add(chunks);
  return chunks.length;
}

/** collection → ref, for collections reseed.config.json pins to a canonical git ref. Read fresh on
 *  each call (the daemon is long-lived and the config is edited by humans between reseeds). */
function pinnedCollections(): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const cfg = JSON.parse(readFileSync(new URL("../reseed.config.json", import.meta.url), "utf8"));
    for (const [name, v] of Object.entries<Record<string, unknown>>(cfg.collections ?? {})) {
      if (!Array.isArray(v) && v && typeof v.ref === "string") out.set(name, v.ref);
    }
  } catch { /* no config next to dist/ — nothing is pinned */ }
  return out;
}

function parseArgs(argv: string[]): { dirs: string[]; collection: string; repoRoot?: string; ref?: string; repo?: string } {
  let collection = "code_default";
  let repoRoot: string | undefined;
  let ref: string | undefined;
  let repo: string | undefined;
  const dirs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--collection" && argv[i + 1]) collection = argv[++i];
    else if (argv[i] === "--dir" && argv[i + 1]) dirs.push(argv[++i]);
    else if (argv[i] === "--repo" && argv[i + 1]) repoRoot = argv[++i];
    else if (argv[i] === "--ref" && argv[i + 1]) ref = argv[++i];
    else if (argv[i] === "--repo-name" && argv[i + 1]) repo = argv[++i];
  }
  return { dirs, collection, repoRoot, ref, repo };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { dirs, collection, repoRoot, ref, repo } = parseArgs(process.argv.slice(2));
  if (dirs.length === 0) {
    console.error("usage: indexer --collection <name> [--repo <repo-root>] [--ref <git-ref>] [--repo-name <name>] --dir <dir> [--dir <dir>...]");
    process.exit(1);
  }
  const run = repoRoot
    ? buildCodeIndex({ repoRoot, dirs, collection, repo, gitRef: ref })
    : buildCodeIndex(dirs, collection);
  run
    .then((n) => console.error(`[knowledge-retriever] code: indexed ${n} chunks → Qdrant/${collection}`))
    .catch((e) => { console.error(e); process.exit(1); });
}
