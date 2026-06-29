#!/usr/bin/env node
// knowledge-retriever — MCP server (stdio). Part of claude-patterns overlay-on-ECC.
// Complements ECC's external-knowledge skills (Context7/exa/deep-research) with INTERNAL
// retrieval (our patterns + project code). Consumed by /analyze-ddd and /orchestrate-ddd.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { retrieve, reload } from "./retrieve.js";
import { buildIndex } from "./indexer.js";

const server = new McpServer({ name: "knowledge-retriever", version: "0.1.0" });

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
  "knowledge_reindex",
  "Rebuild the retrieval index from corpus directories (patterns/rules). Run after pattern changes.",
  { dirs: z.array(z.string()).describe("absolute or cwd-relative dirs to index") },
  async ({ dirs }) => {
    const n = await buildIndex(dirs);
    reload();
    return { content: [{ type: "text", text: `reindexed ${n} chunks` }] };
  }
);

// TODO (Phase 2): retrieve_code (AST chunking + sqlite-vec), retrieve_decisions, hybrid+rerank.

await server.connect(new StdioServerTransport());
console.error("[knowledge-retriever] MCP server ready (stdio)");
