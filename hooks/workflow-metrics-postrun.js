#!/usr/bin/env node
/**
 * PostToolUse Hook: workflow-metrics-postrun — fire-and-forget zbieranie metryk po każdym
 * zakończonym wywołaniu narzędzia Workflow (TASK-OBS-002 §5).
 *
 * Odpala scripts/workflow-metrics-collect.mjs jako proces ODŁĄCZONY (spawn detached + unref),
 * więc hook wraca natychmiast, a collector dopisuje rekordy do ~/.claude/metrics/workflow-steps.jsonl
 * w tle. Collector jest idempotentny (klucz runId+agentId), więc podwójne odpalenie nie duplikuje.
 *
 * Kontrakt (jak knowledge-freshness-postwrite.js): przeczytaj stdin, JSON.parse w try/catch,
 * ZAWSZE przepisz stdin na stdout i exit 0 — nigdy nie blokuj pipeline'u. stderr = diagnostyka.
 *
 * Pułapki (memory hook-subagent-transcript-trap): żadnego skanowania transkryptów w hooku.
 * Defensywnie pomijamy wywołania z agent_id (kontekst subagenta) — Workflow i tak jest
 * narzędziem głównej pętli, ale sprawdzamy jawnie, jak check-delegation.js.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const MAX_STDIN = 1024 * 1024; // 1MB
let data = "";
process.stdin.setEncoding("utf8");

process.stdin.on("data", (chunk) => {
  if (data.length < MAX_STDIN) {
    data += chunk.substring(0, MAX_STDIN - data.length);
  }
});

process.stdin.on("end", () => {
  const finish = () => {
    process.stdout.write(data);
    process.exit(0);
  };

  let input;
  try {
    input = JSON.parse(data);
  } catch {
    finish();
    return;
  }

  try {
    // Tylko narzędzie Workflow, tylko główna pętla (defensywny check agent_id).
    if (input.tool_name !== "Workflow" || input.agent_id) {
      finish();
      return;
    }

    // Hook żyje w ~/.claude/hooks/ jako symlink do claude-patterns/hooks/ — collector leży
    // obok w scripts/. realpathSync rozwiązuje symlink, więc ścieżka trafia do repo.
    const hookReal = fs.realpathSync(__filename);
    const collector = path.resolve(path.dirname(hookReal), "..", "scripts", "workflow-metrics-collect.mjs");
    if (!fs.existsSync(collector)) {
      console.error("[workflow-metrics] collector nie znaleziony:", collector);
      finish();
      return;
    }

    const child = spawn(process.execPath, [collector, "--quiet"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    console.error("[workflow-metrics] zbieranie metryk przebiegu w tle → ~/.claude/metrics/workflow-steps.jsonl");
  } catch (err) {
    console.error("[workflow-metrics] pominięto:", err.message);
  }
  finish();
});
