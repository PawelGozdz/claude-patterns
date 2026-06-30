#!/usr/bin/env node
// knowledge-retriever — MCP server (stdio). Part of claude-patterns overlay-on-ECC.
// Scope: CODE retrieval (find existing implementations by intent) — the validated, high-value use case.
// Patterns/decisions are served as markdown (decision cards + README), NOT embedded. See DECISIONS-LOG.
// Embeddings: pluggable (CT 301 e5-large / openai-compat). Store: dedicated Qdrant (docker-compose).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { retrieveCode, reload } from "./retrieve.js";
import { buildCodeIndex } from "./indexer.js";

const server = new McpServer({ name: "knowledge-retriever", version: "0.3.0" });

server.tool(
  "retrieve_code",
  "Semantic top-K retrieval of EXISTING project code (per-symbol: methods/functions/types) most " +
    "relevant to a task. Killer use-case: find similar existing implementations before writing new code " +
    "(avoids 'it doesn't exist' hallucinations + wrong signatures). Returns file + symbol + line range.",
  {
    query: z.string().describe("what to find in the codebase (capability/identifier/intent)"),
    k: z.number().int().positive().optional(),
    collection: z.string().optional().describe("Qdrant collection (e.g. code_juzide1); default code_default"),
  },
  async ({ query, k, collection }) => {
    const hits = await retrieveCode(query, k ?? 8, collection);
    return { content: [{ type: "text", text: JSON.stringify(hits, null, 2) }] };
  }
);

server.tool(
  "knowledge_reindex",
  "Rebuild a code collection in the dedicated Qdrant (recreate + re-embed + upsert). Run after code changes " +
    "or after swapping the embed model (KR_EMBED_*).",
  {
    dirs: z.array(z.string()).describe("absolute or cwd-relative source dirs to index"),
    collection: z.string().describe("Qdrant collection, e.g. code_juzide1"),
  },
  async ({ dirs, collection }) => {
    const n = await buildCodeIndex(dirs, collection);
    reload();
    return { content: [{ type: "text", text: `reindexed code/${collection}: ${n} chunks` }] };
  }
);

// TODO (Phase 3): hybrid (BM25) + rerank (CT 301 reranker), retrieve_decisions, incremental reindex hook, evals.

await server.connect(new StdioServerTransport());
console.error("[knowledge-retriever] MCP server ready (stdio) — code retrieval");
