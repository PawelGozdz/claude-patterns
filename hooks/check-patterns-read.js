#!/usr/bin/env node
/**
 * check-patterns-read.js — PreToolUse hook
 *
 * Blocks Write/Edit/MultiEdit on source files (.ts/.tsx/.dart/.py)
 * if the agent has NOT read any file under .claude/knowledge/patterns/
 * in the last N tool calls of the current session.
 *
 * Strategy: read transcript_path from stdin payload, walk recent entries,
 * count Read calls whose file_path matches `.claude/knowledge/patterns/`.
 *
 * Modes (set via env CHECK_PATTERNS_MODE):
 *   warn  (default) — print warning to stderr, allow tool call (exit 0)
 *   block           — block tool call (exit 2 — Claude Code surfaces stderr to user)
 *
 * Bypass: if file path matches one of EXEMPT_PATHS (test files, configs,
 * markdown docs), skip the check entirely.
 *
 * Configuration:
 *   CHECK_PATTERNS_MODE=warn|block      (default: warn)
 *   CHECK_PATTERNS_LOOKBACK=30          (tool calls to check, default: 30)
 *   CHECK_PATTERNS_REQUIRED_HITS=1      (min pattern reads required, default: 1)
 */

const fs = require('fs');
const path = require('path');

const MODE = process.env.CHECK_PATTERNS_MODE || 'warn';
const LOOKBACK = parseInt(process.env.CHECK_PATTERNS_LOOKBACK || '30', 10);
const REQUIRED_HITS = parseInt(process.env.CHECK_PATTERNS_REQUIRED_HITS || '1', 10);

// Files we don't enforce on
const EXEMPT_EXTENSIONS = ['.md', '.yaml', '.yml', '.json', '.lock', '.txt', '.gitignore'];
const EXEMPT_PATH_FRAGMENTS = [
  '__tests__/',
  '/test/',
  '/tests/',
  '.spec.',
  '.test.',
  'CHANGELOG',
  'README',
  '.claude/',
  'project-orchestration/',
  'node_modules/',
];

// Source extensions we DO enforce on
const ENFORCED_EXTENSIONS = ['.ts', '.tsx', '.dart', '.py', '.svelte'];

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function isEnforced(filePath) {
  if (!filePath) return false;
  for (const frag of EXEMPT_PATH_FRAGMENTS) {
    if (filePath.includes(frag)) return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (EXEMPT_EXTENSIONS.includes(ext)) return false;
  return ENFORCED_EXTENSIONS.includes(ext);
}

function countPatternReads(transcriptPath, lookback) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return 0;

  let lines;
  try {
    lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
  } catch {
    return 0;
  }

  // Walk last N lines, count Read tool calls targeting patterns/
  const recent = lines.slice(-Math.max(lookback * 4, 200)); // each tool call = ~4 lines
  let hits = 0;

  for (const line of recent) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    // Look for tool_use with name=Read and input.file_path matching patterns/
    const toolUses = extractToolUses(entry);
    for (const tu of toolUses) {
      if (tu.name === 'Read' && tu.input && typeof tu.input.file_path === 'string') {
        if (tu.input.file_path.includes('.claude/knowledge/patterns/') ||
            tu.input.file_path.includes('claude-patterns/patterns/')) {
          hits += 1;
        }
      }
    }
  }

  return hits;
}

function extractToolUses(entry) {
  const out = [];
  // Anthropic transcripts shape: { type: 'assistant', message: { content: [{type:'tool_use',...}] } }
  // Or direct: { type: 'tool_use', name, input }
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
  if (!raw) {
    process.exit(0);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0); // can't parse → don't block
  }

  // Pass through stdin so the hook chain isn't broken
  process.stdout.write(raw);

  const toolName = payload.tool_name || '';
  if (!['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
    process.exit(0);
  }

  const filePath = payload.tool_input?.file_path || payload.tool_input?.path;
  if (!isEnforced(filePath)) {
    process.exit(0);
  }

  const transcriptPath = payload.transcript_path;
  const hits = countPatternReads(transcriptPath, LOOKBACK);

  if (hits >= REQUIRED_HITS) {
    process.exit(0); // Pattern was read, allow
  }

  // No pattern read — warn or block
  const msg =
    `\n⚠️  PATTERN-CHECK: About to ${toolName} ${filePath}\n` +
    `    No Read on .claude/knowledge/patterns/* in last ${LOOKBACK} tool calls.\n` +
    `    Source files under src/ MUST be grounded in canonical patterns.\n` +
    `    Read the relevant pattern(s) first:\n` +
    `      Read(".claude/knowledge/patterns/<layer>/<name>-pattern.md")\n` +
    `    Layers: domain, application, infrastructure, architecture, testing, cross-layer\n` +
    `    Mode: ${MODE.toUpperCase()} (set CHECK_PATTERNS_MODE=block to enforce hard gate)\n`;

  process.stderr.write(msg);

  if (MODE === 'block') {
    process.exit(2); // Claude Code surfaces stderr + blocks the tool call
  } else {
    process.exit(0); // warn-only: surface stderr, allow call
  }
}

main();
