#!/usr/bin/env node
/**
 * Stop Hook: workflow-metrics-stop — domyka zbieranie metryk Workflow na końcu tury.
 *
 * Workflow startuje w tle: w chwili PostToolUse (workflow-metrics-postrun) przebieg jest jeszcze
 * „w toku", a collector pomija takie. Bez ponownego zbioru po zakończeniu przebieg znikał z
 * metryk (ai-gateway, 2026-10-15: 45 kroków, ~$11). Collector jest idempotentny (runId+agentId)
 * i tani (~0,3 s), więc odpalamy go po każdej turze głównej pętli.
 *
 * Kontrakt hooków: przepisz stdin na stdout, zawsze exit 0, nigdy nie blokuj.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { readStdinJsonWithRaw, isSubagent } = require("./lib/utils");

async function main() {
  const { raw, parsed: input } = await readStdinJsonWithRaw();

  const finish = () => {
    process.stdout.write(raw);
    process.exit(0);
  };

  try {
    if (isSubagent(input)) {
      finish();
      return;
    }
    const hookReal = fs.realpathSync(__filename);
    const collector = path.resolve(path.dirname(hookReal), "..", "scripts", "workflow-metrics-collect.mjs");
    if (!fs.existsSync(collector)) {
      console.error("[workflow-metrics] collector nie znaleziony:", collector);
      finish();
      return;
    }
    const child = spawn(process.execPath, [collector, "--quiet"], { detached: true, stdio: "ignore" });
    child.unref();
  } catch (err) {
    console.error("[workflow-metrics] pominięto:", err.message);
  }
  finish();
}

main();
