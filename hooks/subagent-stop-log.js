#!/usr/bin/env node
// SubagentStop Hook: logs which agent stopped and how long it ran (K43, TASK-KAIZEN-001).
// Extracted from an inline `node -e` in hooks.json — same logic, just readable/testable.
const { readStdinJsonWithRaw } = require('./lib/utils');

async function main() {
  const { raw } = await readStdinJsonWithRaw();
  try {
    const i = JSON.parse(raw);
    console.error('[Subagent] Stopped: ' + (i.agent_name || '?') + ' (' + (i.duration_ms ? Math.round(i.duration_ms / 1000) + 's' : '?') + ')');
  } catch {}
  console.log(raw);
  process.exit(0);
}

main();
