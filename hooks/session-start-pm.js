#!/usr/bin/env node
/**
 * SessionStart Hook — Auto-load TEAM-STATE.md for projects with PM-system
 *
 * Cross-platform (Windows, macOS, Linux).
 *
 * If the project rooted at process.cwd() has a `project-orchestration/`
 * directory with `TEAM-STATE.md`, the file is injected into Claude's
 * context at session start. This eliminates the "Claude forgot the
 * sprint state" problem on long tmux sessions.
 *
 * Silent for projects without PM-system. Never blocks (exit 0 always).
 * Reads TEAM-STATE.md only — no agent spawn, no cost.
 */

const fs = require('fs');
const path = require('path');

function findProjectRoot(startDir) {
  // Walk up to find the first dir containing project-orchestration/TEAM-STATE.md
  // Stops at filesystem root or 8 levels up (whichever first).
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'project-orchestration', 'TEAM-STATE.md');
    if (fs.existsSync(candidate)) {
      return { root: dir, teamStatePath: candidate };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function staleness(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const ageMs = Date.now() - stat.mtimeMs;
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    return ageDays;
  } catch {
    return null;
  }
}

function main() {
  const found = findProjectRoot(process.cwd());

  if (!found) {
    // No PM-system in this project — silent
    process.exit(0);
  }

  let content;
  try {
    content = fs.readFileSync(found.teamStatePath, 'utf8');
  } catch (err) {
    console.error(`[session-start-pm] Failed to read ${found.teamStatePath}: ${err.message}`);
    process.exit(0);
  }

  // If TEAM-STATE is empty or template-only, skip injection
  const meaningful = content
    .split('\n')
    .filter(line => {
      const t = line.trim();
      return t.length > 0 && !t.startsWith('#') && !t.startsWith('<!--');
    });
  if (meaningful.length < 3) {
    console.error('[session-start-pm] TEAM-STATE.md is empty or template-only — skipping injection');
    process.exit(0);
  }

  const days = staleness(found.teamStatePath);
  const stalenessNote =
    days !== null && days > 7
      ? `\n⚠️  TEAM-STATE.md last updated ${days} days ago — consider running /pulse to refresh.`
      : '';

  const relPath = path.relative(found.root, found.teamStatePath);

  // Inject into Claude's context via stdout
  console.log(
    `\n📊 PM Context — auto-loaded from ${relPath}\n` +
    `${'─'.repeat(60)}\n` +
    `${content.trim()}\n` +
    `${'─'.repeat(60)}` +
    `${stalenessNote}\n`
  );

  // Stderr metadata — not visible to Claude, useful for debugging
  console.error(`[session-start-pm] Loaded TEAM-STATE.md (${meaningful.length} lines, ${days}d old)`);

  process.exit(0);
}

try {
  main();
} catch (err) {
  console.error(`[session-start-pm] Error: ${err.message}`);
  process.exit(0); // Never block
}
