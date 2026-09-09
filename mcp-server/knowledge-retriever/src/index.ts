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
import { CollectionNotFoundError } from "./store-qdrant.js";
import { buildCodeIndex, reindexFile } from "./indexer.js";
import type { Hit } from "./types.js";

// How many lines of a code chunk come back as PROOF that the hit is real. The index answers
// "where does this concept live in this repo", not "what does it say" — the content of record is
// the file on the caller's own disk, which for twin checkouts is a different branch than the one
// indexed. A full chunk invites copying that stale text; a short excerpt is enough to judge
// relevance and forces the Read (TASK-RAG-004 R1.2). 0 = no truncation (escape hatch).
const CODE_EVIDENCE_LINES = Number(process.env.KR_CODE_EVIDENCE_LINES ?? 12);

const CODE_CONTRACT =
  "`source` is RELATIVE to the repo root — open it in YOUR OWN working tree (Read), never assume " +
  "another checkout's path. `evidence` is an excerpt justifying the hit, NOT material to copy: the " +
  "index may have been built from a different commit than your branch (compare `indexedSha` with " +
  "`git rev-parse HEAD`). Work on the content you read from disk.";

/** Code hits ship an `evidence` excerpt INSTEAD of the stored `text` — the field is dropped, not
 *  blanked, so nothing downstream can mistake an empty string for "this symbol has no body". */
type CodeHit = Omit<Hit, "text"> & { evidence: string; evidenceTruncated: boolean };

function toCodeHit(h: Hit): CodeHit | Hit {
  if (CODE_EVIDENCE_LINES <= 0) return h;
  const lines = h.text.split("\n");
  const { text: _text, ...rest } = h;
  return {
    ...rest,
    evidence: lines.slice(0, CODE_EVIDENCE_LINES).join("\n"),
    evidenceTruncated: lines.length > CODE_EVIDENCE_LINES,
  };
}

// Qdrant filter builder — {key,value} pairs with undefined values dropped; arrays use `any` (OR match).
// `must` conditions ALL have to hold; `should` conditions are an OR group — AT LEAST ONE has to hold,
// combined via AND with the `must` group (Qdrant semantics). Used by retrieve_examples's `feature`
// param to match a chunk whose `feature` field EQUALS the query OR whose `combines` array CONTAINS it
// — the caller shouldn't have to know which side of a combination a feature landed on (see types.ts).
function buildFilter(
  must: { key: string; value: unknown }[],
  should?: { key: string; value: unknown }[],
  mustNot?: { key: string; value: unknown }[]
): Record<string, unknown> | undefined {
  const mustClauses = must
    .filter((c) => c.value !== undefined)
    .map((c) => ({ key: c.key, match: Array.isArray(c.value) ? { any: c.value } : { value: c.value } }));
  const shouldClauses = (should ?? [])
    .filter((c) => c.value !== undefined)
    .map((c) => ({ key: c.key, match: { value: c.value } }));
  const mustNotClauses = (mustNot ?? [])
    .filter((c) => c.value !== undefined)
    .map((c) => ({ key: c.key, match: Array.isArray(c.value) ? { any: c.value } : { value: c.value } }));
  const filter: Record<string, unknown> = {};
  if (mustClauses.length) filter.must = mustClauses;
  if (shouldClauses.length) filter.should = shouldClauses;
  if (mustNotClauses.length) filter.must_not = mustNotClauses;
  return mustClauses.length || shouldClauses.length || mustNotClauses.length ? filter : undefined;
}

function buildServer(): McpServer {
  const server = new McpServer({ name: "knowledge-retriever", version: "0.5.0" });

  server.tool(
    "retrieve_code",
    "Semantic top-K retrieval of EXISTING project code (per-symbol: methods/functions/types) most " +
      "relevant to a task. Killer use-case: find similar existing implementations before writing new code " +
      "(avoids 'it doesn't exist' hallucinations + wrong signatures). Returns repo-relative file + symbol + " +
      "line range + a short `evidence` excerpt. " +
      "THE RESULT IS A POINTER, NOT CONTENT: `source` is relative to the repo root, so open it in YOUR OWN " +
      "working tree with Read and work on what you read there. Do NOT copy `evidence` — it is only proof the " +
      "hit is relevant, and it may come from a different commit than your branch (`indexedSha`). " +
      "IMPORTANT: this server is a SHARED daemon across projects — always pass `collection` explicitly. " +
      "The value comes ONLY from the project's config (.claude/config/runtime.yml → knowledge.collection, " +
      "mirrored in .claude/config/knowledge.json). NEVER derive it from the project directory name: " +
      "twin checkouts of the same repo share ONE collection (e.g. juz-ide-api-1..4 all use code_juz_ide_api).",
    {
      query: z.string().describe("what to find in the codebase (capability/identifier/intent)"),
      k: z.number().int().positive().optional(),
      collection: z.string().optional().describe(
        "Qdrant collection — copy the exact value from the project's runtime.yml → knowledge.collection " +
          "(do NOT construct it from the directory name); default code_default — pass explicitly"
      ),
    },
    async ({ query, k, collection }) => {
      try {
        const hits = await retrieveCode(query, k ?? 8, collection);
        // The contract travels WITH the result, not only in the tool description: a subagent gets
        // this JSON pasted into a prompt long after the description scrolled out of its context.
        const body = { _contract: CODE_CONTRACT, hits: hits.map(toCodeHit) };
        return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
      } catch (e) {
        if (e instanceof CollectionNotFoundError) {
          return { content: [{ type: "text", text:
            `ERROR: collection '${e.collection}' does not exist. Available collections: [${e.available.join(", ")}]. ` +
            `The correct name comes from the project's .claude/config/runtime.yml → knowledge.collection — ` +
            `never derive it from the directory name (twin checkouts share ONE collection, e.g. ` +
            `juz-ide-api-1..4 → code_juz_ide_api). Retry with the configured name; if the project is ` +
            `genuinely unindexed, fall back to grep.` } ] };
        }
        throw e;
      }
    }
  );

  server.tool(
    "retrieve_patterns",
    "Semantic retrieval of DDD Rule Cards / canonical pattern docs / anti-patterns from claude-patterns " +
      "(patterns/**, rules/**) — GLOBAL collection, shared across every project (not per-project). Use for " +
      "'how should I model X' / 'what's the canonical rule for Y' questions — distinct from retrieve_code " +
      "(existing project implementations, may contain drift/bugs). By default EXCLUDES patterns marked " +
      "project-specific (derived from one project's codebase, not yet generalized) — pass `project` " +
      "(matching that project's name, e.g. 'juz-ide-api-1') to include that project's own patterns too.",
    {
      query: z.string().describe("what pattern/rule to find"),
      k: z.number().int().positive().optional(),
      kind: z.enum(["rule_card", "anti_pattern"]).optional(),
      tags: z.array(z.string()).optional(),
      project: z.string().optional().describe(
        "include project-specific patterns for this project name too (default: only universal patterns)"
      ),
    },
    async ({ query, k, kind, tags, project }) => {
      const filter = buildFilter(
        [{ key: "kind", value: kind }, { key: "tags", value: tags }],
        project ? [{ key: "scope", value: "universal" }, { key: "project", value: project }] : undefined,
        project ? undefined : [{ key: "scope", value: "project-specific" }]
      );
      try {
        const hits = await retrieveFromCollection(query, k ?? 5, "patterns_global", { filter });
        return { content: [{ type: "text", text: JSON.stringify(hits, null, 2) }] };
      } catch (e) {
        if (e instanceof CollectionNotFoundError) {
          return { content: [{ type: "text", text:
            `ERROR: global collection 'patterns_global' is not seeded — run ./scripts/reseed-patterns.sh in claude-patterns.` } ] };
        }
        throw e;
      }
    }
  );

  server.tool(
    "retrieve_examples",
    "Semantic retrieval of @vytches/ddd library reference material — GLOBAL collection. Covers " +
      "runnable code examples (kind=example/anti_pattern), curated concept prose from LLMGUIDE.md " +
      "patterns/hidden-features (kind=concept), and single-symbol API reference rows from LLMGUIDE.md " +
      "Key API tables (kind=api). Use to see canonical usage, read the conceptual rationale, or look up " +
      "one symbol's current signature (prefer this over recalling a signature from training data).",
    {
      query: z.string().describe("what library capability/usage/symbol to find"),
      k: z.number().int().positive().optional(),
      level: z.enum(["quickstart", "core", "advanced", "exhaustive"]).optional()
        .describe("quickstart=package overview, core=primary/common usage, advanced=less common patterns, exhaustive=full per-symbol API enumeration"),
      kind: z.enum(["example", "anti_pattern", "concept", "api"]).optional().describe("omit to search across all kinds"),
      feature: z.string().optional().describe(
        "a vytches-ddd package name, e.g. 'policies'. Matches chunks where this is the PRIMARY feature " +
          "OR a SECONDARY one they combine with (e.g. querying 'events' also returns a policies example " +
          "that reacts to a domain event) — you don't need to know which side of a combination it's on."
      ),
      lib_version: z.string().optional().describe("filter to chunks extracted from this exact @vytches/ddd version, e.g. '0.30.0'"),
    },
    async ({ query, k, level, kind, feature, lib_version }) => {
      const filter = buildFilter(
        [{ key: "level", value: level }, { key: "kind", value: kind }, { key: "lib_version", value: lib_version }],
        feature ? [{ key: "feature", value: feature }, { key: "combines", value: feature }] : undefined
      );
      try {
        const hits = await retrieveFromCollection(query, k ?? 5, "library_reference_global", { filter });
        return { content: [{ type: "text", text: JSON.stringify(hits, null, 2) }] };
      } catch (e) {
        if (e instanceof CollectionNotFoundError) {
          return { content: [{ type: "text", text:
            `ERROR: global collection 'library_reference_global' is not seeded — run ./scripts/reseed-patterns.sh in claude-patterns.` } ] };
        }
        throw e;
      }
    }
  );

  server.tool(
    "knowledge_reindex",
    "Rebuild a code collection in the dedicated Qdrant (recreate + re-embed + upsert). Run after code changes " +
      "or after swapping the embed model (KR_EMBED_*).",
    {
      repoRoot: z.string().optional().describe("repo root every stored path is relative to (recommended)"),
      dirs: z.array(z.string()).describe("subdirs to index — repo-relative when repoRoot is given"),
      collection: z.string().describe("Qdrant collection, e.g. code_juzide1"),
      ref: z.string().optional().describe("index this git ref's tree instead of the working tree, e.g. 'origin/develop'"),
      repo: z.string().optional().describe("canonical repo name stored in the payload; defaults to basename(repoRoot)"),
    },
    async ({ repoRoot, dirs, collection, ref, repo }) => {
      const n = repoRoot
        ? await buildCodeIndex({ repoRoot, dirs, collection, repo, gitRef: ref })
        : await buildCodeIndex(dirs, collection);
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
          const { file, collection, repoRoot } = JSON.parse(body);
          const chunks = await reindexFile(file, collection, repoRoot);
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
