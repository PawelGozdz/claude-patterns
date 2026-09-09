// Reseed all code collections from reseed.config.json into the dedicated Qdrant.
// Inherits KR_EMBED_PROVIDER/URL/MODEL — swap the model via env, rerun, done (recreates with new dim).
//
// Two config shapes (see reseed.config.json::_spec):
//   { repo, ref, dirs, repoName }  → index that git ref's tree (canonical; TASK-RAG-004 R2)
//   ["../../../foo/src"]           → legacy: index a live working tree, with a warning
// Optional filter: `node reseed.mjs code_juz_ide_api` reseeds only the named collections.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCodeIndex } from "./dist/indexer.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(new URL("./reseed.config.json", import.meta.url), "utf8"));
const cols = cfg.collections ?? {};

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const selected = Object.entries(cols).filter(([name]) => !only.length || only.includes(name));
if (only.length && selected.length !== only.length) {
  const missing = only.filter((n) => !cols[n]);
  console.error(`[reseed] unknown collection(s): ${missing.join(", ")} — known: ${Object.keys(cols).join(", ")}`);
  process.exit(1);
}

let failed = 0;
for (const [collection, spec] of selected) {
  try {
    if (Array.isArray(spec)) {
      console.error(`[reseed] ${collection} ← ${spec.join(", ")} (legacy working-tree form)`);
      const n = await buildCodeIndex(spec.map((d) => resolve(HERE, d)), collection);
      console.error(`[reseed]   ${collection}: ${n} chunks`);
      continue;
    }
    const repoRoot = resolve(HERE, spec.repo);
    const n = await buildCodeIndex({
      repoRoot,
      dirs: spec.dirs ?? ["src"],
      collection,
      repo: spec.repoName,
      gitRef: spec.ref,
    });
    console.error(`[reseed]   ${collection}: ${n} chunks`);
  } catch (e) {
    // One unreachable repo/ref must not abandon the remaining collections half-reseeded — the
    // failure is loud and the exit code is non-zero, but the rest still gets rebuilt.
    failed++;
    console.error(`[reseed]   ${collection}: FAILED — ${e.message}`);
  }
}
console.error(failed ? `[reseed] done with ${failed} failure(s)` : "[reseed] done");
process.exit(failed ? 1 : 0);
