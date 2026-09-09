#!/usr/bin/env node
/**
 * PostToolUse Hook: knowledge-retriever freshness — fire-and-forget incremental re-embed of an
 * edited .ts/.tsx/.dart file, IF the project opted in via .claude/config/knowledge.json.
 *
 * OPT-IN PER PROJECT — NOT registered in the global hooks.json (see hooks/README.md). A project
 * that uses knowledge-retriever adds this to its own .claude/settings.json PostToolUse hooks with
 * matcher "Edit|Write|MultiEdit".
 *
 * Contract (same as post-edit-typecheck.js): read all of stdin, JSON.parse in try/catch, ALWAYS
 * process.stdout.write(data); process.exit(0) at the end of every path — never block, never mutate
 * the tool-use pipeline. The HTTP POST is bounded by a ~3s timeout so the hook still returns quickly
 * even when the daemon is unreachable.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { readStdinJsonWithRaw } = require("./lib/utils");

async function main() {
  const { raw, parsed: input } = await readStdinJsonWithRaw();

  const finish = () => {
    process.stdout.write(raw);
    process.exit(0);
  };

  try {
    const filePath = input.tool_input?.file_path;
    // .ts/.tsx/.dart — mirrors indexer.ts::isCode (generated .g/.freezed.dart + tests excluded)
    if (
      !filePath ||
      !/\.(ts|tsx|dart)$/.test(filePath) ||
      /\.(g|freezed)\.dart$/.test(filePath) ||
      /_test\.dart$/.test(filePath)
    ) {
      finish();
      return;
    }

    const resolvedPath = path.resolve(filePath);

    // Walk up from the file's directory to find .claude/config/knowledge.json — same walk-up
    // pattern post-edit-typecheck.js uses for tsconfig.json (max 20 levels, stop at fs root).
    let dir = path.dirname(resolvedPath);
    const root = path.parse(dir).root;
    let depth = 0;
    let projectDir = null;
    while (dir !== root && depth < 20) {
      if (fs.existsSync(path.join(dir, ".claude", "config", "runtime.yml")) ||
          fs.existsSync(path.join(dir, ".claude", "config", "knowledge.json"))) {
        projectDir = dir;
        break;
      }
      dir = path.dirname(dir);
      depth++;
    }

    if (!projectDir) {
      finish();
      return;
    }

    // Źródłem jest runtime.yml (single source of truth po ADR 0008); knowledge.json
    // zostaje jako fallback dla repozytoriów jeszcze niezmigrowanych na bloki.
    // Odczyt regexem, nie parserem YAML — hook ma być bezzależnościowy i nigdy nie blokować.
    let collection = null;
    const runtimePath = path.join(projectDir, ".claude", "config", "runtime.yml");
    if (fs.existsSync(runtimePath)) {
      const m = fs.readFileSync(runtimePath, "utf8").match(/^knowledge:\s*\n\s+collection:\s*"?([\w.-]+)"?/m);
      if (m) collection = m[1];
    }
    if (!collection) {
      const legacy = path.join(projectDir, ".claude", "config", "knowledge.json");
      if (fs.existsSync(legacy)) collection = JSON.parse(fs.readFileSync(legacy, "utf8")).collection;
    }
    const watchDirs = Array.isArray(cfg.watchDirs) ? cfg.watchDirs : [];
    const relFromProject = path.relative(projectDir, resolvedPath);
    const watched = watchDirs.some(
      (w) => relFromProject === w || relFromProject.startsWith(w + path.sep)
    );

    if (!collection || !watched) {
      finish();
      return;
    }

    const port = process.env.KR_HTTP_PORT || 6403;
    // repoRoot jest OBOWIĄZKOWY od TASK-RAG-004 R1: chunki mają `source` względny wobec korzenia
    // repo, a deleteBySource dopasowuje dokładną wartość. Bez tego pola daemon dostałby ścieżkę
    // absolutną, nie skasowałby niczego i dołożył drugą kopię chunków przy każdym zapisie pliku.
    const payload = JSON.stringify({ file: resolvedPath, collection, repoRoot: projectDir });
    let settled = false;
    const complete = () => {
      if (settled) return;
      settled = true;
      finish();
    };

    const req = http.request(
      {
        hostname: "localhost",
        port,
        path: "/reindex-file",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
        timeout: 3000,
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", complete);
        res.on("error", complete);
      }
    );
    req.on("timeout", () => {
      req.destroy();
      complete();
    });
    req.on("error", (err) => {
      console.error("[knowledge-freshness] reindex POST failed (swallowed):", err.message);
      complete();
    });
    req.end(payload);
  } catch (err) {
    console.error("[knowledge-freshness] skipped:", err.message);
    finish();
  }
}

main();
