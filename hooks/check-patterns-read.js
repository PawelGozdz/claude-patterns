#!/usr/bin/env node
/**
 * check-patterns-read.js — PreToolUse hook (smart pattern routing, v2)
 *
 * Blocks Write/Edit/MultiEdit on a source file ONLY if the agent has not read
 * the SPECIFIC pattern that governs that file type, in the recent transcript.
 *
 * Strategy:
 *   1. Map edited file path → required pattern (e.g. /domain/aggregates/ → aggregate-pattern.md)
 *   2. If a mapping is found: require Read on that exact pattern (or its _summary.md)
 *      in the last N tool calls.
 *   3. If no mapping is found: fall through (allow). Utility/config/module files
 *      do not need pattern grounding — the verifier (Tier 2) catches drift later.
 *
 * Modes (env CHECK_PATTERNS_MODE):
 *   block (default) — exit 2 with actionable message naming the specific pattern
 *   warn            — print warning to stderr, allow (exit 0)
 *
 * Bypass: matches EXEMPT_PATH_FRAGMENTS / EXEMPT_EXTENSIONS skip the check.
 * Sub-agent bypass: .patterns-read-sentinel file (5 min TTL) in session dir.
 *
 * Configuration:
 *   CHECK_PATTERNS_MODE=block|warn      (default: block)
 *   CHECK_PATTERNS_LOOKBACK=15          (tool calls to scan, default: 15)
 *   CHECK_PATTERNS_REQUIRED_HITS=1      (default: 1)
 */

const fs = require('fs');
const path = require('path');
const { isExempt, findRequiredPattern } = require('./lib/pattern-routing');

const MODE = process.env.CHECK_PATTERNS_MODE || 'block';
const LOOKBACK = parseInt(process.env.CHECK_PATTERNS_LOOKBACK || '15', 10);
const REQUIRED_HITS = parseInt(process.env.CHECK_PATTERNS_REQUIRED_HITS || '1', 10);

// Path/filename → pattern routing and exemption logic now live in
// lib/pattern-routing.js (shared with check-delegation.js — single source of
// truth for "which pattern governs this file").

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Returns true if the given pattern (relative path) was Read in the last `lookback`
 * tool calls. Accepts either the canonical file or its _summary.md sibling.
 */
function wasPatternRead(transcriptPath, requiredPattern, lookback) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return 0;

  let lines;
  try {
    lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
  } catch {
    return 0;
  }

  const summaryVariant = requiredPattern.replace(/-pattern\.md$/, '-pattern_summary.md');

  // Scan backwards through lines, counting actual tool-use events.
  // LOOKBACK=15 means "last 15 tool invocations" — not raw lines.
  // This is robust to orchestration spawning multiple subagents, which
  // generates many transcript lines per tool call (thinking blocks, results, etc.).
  let toolUsesSeen = 0;
  let hits = 0;

  for (let i = lines.length - 1; i >= 0 && toolUsesSeen < lookback; i--) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }

    const toolUses = extractToolUses(entry);
    if (toolUses.length === 0) continue;

    toolUsesSeen += toolUses.length;

    for (const tu of toolUses) {
      if (tu.name !== 'Read' || !tu.input || typeof tu.input.file_path !== 'string') continue;
      const fp = tu.input.file_path;
      if (!fp.includes('.claude/knowledge/patterns/') &&
          !fp.includes('claude-patterns/patterns/')) continue;
      if (fp.endsWith('/' + requiredPattern) ||
          fp.endsWith(requiredPattern) ||
          fp.endsWith('/' + summaryVariant) ||
          fp.endsWith(summaryVariant)) {
        hits += 1;
      }
    }
  }

  return hits;
}

function extractToolUses(entry) {
  const out = [];
  if (entry?.type === 'tool_use') {
    out.push(entry);
    return out;
  }
  const content = entry?.message?.content || entry?.content || [];
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block?.type === 'tool_use') out.push(block);
    }
  }
  return out;
}

function main() {
  const raw = readStdinSync();
  if (!raw) process.exit(0);

  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  process.stdout.write(raw);

  const toolName = payload.tool_name || '';
  if (!['Write', 'Edit', 'MultiEdit'].includes(toolName)) process.exit(0);

  // CRITICAL: sub-agent calls ALWAYS pass.
  // A subagent has its OWN transcript (nested subagents/ folder), but PreToolUse
  // hands this hook the PARENT's transcript_path. So a subagent's pattern Reads
  // are invisible here — wasPatternRead() finds 0 hits and blocks forever, even
  // though the subagent just read the pattern. That is the implement-loop bug:
  // the implementer reads value-object-pattern.md, tries to Write, gets blocked,
  // re-reads, retries… and never creates a file.
  // `agent_id` is present ONLY inside a subagent (documented PreToolUse field).
  // Subagent prompts already instruct pattern reads, and the verifier tier
  // catches drift after the fact. This supersedes the legacy worktree heuristic.
  if (payload.agent_id) process.exit(0);

  const filePath = payload.tool_input?.file_path || payload.tool_input?.path;
  if (isExempt(filePath)) process.exit(0);

  const requiredPattern = findRequiredPattern(filePath);
  if (!requiredPattern) {
    // No rule matched — utility/config/module file. Allow (verifier will catch drift).
    process.exit(0);
  }

  const transcriptPath = payload.transcript_path;
  if (!transcriptPath) process.exit(0);

  // Sub-agent worktrees have their own transcript that doesn't inherit parent's reads.
  // Allow through — the verifier tier catches pattern drift after the fact.
  if (transcriptPath.includes('/worktrees/agent-') || transcriptPath.includes('/.worktrees/')) {
    process.exit(0);
  }

  // Sub-agent bypass sentinel (manual: touch .patterns-read-sentinel in session dir)
  const sentinelPath = path.join(path.dirname(transcriptPath), '.patterns-read-sentinel');
  if (fs.existsSync(sentinelPath)) {
    const sentinelAge = Date.now() - fs.statSync(sentinelPath).mtimeMs;
    if (sentinelAge < 300000) process.exit(0);
  }

  const hits = wasPatternRead(transcriptPath, requiredPattern, LOOKBACK);
  if (hits >= REQUIRED_HITS) process.exit(0);

  // Targeted block: name the exact pattern needed.
  const isBlock = MODE !== 'warn';
  const verb = isBlock ? '🛑 BLOCKED' : '⚠️  WARN';
  const summaryHint = requiredPattern.replace(/-pattern\.md$/, '-pattern_summary.md');
  const msg =
    `\n${verb}: PATTERN-CHECK on ${toolName} ${filePath}\n` +
    `    Required pattern not read in last ${LOOKBACK} tool calls:\n` +
    `      .claude/knowledge/patterns/${requiredPattern}\n\n` +
    `    Action: Read the pattern (or its _summary variant), then retry.\n` +
    `      Read(".claude/knowledge/patterns/${requiredPattern}")\n` +
    `      # or, if available:\n` +
    `      Read(".claude/knowledge/patterns/${summaryHint}")\n\n` +
    `    Mode: ${MODE.toUpperCase()}` +
    (isBlock
      ? ` (hard gate — set CHECK_PATTERNS_MODE=warn to soft-warn)\n`
      : ` (soft warning — set CHECK_PATTERNS_MODE=block to enforce)\n`);

  process.stderr.write(msg);
  process.exit(isBlock ? 2 : 0);
}

main();
