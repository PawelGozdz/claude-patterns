#!/usr/bin/env node
// PostToolUse Hook: logs PR URL after `gh pr create` (K43, TASK-KAIZEN-001).
// Extracted from an inline `node -e` in hooks.json — same logic, just readable/testable.
const { readStdinJsonWithRaw } = require('./lib/utils');

async function main() {
  const { raw, parsed } = await readStdinJsonWithRaw();
  try {
    const cmd = parsed.tool_input?.command || '';
    if (/gh pr create/.test(cmd)) {
      const out = parsed.tool_output?.output || '';
      const m = out.match(/https:\/\/github.com\/[^/]+\/[^/]+\/pull\/\d+/);
      if (m) console.error('[Hook] PR created: ' + m[0]);
    }
  } catch {}
  console.log(raw);
  process.exit(0);
}

main();
