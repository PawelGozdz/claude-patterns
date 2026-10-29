#!/usr/bin/env node
/**
 * inject-implementer-rule-cards.js — SubagentStart hook (rule cards for hand-spawned implementers)
 *
 * Why it exists: rule cards (`*-pattern_summary.md`) reach an implementer's prompt only through
 * `orchestrate-prepare`. An implementer spawned by hand (`Agent(subagent_type: "test-implementer")`,
 * `*-implementer`) gets "read the rules" instead of the rules, and the hooks that watch it either check that
 * a pattern was READ (check-subagent-pattern-reads) or only warn. juz-ide-api-1, TS-SEC-D0-BETA-HARDENING-001
 * (audit 2026-10-21). TASK-AGENT-MANUAL-SPAWN-RULES-001, item 1.
 *
 * What it does, when a subagent whose type ends in `-implementer` starts:
 *   1. Find the project's `.claude/config/runtime.yml` upward from `cwd` (no file = not an engine project = pass).
 *   2. Pick the patterns the engine itself would inject for that agent: `patterns.always` plus the `patterns:`
 *      of every `orchestrate.layers[]` entry whose `agent` is this agent type.
 *   3. Resolve each to its rule card and return the card text as `additionalContext` — the docs deliver it to the
 *      SUBAGENT, before its first prompt. A pattern with no card is listed by path only (a full pattern is
 *      20-36 KB re-billed every turn; the agent reads it itself).
 *
 * Limits, on purpose:
 *   • The SubagentStart payload carries `agent_id`, `agent_type`, `cwd` — no prompt, no file list. Cards are chosen
 *     by agent type and layer, not by the files the agent ends up editing. The edit-time check stays with
 *     check-subagent-pattern-reads (SubagentStop).
 *   • SubagentStart cannot block and cannot rewrite the prompt. This hook only adds context.
 *   • An engine-spawned implementer gets the cards twice (here and in its prompt). The cap below bounds the cost.
 *
 * Never blocks: every failure path exits 0 with no output.
 * Env: MANUAL_SPAWN_RULES=off disables. MANUAL_SPAWN_RULES_MAX_BYTES caps the injected text (default 60000).
 */
const fs = require('fs');
const path = require('path');
const { REPO_ROOT, findRuntime, loadRuntime, bare } = require('./lib/engine-project');

const AGENT_RE = /(^|[:/])[\w-]*-implementer$/i;
const MAX_BYTES = Number(process.env.MANUAL_SPAWN_RULES_MAX_BYTES) || 60000;

function readStdinSync() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function patternsFor(runtime, agentType) {
  const out = [];
  const add = (list) => { for (const p of Array.isArray(list) ? list : []) if (typeof p === 'string' && !out.includes(p)) out.push(p); };
  add(runtime?.patterns?.always);
  const layers = runtime?.orchestrate?.layers;
  for (const layer of Array.isArray(layers) ? layers : []) {
    if (bare(layer?.agent) === bare(agentType)) add(layer.patterns);
  }
  return out;
}

// Same lookup order as orchestrate-prepare: the project's knowledge dir (symlinks + patterns-local), then claude-patterns.
function resolveFile(rel, root) {
  if (rel.startsWith('/')) return fs.existsSync(rel) ? rel : null;
  const bases = rel.startsWith('.') ? [root] : [path.join(root, '.claude', 'knowledge', 'patterns'), path.join(REPO_ROOT, 'patterns')];
  for (const b of bases) {
    const p = path.join(b, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function buildContext(root, patterns) {
  const parts = [];
  const noCard = [];
  const dropped = [];
  let bytes = 0;
  for (const rel of patterns) {
    const cardAbs = resolveFile(rel.replace(/\.md$/, '_summary.md'), root);
    if (!cardAbs) { noCard.push(rel); continue; }
    let text;
    try { text = fs.readFileSync(cardAbs, 'utf8'); } catch { continue; }
    if (bytes + text.length > MAX_BYTES) { dropped.push(rel); continue; }
    bytes += text.length;
    parts.push(`### ${rel}\n\n${text.trim()}`);
  }
  if (!parts.length && !noCard.length && !dropped.length) return null;
  const head =
    'RULE CARDS for this project — the MUST / MUST NOT rules your files are checked against. ' +
    'Cite rule IDs per file in your final answer (e.g. `user.aggregate.ts → A1,A3`); the verifier VETOes by ID.';
  const tail = [];
  if (noCard.length) tail.push('Patterns without a rule card — Read them under `.claude/knowledge/patterns/` before editing matching files:\n' + noCard.map((p) => `- ${p}`).join('\n'));
  if (dropped.length) tail.push('Cards cut by the size cap — Read them yourself:\n' + dropped.map((p) => `- ${p}`).join('\n'));
  return [head, ...parts, ...tail].join('\n\n');
}

function main() {
  if (process.env.MANUAL_SPAWN_RULES === 'off') return;
  const raw = readStdinSync();
  if (!raw) return;
  let payload;
  try { payload = JSON.parse(raw); } catch { return; }

  const agentType = payload.agent_type || payload.subagent_type || '';
  if (!AGENT_RE.test(String(agentType))) return;

  const found = findRuntime(payload.cwd || process.cwd());
  if (!found) return;
  const runtime = loadRuntime(found.file);
  if (!runtime) return;

  const patterns = patternsFor(runtime, agentType);
  if (!patterns.length) return;
  const additionalContext = buildContext(found.root, patterns);
  if (!additionalContext) return;

  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext } }));
}

try { main(); } catch { /* a hook never breaks the spawn */ }
process.exit(0);
