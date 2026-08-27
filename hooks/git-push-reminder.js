#!/usr/bin/env node
// PreToolUse Hook: reminds to review changes before `git push` (K43, TASK-KAIZEN-001).
// Extracted from an inline `node -e` in hooks.json — same logic, just readable/testable.
const { readStdinJsonWithRaw } = require('./lib/utils');

async function main() {
  const { raw, parsed } = await readStdinJsonWithRaw();
  try {
    const cmd = parsed.tool_input?.command || '';
    if (/git push/.test(cmd)) console.error('[Hook] Review changes before push...');
  } catch {}
  console.log(raw);
  process.exit(0);
}

main();
