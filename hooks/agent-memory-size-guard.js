#!/usr/bin/env node
/**
 * SubagentStop Hook — warn when an agent's memory grows unbounded or fills with
 * per-task status notes (K35, TASK-KAIZEN-001; tightened 2026-09-06 after the
 * juz-ide-api-3 audit: security-e2e-verifier had 118 files / 9 988 lines, 111 of
 * them `project_ts_*_status` notes about tasks already in completed-tasks/).
 *
 * `.claude/agent-memory/<agent>/MEMORY.md` is loaded whole into every future spawn of
 * that agent, so its size is a direct context tax. The per-file notes are loaded on
 * demand, but a directory full of task statuses means the agent is using memory as a
 * run log — which belongs in the task file and git history, not here.
 *
 * DELIBERATELY does not auto-compact, delete or move content — agent-memory is
 * git-tracked, reviewable history; a human decides what to trim. This hook only makes
 * the growth and the anti-pattern visible.
 *
 * Always exits 0 — never blocks the workflow.
 */

const fs = require('fs');
const path = require('path');
const { readStdinJson } = require('./lib/utils');

const WARN_INDEX_BYTES = 4 * 1024;   // MEMORY.md — ~40 lines; observed healthy range 1–3.5 KB
const WARN_FILE_COUNT = 20;          // notes per agent — beyond this, most are stale run logs
const WARN_TOTAL_BYTES = 40 * 1024;  // whole directory
const STATUS_NOTE = /^(project_)?ts[-_].*(status|_go|_findings|_review|_verification)\.md$/i;

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

    const dir = path.join(process.cwd(), '.claude', 'agent-memory', agentName);
    let entries;
    try { entries = fs.readdirSync(dir).filter((f) => f.endsWith('.md')); } catch { process.exit(0); }

    const warnings = [];
    const indexPath = path.join(dir, 'MEMORY.md');
    let indexSize = 0;
    try { indexSize = fs.statSync(indexPath).size; } catch { /* no index yet */ }
    if (indexSize > WARN_INDEX_BYTES) {
      warnings.push(`MEMORY.md ma ${(indexSize / 1024).toFixed(1)} KB (próg ${WARN_INDEX_BYTES / 1024} KB) — wczytywany w całości przy każdym spawnie; utrzymuj ≤ 40 linii, jedna linia na wpis.`);
    }

    const notes = entries.filter((f) => f !== 'MEMORY.md');
    if (notes.length > WARN_FILE_COUNT) {
      warnings.push(`${notes.length} plików pamięci (próg ${WARN_FILE_COUNT}) — większość to zwykle nieaktualne notatki o stanie; usuń te, których treść jest już w repo.`);
    }

    const statusNotes = notes.filter((f) => STATUS_NOTE.test(f));
    if (statusNotes.length > 0) {
      warnings.push(`${statusNotes.length} plików wygląda na status/wynik taska (${statusNotes.slice(0, 3).join(', ')}${statusNotes.length > 3 ? ', …' : ''}) — status taska należy do pliku taska w project-orchestration/, nie do pamięci agenta.`);
    }

    let total = 0;
    for (const f of entries) { try { total += fs.statSync(path.join(dir, f)).size; } catch { /* ignore */ } }
    if (total > WARN_TOTAL_BYTES) {
      warnings.push(`cały katalog pamięci ma ${(total / 1024).toFixed(1)} KB (próg ${WARN_TOTAL_BYTES / 1024} KB).`);
    }

    if (warnings.length > 0) {
      process.stderr.write(
        `⚠ .claude/agent-memory/${agentName}/: ` + warnings.join(' ') +
        ` Zasady: sekcja „Memory discipline" w definicji agenta (K35, TASK-KAIZEN-001).\n`
      );
    }
  } catch {
    // nieparsowalny payload albo brak dostępu do pliku — nigdy nie blokuj workflow
  }
  process.exit(0);
}

main();
