#!/usr/bin/env node
// knowledge-retriever — MCP server (stdio). Part of claude-patterns overlay-on-ECC.
// Complements ECC's external-knowledge skills (Context7/exa/deep-research) with INTERNAL
// retrieval (our patterns + project code). Consumed by /analyze-ddd and /orchestrate-ddd.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { retrieve, retrieveCode, reload } from "./retrieve.js";
import { buildIndex, buildCodeIndex } from "./indexer.js";

const server = new McpServer({ name: "knowledge-retriever", version: "0.2.0" });

server.tool(
  "retrieve_patterns",
  "Semantic top-K retrieval of internal pattern/rule chunks most relevant to a task. " +
    "Use to ground analysis/implementation in OUR conventions (not external docs).",
  { task: z.string().describe("task or query to find relevant patterns for"), k: z.number().int().positive().optional() },
  async ({ task, k }) => {
    const hits = await retrieve(task, k ?? 5);
    return { content: [{ type: "text", text: JSON.stringify(hits, null, 2) }] };
  }
);

server.tool(
  "retrieve_code",
  "Semantic top-K retrieval of EXISTING project code (per-symbol: methods/functions/types) most " +
    "relevant to a task. Killer use-case: find similar existing implementations before writing new code " +
    "(avoids 'it doesn't exist' hallucinations + wrong signatures). Returns file + symbol + line range.",
  { query: z.string().describe("what to find in the codebase (capability/identifier/intent)"), k: z.number().int().positive().optional() },
  async ({ query, k }) => {
    const hits = await retrieveCode(query, k ?? 8);
    return { content: [{ type: "text", text: JSON.stringify(hits, null, 2) }] };
  }
);

server.tool(
  "knowledge_reindex",
  "Rebuild a retrieval index. mode 'patterns' → flat store (md); mode 'code' → sqlite-vec (ts/tsx).",
  {
    mode: z.enum(["patterns", "code"]).describe("which index to rebuild"),
    dirs: z.array(z.string()).describe("absolute or cwd-relative dirs to index"),
  },
  async ({ mode, dirs }) => {
    const n = mode === "code" ? await buildCodeIndex(dirs) : await buildIndex(dirs);
    reload();
    return { content: [{ type: "text", text: `reindexed ${mode}: ${n} chunks` }] };
  }
);

// TODO (Phase 3): retrieve_decisions (ADR/threat-model/BUSINESS_RULES), hybrid (BM25) + rerank,
// incremental reindex via PostToolUse hook, eval harness (precision/recall@K).

await server.connect(new StdioServerTransport());
console.error("[knowledge-retriever] MCP server ready (stdio)");
