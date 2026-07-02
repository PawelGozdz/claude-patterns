#!/usr/bin/env node
// knowledge-retriever — MCP server. Part of claude-patterns overlay-on-ECC.
// Scope: semantic retrieval of code (retrieve_code, per-project), patterns/rules (retrieve_patterns,
// global), and library reference examples (retrieve_examples, global). Decisions are still served
// as markdown (decision cards + README), NOT embedded. See DECISIONS-LOG.
// Embeddings: pluggable (CT 301 e5-large / openai-compat). Store: dedicated Qdrant (docker-compose).
//
// Transport: KR_TRANSPORT=http (default; shared daemon via docker-compose, multi-project — every
// caller MUST pass `collection` explicitly since one daemon serves all projects) | stdio (legacy/debug —
// per-session subprocess spawned by Claude Code, KR_CODE_COLLECTION env sets the implicit default).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer } from "node:http";
import { z } from "zod";
import { retrieveCode, retrieveFromCollection, reload } from "./retrieve.js";
import { buildCodeIndex, reindexFile } from "./indexer.js";

// Qdrant filter builder — {key,value} pairs with undefined values dropped; arrays use `any` (OR match).
function buildFilter(conditions: { key: string; value: unknown }[]): Record<string, unknown> | undefined {
  const must = conditions
    .filter((c) => c.value !== undefined)
    .map((c) => ({ key: c.key, match: Array.isArray(c.value) ? { any: c.value } : { value: c.value } }));
  return must.length ? { must } : undefined;
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "knowledge-retriever", version: "0.5.0" });

  server.tool(
    "retrieve_code",
    "Semantic top-K retrieval of EXISTING project code (per-symbol: methods/functions/types) most " +
      "relevant to a task. Killer use-case: find similar existing implementations before writing new code " +
      "(avoids 'it doesn't exist' hallucinations + wrong signatures). Returns file + symbol + line range. " +
      "IMPORTANT: this server is a SHARED daemon across projects — always pass `collection` explicitly " +
      "(per-project name, e.g. code_juz_ide_api_1; see .claude/config/knowledge.json in the project).",
    {
      query: z.string().describe("what to find in the codebase (capability/identifier/intent)"),
      k: z.number().int().positive().optional(),
      collection: z.string().optional().describe("Qdrant collection (e.g. code_juzide1); default code_default — pass explicitly, do not rely on the default"),
    },
    async ({ query, k, collection }) => {
      const hits = await retrieveCode(query, k ?? 8, collection);
      return { content: [{ type: "text", text: JSON.stringify(hits, null, 2) }] };
    }
  );

  server.tool(
    "retrieve_patterns",
    "Semantic retrieval of DDD Rule Cards / canonical pattern docs / anti-patterns from claude-patterns " +
      "(patterns/**, rules/**) — GLOBAL collection, shared across every project (not per-project). Use for " +
      "'how should I model X' / 'what's the canonical rule for Y' questions — distinct from retrieve_code " +
      "(existing project implementations, may contain drift/bugs).",
    {
      query: z.string().describe("what pattern/rule to find"),
      k: z.number().int().positive().optional(),
      kind: z.enum(["rule_card", "anti_pattern"]).optional(),
      tags: z.array(z.string()).optional(),
    },
    async ({ query, k, kind, tags }) => {
      const filter = buildFilter([{ key: "kind", value: kind }, { key: "tags", value: tags }]);
      const hits = await retrieveFromCollection(query, k ?? 5, "patterns_global", { filter });
      return { content: [{ type: "text", text: JSON.stringify(hits, null, 2) }] };
    }
  );

  server.tool(
    "retrieve_examples",
    "Semantic retrieval of @vytches/ddd library reference examples (simple/medium/complex complexity " +
      "tiers) — GLOBAL collection. Use to see canonical usage of a library feature (specifications, " +
      "policies, domain services) at a chosen complexity level.",
    {
      query: z.string().describe("what library capability/usage to find"),
      k: z.number().int().positive().optional(),
      level: z.enum(["simple", "medium", "complex"]).optional(),
      kind: z.enum(["example", "anti_pattern"]).optional().describe("default 'example' — vytches-ddd examples have no anti-patterns today, forward-compatible if that changes"),
    },
    async ({ query, k, level, kind }) => {
      const filter = buildFilter([{ key: "level", value: level }, { key: "kind", value: kind ?? "example" }]);
      const hits = await retrieveFromCollection(query, k ?? 5, "library_reference_global", { filter });
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

  return server;
}

// TODO (Phase 3): hybrid (BM25) + rerank (CT 301 reranker), retrieve_decisions, evals.

const TRANSPORT = (process.env.KR_TRANSPORT ?? "http").toLowerCase();

if (TRANSPORT === "stdio") {
  await buildServer().connect(new StdioServerTransport());
  console.error("[knowledge-retriever] MCP server ready (stdio) — code retrieval");
} else {
  const port = Number(process.env.KR_HTTP_PORT ?? 6403);
  const httpServer = createHttpServer(async (req, res) => {
    // Plain REST endpoint (NOT an MCP tool) — exists purely for the knowledge-freshness PostToolUse
    // hook to call via a simple HTTP POST, without needing to speak MCP's JSON-RPC framing. Agents
    // must not call this directly (it's not exposed as a tool). http-daemon-only (stdio transport
    // has no HTTP server to attach it to, so freshness is unavailable there — that's fine, it's an
    // opt-in per-project feature anyway).
    if (req.method === "POST" && req.url === "/reindex-file") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        try {
          const { file, collection } = JSON.parse(body);
          const chunks = await reindexFile(file, collection);
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ chunks }));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: String(e) }));
        }
      });
      return;
    }

    if (req.method !== "POST" || req.url !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    // Stateless mode: fresh server + transport per request — avoids request-id collisions
    // across concurrent clients/sessions sharing this daemon (multiple projects at once).
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => transport.close());
    await buildServer().connect(transport);
    await transport.handleRequest(req, res);
  });
  httpServer.listen(port, () => {
    console.error(`[knowledge-retriever] MCP server ready (http) — code/patterns/examples retrieval, :${port}/mcp`);
  });
}
