#!/usr/bin/env node
// WorktreeCreate Hook: copies .env files into a newly created worktree (K43, TASK-KAIZEN-001).
// Extracted from an inline `node -e` in hooks.json — same logic, just readable/testable.
const fs = require('fs');
const path = require('path');
const { readStdinJsonWithRaw } = require('./lib/utils');

async function main() {
  const { raw, parsed } = await readStdinJsonWithRaw();
  try {
    const wt = parsed.worktree_path || '';
    if (wt) {
      ['.env', '.env.local', '.env.development', '.env.test'].forEach((f) => {
        const s = path.resolve(process.cwd(), f);
        const d2 = path.join(wt, f);
        if (fs.existsSync(s) && !fs.existsSync(d2)) {
          fs.copyFileSync(s, d2);
          console.error('[Hook] Copied ' + f + ' to worktree');
        }
      });
    }
  } catch {}
  console.log(raw);
  process.exit(0);
}

main();
