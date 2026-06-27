#!/usr/bin/env node
/**
 * check-delegation.js — PreToolUse hook (force delegation of real implementation)
 *
 * Problem this solves: the MAIN agent keeps implementing pattern files itself
 * instead of delegating to a subagent (/orchestrate or a stack implementer).
 * Instructions in CLAUDE.md are opt-in — only the harness enforces. This hook
 * is that enforcement.
 *
 * Rule:
 *   Block Write/Edit/MultiEdit when ALL of:
 *     1. the call comes from the MAIN agent (NOT a subagent), AND
 *     2. the target is a "pattern file" — governed by lib/pattern-routing.js
 *        (aggregates, handlers, repositories, controllers, … — real architecture)
 *
 * Subagents ALWAYS pass through. That is the whole point: the main agent must
 * hand the work to a subagent, and the subagent must be free to write the code.
 *
 * Main-vs-subagent detection (documented, not heuristic):
 *   PreToolUse payload carries `agent_id` ONLY when the call is made inside a
 *   subagent. Absent `agent_id` ⇒ main thread. (Worktree subagents are covered
 *   by the same field; the legacy transcript-path heuristic is not needed.)
 *
 * Escape hatch (intentional small fix the main agent should just do):
 *   - touch `.delegation-ok-sentinel` in the session dir (5 min TTL), OR
 *   - set DELEGATION_MODE=warn  (soft warning, never blocks), OR
 *   - set DELEGATION_MODE=off   (disable entirely)
 *
 * Configuration:
 *   DELEGATION_MODE=block|warn|off   (default: block)
 */

const fs = require('fs');
const path = require('path');
const { isExempt, findRequiredPattern } = require('./lib/pattern-routing');

const MODE = process.env.DELEGATION_MODE || 'block';

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  const raw = readStdinSync();
  if (!raw) process.exit(0);

  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  // Always pass the payload through unchanged.
  process.stdout.write(raw);

  if (MODE === 'off') process.exit(0);

  const toolName = payload.tool_name || '';
  if (!['Write', 'Edit', 'MultiEdit'].includes(toolName)) process.exit(0);

  // KEY GATE: subagent calls always pass. `agent_id` is present only inside a
  // subagent — its absence means this is the main thread.
  if (payload.agent_id) process.exit(0);

  const filePath = payload.tool_input?.file_path || payload.tool_input?.path;
  if (isExempt(filePath)) process.exit(0);

  // Threshold = "pattern files only". No governing pattern ⇒ utility/config/
  // module file — let the main agent edit it directly.
  const requiredPattern = findRequiredPattern(filePath);
  if (!requiredPattern) process.exit(0);

  // Escape hatch: explicit sentinel for a deliberate small fix.
  const transcriptPath = payload.transcript_path;
  if (transcriptPath) {
    const sentinelPath = path.join(path.dirname(transcriptPath), '.delegation-ok-sentinel');
    try {
      if (fs.existsSync(sentinelPath)) {
        const age = Date.now() - fs.statSync(sentinelPath).mtimeMs;
        if (age < 300000) process.exit(0);
      }
    } catch { /* fall through to block/warn */ }
  }

  const isBlock = MODE !== 'warn';
  const verb = isBlock ? '🛑 BLOCKED' : '⚠️  WARN';
  const layer = requiredPattern.split('/')[0];
  const msg =
    `\n${verb}: DELEGATION-CHECK on ${toolName} ${filePath}\n` +
    `    The MAIN agent must NOT implement pattern files directly.\n` +
    `    This is a ${layer}-layer pattern file (governed by ${requiredPattern}).\n\n` +
    `    Action: delegate the implementation to a subagent —\n` +
    `      • /orchestrate <task>     (recommended — detects stack, reads patterns, runs implementer + verifier)\n` +
    `      • Agent(...) / Task(...)  (direct: e.g. the stack implementer for this layer)\n\n` +
    `    The subagent's edits are NOT blocked — only the main agent's are.\n` +
    `    Genuinely a one-line fix? touch "$(dirname "${transcriptPath || '<session>'}")/.delegation-ok-sentinel" (5 min),\n` +
    `    or set DELEGATION_MODE=warn.\n\n` +
    `    Mode: ${MODE.toUpperCase()}` +
    (isBlock
      ? ` (hard gate — set DELEGATION_MODE=warn to soft-warn, =off to disable)\n`
      : ` (soft warning — set DELEGATION_MODE=block to enforce)\n`);

  process.stderr.write(msg);
  process.exit(isBlock ? 2 : 0);
}

main();
