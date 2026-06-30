// Reseed all code collections from reseed.config.json into the dedicated Qdrant.
// Inherits KR_EMBED_PROVIDER/URL/MODEL — swap the model via env, rerun, done (recreates with new dim).
import { readFileSync } from "node:fs";
import { buildCodeIndex } from "./dist/indexer.js";

const cfg = JSON.parse(readFileSync(new URL("./reseed.config.json", import.meta.url), "utf8"));
const cols = cfg.collections ?? {};
for (const [collection, dirs] of Object.entries(cols)) {
  console.error(`[reseed] ${collection} ← ${dirs.join(", ")}`);
  const n = await buildCodeIndex(dirs, collection);
  console.error(`[reseed]   ${collection}: ${n} chunks`);
}
console.error("[reseed] done");
