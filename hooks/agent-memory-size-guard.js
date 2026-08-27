#!/usr/bin/env node
/**
 * SubagentStop Hook — warn when an agent's MEMORY.md grows unbounded (K35, TASK-KAIZEN-001).
 *
 * `.claude/agent-memory/<agent>/MEMORY.md` accumulates across every subagent run and is
 * git-tracked — nothing was watching it, so one agent's memory can quietly reach hundreds
 * of KB (juz-ide-api-1: security-e2e-verifier at 16.7 KB while every other agent stayed
 * under 3.5 KB) before anyone notices it's being loaded whole into every future spawn.
 *
 * DELIBERATELY does not auto-compact or move content out of git — this repo's convention
 * treats agent-memory as git-tracked, reviewable history; silently rewriting or archiving
 * it behind the scenes would be a bigger, riskier decision than a size warning warrants.
 * A human decides what to trim; this hook only makes the growth visible.
 *
 * Always exits 0 — never blocks the workflow.
 */

const fs = require('fs');
const path = require('path');
const { readStdinJson } = require('./lib/utils');

const WARN_BYTES = 10 * 1024; // ~10 KB — comfortably above the normal 2-3.5 KB range observed

if (process.env.AGENT_MEMORY_SIZE_GUARD === 'off') process.exit(0);

async function main() {
  const input = await readStdinJson({ maxSize: 256 * 1024 });
  try {
    const agentName =
      input.subagent_type ||
      input.agent_name ||
      input.tool_input?.subagent_type ||
      null;

    if (!agentName) process.exit(0);

    const memoryPath = path.join(process.cwd(), '.claude', 'agent-memory', agentName, 'MEMORY.md');
    let size;
    try { size = fs.statSync(memoryPath).size; } catch { process.exit(0); }

    if (size > WARN_BYTES) {
      const kb = (size / 1024).toFixed(1);
      process.stderr.write(
        `⚠ .claude/agent-memory/${agentName}/MEMORY.md jest ${kb} KB (próg ostrzeżenia: ${WARN_BYTES / 1024} KB) ` +
        `— ten plik jest wczytywany w całości przy każdym spawnie tego agenta. Rozważ ręczne przycięcie ` +
        `starych wpisów (K35, TASK-KAIZEN-001 w claude-patterns).\n`
      );
    }
  } catch {
    // nieparsowalny payload albo brak dostępu do pliku — nigdy nie blokuj workflow
  }
  process.exit(0);
}

main();
