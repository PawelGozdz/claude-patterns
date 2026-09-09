#!/usr/bin/env node
/**
 * check-delegation.js — PreToolUse hook (force delegation of real implementation)
 *
 * Problem this solves: the MAIN agent keeps implementing pattern files itself
 * instead of delegating to a subagent (/orchestrate or a stack implementer).
 * Instructions in CLAUDE.md are opt-in — only the harness enforces. This hook
 * is that enforcement.
 *
 * Rule (normal mode):
 *   Block Write/Edit/MultiEdit when ALL of:
 *     1. the call comes from the MAIN agent (NOT a subagent), AND
 *     2. the target is a "pattern file" — governed by lib/pattern-routing.js
 *        (aggregates, handlers, repositories, controllers, … — real architecture)
 *
 * Rule (STRICT mode — an orchestration run is active):
 *   Same as above, but the threshold drops to "any enforced source file"
 *   (.ts/.tsx/.dart/.py/.svelte outside the exempt paths) — a governing pattern
 *   is no longer required. During /orchestrate the main agent is a coordinator:
 *   it must not write a single line of production code, including utility files
 *   that pattern-routing does not map. Coordination artifacts (.md/.yml/.json,
 *   .claude/**, project-orchestration/**) stay editable — they are exempt.
 *
 *   STRICT is switched on by <cwd>/.claude/run-state/orchestrating.json, written
 *   by /orchestrate at gate 0 and removed at exit. It replaces the old
 *   `disallowedTools: Edit` on that command, which blocked the wrong thing: it
 *   stopped the coordinator from maintaining its own analysis artifact while
 *   leaving Write (full-file overwrite) open, so the "no implementation" promise
 *   was never actually enforced.
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
const { isSubagent } = require('./lib/utils');

const MODE = process.env.DELEGATION_MODE || 'block';

// An orchestration run legitimately spans hours (layer loop + fix loop + final
// gate). The TTL is only a backstop for a marker /orchestrate failed to clean up
// — a crashed run must not silently strip the main agent of Edit for days.
const ORCH_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Reads <cwd>/.claude/run-state/orchestrating.json. Returns the marker when an
 * orchestration run owned by THIS session is active, otherwise null.
 *
 * The session_id check matters for repos where several instances run in
 * parallel (ADR 0006): another session's /orchestrate must not gate this one.
 */
function readOrchestrationMarker(payload) {
  const cwd = payload.cwd || process.cwd();
  const markerPath = path.join(cwd, '.claude', 'run-state', 'orchestrating.json');
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch {
    return null;
  }
  if (!marker || typeof marker !== 'object' || !marker.ts) return null;

  const age = Date.now() - Date.parse(marker.ts);
  if (!Number.isFinite(age) || age < 0 || age >= ORCH_TTL_MS) return null;

  if (marker.session_id && payload.session_id && marker.session_id !== payload.session_id) {
    return null;
  }
  return { ...marker, markerPath };
}

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
  if (isSubagent(payload)) process.exit(0);

  const filePath = payload.tool_input?.file_path || payload.tool_input?.path;
  if (isExempt(filePath)) process.exit(0);

  // Threshold = "pattern files only". No governing pattern ⇒ utility/config/
  // module file — let the main agent edit it directly.
  //
  // …UNLESS an orchestration run is active. Then the coordinator writes no
  // production code at all, mapped or not.
  const requiredPattern = findRequiredPattern(filePath);
  const orchestration = readOrchestrationMarker(payload);
  if (!requiredPattern && !orchestration) process.exit(0);

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

  const why = requiredPattern
    ? `    This is a ${requiredPattern.split('/')[0]}-layer pattern file (governed by ${requiredPattern}).\n`
    : `    An orchestration run is active (${orchestration.task_id || 'no task id'}) — during /orchestrate\n` +
      `    the coordinator writes NO production code, mapped to a pattern or not.\n`;

  const action = orchestration
    ? `    Action: this file belongs to a LAYER of the run — hand it to that layer's implementer\n` +
      `    (Workflow/agent() slot from runtime.yml), then let verify judge it. Coordination\n` +
      `    artifacts stay open to you: .analysis.md, task files, runtime.yml, workflow scripts.\n\n` +
      `    Run genuinely finished or aborted? Remove ${orchestration.markerPath}.\n`
    : `    Action: delegate the implementation to a subagent —\n` +
      `      • /orchestrate <task>     (recommended — detects stack, reads patterns, runs implementer + verifier)\n` +
      `      • Agent(...) / Task(...)  (direct: e.g. the stack implementer for this layer)\n`;

  const msg =
    `\n${verb}: DELEGATION-CHECK on ${toolName} ${filePath}\n` +
    `    The MAIN agent must NOT implement production code directly.\n` +
    why + `\n` +
    action + `\n` +
    `    The subagent's edits are NOT blocked — only the main agent's are.\n` +
    `    Genuinely a one-line fix? touch "$(dirname "${transcriptPath || '<session>'}")/.delegation-ok-sentinel" (5 min),\n` +
    `    or set DELEGATION_MODE=warn.\n\n` +
    `    Mode: ${MODE.toUpperCase()}${orchestration ? ' + STRICT (orchestration active)' : ''}` +
    (isBlock
      ? ` (hard gate — set DELEGATION_MODE=warn to soft-warn, =off to disable)\n`
      : ` (soft warning — set DELEGATION_MODE=block to enforce)\n`);

  process.stderr.write(msg);
  process.exit(isBlock ? 2 : 0);
}

main();
