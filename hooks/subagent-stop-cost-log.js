#!/usr/bin/env node
/**
 * SubagentStop Hook — Append per-agent token usage to cost log
 *
 * Fires after a subagent (Task tool) completes. Reads the tool result
 * payload from stdin and appends a JSON line to ~/.claude/logs/agent-usage.jsonl
 *
 * Usage strategy: Claude Code's SubagentStop payload structure is undocumented
 * and has changed over time. This hook tries multiple known paths first, then
 * falls back to a recursive deep-search through the entire payload for any
 * object containing `input_tokens` and `output_tokens`.
 *
 * Debug: set AGENT_USAGE_DEBUG=1 to write raw payload to agent-usage-debug.jsonl
 * (auto-enables for the first 5 entries that have no usage data found).
 *
 * Disable: AGENT_USAGE_LOG=off
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_STDIN = 512 * 1024;
const DEBUG = process.env.AGENT_USAGE_DEBUG === '1';

if (process.env.AGENT_USAGE_LOG === 'off') {
  process.exit(0);
}

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
});

// Pricing as of 2026-06 (USD per million tokens).
const PRICING = {
  opus:   { in: 15.0,  out: 75.0,  cache_write: 18.75, cache_read: 1.5  },
  sonnet: { in: 3.0,   out: 15.0,  cache_write: 3.75,  cache_read: 0.3  },
  haiku:  { in: 0.25,  out: 1.25,  cache_write: 0.3,   cache_read: 0.03 },
};

function pricingForModel(modelStr) {
  if (!modelStr) return null;
  const lower = String(modelStr).toLowerCase();
  if (lower.includes('opus'))   return PRICING.opus;
  if (lower.includes('sonnet')) return PRICING.sonnet;
  if (lower.includes('haiku'))  return PRICING.haiku;
  return null;
}

function estimateCost(usage, modelStr) {
  const p = pricingForModel(modelStr);
  if (!p || !usage) return null;
  const inT    = usage.input_tokens || 0;
  const outT   = usage.output_tokens || 0;
  const cacheW = usage.cache_creation_input_tokens || 0;
  const cacheR = usage.cache_read_input_tokens || 0;
  if (inT === 0 && outT === 0) return null;
  return Number((
    (inT    / 1_000_000) * p.in +
    (outT   / 1_000_000) * p.out +
    (cacheW / 1_000_000) * p.cache_write +
    (cacheR / 1_000_000) * p.cache_read
  ).toFixed(6));
}

/**
 * Recursively find the first object in `obj` that has both
 * `input_tokens` and `output_tokens` as numeric fields.
 */
function findUsageDeep(obj, depth = 0) {
  if (depth > 8 || obj === null || typeof obj !== 'object') return null;
  if (typeof obj.input_tokens === 'number' && typeof obj.output_tokens === 'number') {
    return obj;
  }
  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        const found = findUsageDeep(item, depth + 1);
        if (found) return found;
      }
    } else if (val && typeof val === 'object') {
      const found = findUsageDeep(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Recursively find a model string anywhere in the payload.
 * Returns the first string value matching a known model pattern.
 */
function findModelDeep(obj, depth = 0) {
  if (depth > 8 || obj === null || typeof obj !== 'object') return null;
  for (const [key, val] of Object.entries(obj)) {
    if (key === 'model' && typeof val === 'string' && val.length > 0) return val;
  }
  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        const found = findModelDeep(item, depth + 1);
        if (found) return found;
      }
    } else if (val && typeof val === 'object') {
      const found = findModelDeep(val, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function detectProject(cwd) {
  let dir = cwd;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, '.git')) ||
        fs.existsSync(path.join(dir, 'project-orchestration'))) {
      return path.basename(dir);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function detectBranch(cwd) {
  try {
    const { execSync } = require('child_process');
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000,
    }).toString().trim() || null;
  } catch { return null; }
}

function logsDir() {
  const d = path.join(os.homedir(), '.claude', 'logs');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  return d;
}

function shouldWriteDebug(dir) {
  if (DEBUG) return true;
  // Auto-debug: if the debug file has fewer than 5 real-payload entries, keep dumping
  const dbgFile = path.join(dir, 'agent-usage-debug.jsonl');
  if (!fs.existsSync(dbgFile)) return true;
  try {
    const lines = fs.readFileSync(dbgFile, 'utf8').split('\n').filter(Boolean);
    return lines.length < 5;
  } catch { return true; }
}

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data || '{}');

    // --- Agent name: try documented paths first, then deep search ---
    const agentName =
      input.subagent_type ||
      input.agent_name ||
      input.tool_input?.subagent_type ||
      input.tool_input?.description?.split(' ')[0] ||
      'unknown';

    // --- Usage: try known paths, then deep recursive search ---
    const usage =
      (input.usage && input.usage.input_tokens != null ? input.usage : null) ||
      (input.tool_output?.usage?.input_tokens != null ? input.tool_output.usage : null) ||
      (input.result?.usage?.input_tokens != null ? input.result.usage : null) ||
      (input.tool_response?.usage?.input_tokens != null ? input.tool_response.usage : null) ||
      findUsageDeep(input) ||
      null;

    // --- Model: try known paths, then deep recursive search ---
    const model =
      input.model ||
      input.tool_output?.model ||
      input.result?.model ||
      input.tool_response?.model ||
      findModelDeep(input) ||
      null;

    const durationMs =
      input.duration_ms ||
      input.tool_output?.duration_ms ||
      input.tool_response?.duration_ms ||
      null;

    const cost = estimateCost(usage, model);
    const cwd = process.cwd();
    const project = detectProject(cwd);
    const branch = detectBranch(cwd);

    const entry = {
      ts: new Date().toISOString(),
      agent: agentName,
      model,
      input_tokens:          usage?.input_tokens || 0,
      output_tokens:         usage?.output_tokens || 0,
      cache_creation_tokens: usage?.cache_creation_input_tokens || 0,
      cache_read_tokens:     usage?.cache_read_input_tokens || 0,
      cost_usd: cost,
      duration_ms: durationMs,
      project,
      branch,
    };

    const dir = logsDir();
    fs.appendFileSync(path.join(dir, 'agent-usage.jsonl'), JSON.stringify(entry) + '\n');

    // Write debug dump when usage not found (to diagnose payload structure)
    if (!usage || entry.input_tokens === 0) {
      if (shouldWriteDebug(dir)) {
        const keys = Object.keys(input);
        const debugEntry = {
          ts: entry.ts,
          top_level_keys: keys,
          // Dump full payload (truncated to 8KB) for inspection
          raw: JSON.stringify(input).substring(0, 8192),
        };
        fs.appendFileSync(
          path.join(dir, 'agent-usage-debug.jsonl'),
          JSON.stringify(debugEntry) + '\n'
        );
      }
    }
  } catch (err) {
    // Silent — usage logging must never disturb the workflow
  }
  process.exit(0);
});
