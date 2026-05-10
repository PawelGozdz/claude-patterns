#!/usr/bin/env node
/**
 * SubagentStop Hook — Append per-agent token usage to cost log
 *
 * Cross-platform (Windows, macOS, Linux).
 *
 * Fires after a subagent (Task tool) completes. Reads the tool result
 * payload from stdin and appends a JSON line to ~/.claude/logs/agent-usage.jsonl
 * with: timestamp, agent name, model, input_tokens, output_tokens,
 * cache hits, estimated cost, duration, project (if known).
 *
 * Used by /cost-report skill to produce accurate per-agent cost
 * breakdown instead of global session estimates.
 *
 * Silent on parse errors. Never blocks (exit 0 always).
 * Disable via env var: AGENT_USAGE_LOG=off
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_STDIN = 256 * 1024;

if (process.env.AGENT_USAGE_LOG === 'off') {
  process.exit(0);
}

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
});

// Pricing as of 2026-05 (USD per million tokens). Update as needed.
const PRICING = {
  opus: { in: 15.0, out: 75.0, cache_write: 18.75, cache_read: 1.5 },
  sonnet: { in: 3.0, out: 15.0, cache_write: 3.75, cache_read: 0.3 },
  haiku: { in: 0.25, out: 1.25, cache_write: 0.3, cache_read: 0.03 },
};

function pricingForModel(modelStr) {
  if (!modelStr) return null;
  const lower = String(modelStr).toLowerCase();
  if (lower.includes('opus')) return PRICING.opus;
  if (lower.includes('sonnet')) return PRICING.sonnet;
  if (lower.includes('haiku')) return PRICING.haiku;
  return null;
}

function estimateCost(usage, modelStr) {
  const p = pricingForModel(modelStr);
  if (!p || !usage) return null;
  const inT = usage.input_tokens || 0;
  const outT = usage.output_tokens || 0;
  const cacheW = usage.cache_creation_input_tokens || 0;
  const cacheR = usage.cache_read_input_tokens || 0;
  const cost =
    (inT / 1_000_000) * p.in +
    (outT / 1_000_000) * p.out +
    (cacheW / 1_000_000) * p.cache_write +
    (cacheR / 1_000_000) * p.cache_read;
  return Number(cost.toFixed(6));
}

function detectProject(cwd) {
  // Walk up to find .git or project-orchestration/
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

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data || '{}');

    // Subagent stop payload shape varies — try multiple paths
    const agentName =
      input.subagent_type ||
      input.agent_name ||
      input.tool_input?.subagent_type ||
      'unknown';
    const usage =
      input.usage ||
      input.tool_output?.usage ||
      input.result?.usage ||
      {};
    const model =
      input.model ||
      input.tool_output?.model ||
      input.result?.model ||
      null;
    const durationMs =
      input.duration_ms ||
      input.tool_output?.duration_ms ||
      null;

    const cost = estimateCost(usage, model);
    const project = detectProject(process.cwd());

    const entry = {
      ts: new Date().toISOString(),
      agent: agentName,
      model,
      input_tokens: usage.input_tokens || 0,
      output_tokens: usage.output_tokens || 0,
      cache_creation_tokens: usage.cache_creation_input_tokens || 0,
      cache_read_tokens: usage.cache_read_input_tokens || 0,
      cost_usd: cost,
      duration_ms: durationMs,
      project,
    };

    const logsDir = path.join(os.homedir(), '.claude', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logFile = path.join(logsDir, 'agent-usage.jsonl');
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch (err) {
    // Silent — usage logging must never disturb the workflow
  }
  process.exit(0);
});
