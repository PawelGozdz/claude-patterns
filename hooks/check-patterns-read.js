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

const MODE = process.env.CHECK_PATTERNS_MODE || 'block';
const LOOKBACK = parseInt(process.env.CHECK_PATTERNS_LOOKBACK || '15', 10);
const REQUIRED_HITS = parseInt(process.env.CHECK_PATTERNS_REQUIRED_HITS || '1', 10);

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

const ENFORCED_EXTENSIONS = ['.ts', '.tsx', '.dart', '.py', '.svelte'];

/**
 * Path-fragment → pattern mapping. First match wins.
 * Each entry: { match: string|RegExp, pattern: string (relative to .claude/knowledge/patterns/) }
 *
 * Order matters: more specific paths must come BEFORE more generic ones.
 */
const PATH_RULES = [
  // Domain layer
  { match: '/domain/aggregates/',         pattern: 'domain/aggregate-pattern.md' },
  { match: '/domain/value-objects/',      pattern: 'domain/value-object-pattern.md' },
  { match: '/domain/entities/',           pattern: 'domain/entity-pattern.md' },
  { match: '/domain/events/',             pattern: 'domain/domain-event-pattern.md' },
  { match: '/domain/services/',           pattern: 'domain/domain-service-pattern.md' },
  { match: '/domain/specifications/',     pattern: 'domain/specification-policy-pattern.md' },
  { match: '/domain/policies/',           pattern: 'domain/specification-policy-pattern.md' },
  { match: '/domain/repositories/',       pattern: 'infrastructure/repository-pattern.md' },

  // Application layer
  { match: '/application/commands/',      pattern: 'application/command-handler-pattern.md' },
  { match: '/application/queries/',       pattern: 'application/query-handler-pattern.md' },
  { match: '/application/event-handlers/',pattern: 'application/audit-handler-pattern.md' },
  { match: '/application/services/',      pattern: 'application/application-service-pattern.md' },

  // Infrastructure layer
  { match: '/infrastructure/persistence/',          pattern: 'infrastructure/repository-pattern.md' },
  { match: '/infrastructure/repositories/mappers/', pattern: 'infrastructure/mapper-pattern.md' },
  { match: '/infrastructure/acl/',                  pattern: 'architecture/acl-registry-pattern.md' },
  { match: '/infrastructure/controllers/',          pattern: 'infrastructure/controller-schema-pattern.md' },
];

/**
 * Filename-suffix → pattern mapping (fallback when path didn't match).
 */
const FILENAME_RULES = [
  { match: /\.aggregate\.ts$/,       pattern: 'domain/aggregate-pattern.md' },
  { match: /\.vo\.ts$/,              pattern: 'domain/value-object-pattern.md' },
  { match: /\.entity\.ts$/,          pattern: 'domain/entity-pattern.md' },
  { match: /\.event\.ts$/,           pattern: 'domain/domain-event-pattern.md' },
  { match: /\.specification\.ts$/,   pattern: 'domain/specification-policy-pattern.md' },
  { match: /\.policy\.ts$/,          pattern: 'domain/specification-policy-pattern.md' },
  { match: /\.repository\.ts$/,      pattern: 'infrastructure/repository-pattern.md' },
  { match: /\.controller\.ts$/,      pattern: 'infrastructure/controller-schema-pattern.md' },
  { match: /\.handler\.ts$/,         pattern: 'application/command-handler-pattern.md' },
  { match: /\.mapper\.ts$/,          pattern: 'infrastructure/mapper-pattern.md' },
  { match: /\.adapter\.ts$/,         pattern: 'architecture/acl-registry-pattern.md' },
];

function readStdinSync() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function isExempt(filePath) {
  if (!filePath) return true;
  for (const frag of EXEMPT_PATH_FRAGMENTS) {
    if (filePath.includes(frag)) return true;
  }
  const ext = path.extname(filePath).toLowerCase();
  if (EXEMPT_EXTENSIONS.includes(ext)) return true;
  if (!ENFORCED_EXTENSIONS.includes(ext)) return true;
  return false;
}

/**
 * Returns the required pattern path (relative, e.g. 'domain/aggregate-pattern.md')
 * for the given source file, or null if no rule applies (= allow without check).
 */
function findRequiredPattern(filePath) {
  for (const rule of PATH_RULES) {
    if (typeof rule.match === 'string') {
      if (filePath.includes(rule.match)) return rule.pattern;
    } else if (rule.match instanceof RegExp) {
      if (rule.match.test(filePath)) return rule.pattern;
    }
  }
  for (const rule of FILENAME_RULES) {
    if (rule.match.test(filePath)) return rule.pattern;
  }
  return null;
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
  const recent = lines.slice(-Math.max(lookback * 4, 200));
  let hits = 0;

  for (const line of recent) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    const toolUses = extractToolUses(entry);
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

  const filePath = payload.tool_input?.file_path || payload.tool_input?.path;
  if (isExempt(filePath)) process.exit(0);

  const requiredPattern = findRequiredPattern(filePath);
  if (!requiredPattern) {
    // No rule matched — utility/config/module file. Allow (verifier will catch drift).
    process.exit(0);
  }

  const transcriptPath = payload.transcript_path;
  if (!transcriptPath) process.exit(0); // sub-agent context, can't verify, allow

  // Sub-agent bypass sentinel
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
