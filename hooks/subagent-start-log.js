#!/usr/bin/env node
// SubagentStart Hook: logs which agent/model started (K43, TASK-KAIZEN-001).
// Extracted from an inline `node -e` in hooks.json — same logic, just readable/testable.
const { readStdinJsonWithRaw } = require('./lib/utils');

async function main() {
  const { raw } = await readStdinJsonWithRaw();
  try {
    const i = JSON.parse(raw);
    console.error('[Subagent] Started: ' + (i.agent_name || '?') + ' (' + (i.model || '?') + ')');
  } catch {}
  console.log(raw);
  process.exit(0);
}

main();
