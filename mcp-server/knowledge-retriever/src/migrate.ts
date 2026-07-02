#!/usr/bin/env node
// Idempotent collection + payload-index migration — deliberately separate from seeding (schema
// changes and data upserts are independent, independently-rerunnable steps; one script must not do both).
// Usage: node dist/migrate.js --collection <name> [--dim 1024] [--force]
import { QdrantClient } from "@qdrant/js-client-rest";
import { QdrantStore } from "./store-qdrant.js";
import { PAYLOAD_INDEX_FIELDS } from "./schema.js";

const URL = process.env.KR_QDRANT_URL ?? "http://localhost:6401";

function parseArgs(argv: string[]): { collection: string; dim: number; force: boolean } {
  let collection = "";
  let dim = 1024;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--collection" && argv[i + 1]) collection = argv[++i];
    else if (argv[i] === "--dim" && argv[i + 1]) dim = Number(argv[++i]);
    else if (argv[i] === "--force") force = true;
  }
  return { collection, dim, force };
}

export async function migrate(collection: string, dim: number, force: boolean): Promise<void> {
  const client = new QdrantClient({ url: URL });
  const store = new QdrantStore(collection, URL);

  if (force) {
    await store.recreate(dim); // schema-breaking: drops existing data
    console.error(`[migrate] ${collection}: dropped + recreated (--force)`);
  } else {
    const exists = await client.collectionExists(collection).then((r) => r.exists).catch(() => false);
    if (!exists) {
      await store.recreate(dim); // nothing to drop — recreate() is just "create" here
      console.error(`[migrate] ${collection}: created (did not exist)`);
    } else {
      console.error(`[migrate] ${collection}: already exists — left data untouched`);
    }
  }

  const created = await store.ensurePayloadIndexes([...PAYLOAD_INDEX_FIELDS]);
  if (created.length) console.error(`[migrate] ${collection}: created payload indexes [${created.join(", ")}]`);
  else console.error(`[migrate] ${collection}: payload indexes already present — no-op`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { collection, dim, force } = parseArgs(process.argv.slice(2));
  if (!collection) { console.error("usage: migrate --collection <name> [--dim 1024] [--force]"); process.exit(1); }
  migrate(collection, dim, force).catch((e) => { console.error(e); process.exit(1); });
}
