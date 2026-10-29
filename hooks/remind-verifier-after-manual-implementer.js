#!/usr/bin/env node
/**
 * remind-verifier-after-manual-implementer.js — PostToolUse hook (matcher: Agent)
 *
 * Why it exists: the engine's verifier (`code-quality-verifier`, then the final gate) runs only inside
 * `/orchestrate`. A hand-spawned `*-implementer` finishes and nothing reviews its output — juz-ide-api-1,
 * TS-SEC-D0-BETA-HARDENING-001 (audit 2026-10-21), where a production fix went through `test-implementer` unreviewed.
 * TASK-AGENT-MANUAL-SPAWN-RULES-001, item 3.
 *
 * Why PostToolUse on the `Agent` tool and not SubagentStop: SubagentStop has no documented path to the PARENT
 * session (its decision control talks to the subagent). The docs name this hook for it: "To inject context into
 * the parent session after a subagent returns, use a PostToolUse hook on the Agent tool". The reminder lands in the
 * main session's context, next to the subagent's result — where the decision to report "done" is made.
 *
 * What it does: when an `Agent` call for a `*-implementer` completes in an engine project (has runtime.yml), it adds
 * a reminder as `additionalContext` to run the verifier on the changed files before reporting the work done.
 * Foreground results only (`tool_response.status` "async_launched" has no result yet). It does not block and does not
 * check whether the verifier is run afterwards — a reminder, not a gate.
 *
 * Unverified: whether an Agent call made INSIDE a Workflow script fires this hook for the main session (docs silent).
 * If it does, an engine-run implementer gets a redundant reminder; the cost is one short paragraph.
 *
 * Never blocks: every failure path exits 0 with no output. Env: MANUAL_SPAWN_REMINDER=off disables.
 */
const fs = require('fs');
const { findRuntime, loadRuntime } = require('./lib/engine-project');

const AGENT_RE = /(^|[:/])[\w-]*-implementer$/i;

function main() {
  if (process.env.MANUAL_SPAWN_REMINDER === 'off') return;
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { return; }
  let payload;
  try { payload = JSON.parse(raw); } catch { return; }

  if (!['Agent', 'Task'].includes(payload.tool_name)) return;
  const agentType = payload.tool_input?.subagent_type || '';
  if (!AGENT_RE.test(String(agentType))) return;
  if (payload.tool_response?.status === 'async_launched') return;

  const found = findRuntime(payload.cwd || process.cwd());
  if (!found) return;
  const verifier = loadRuntime(found.file)?.orchestrate?.inner_loop?.verify || 'code-quality-verifier';

  const additionalContext =
    `[Hook] Manually spawned ${agentType} has finished. Nothing has reviewed its output: the engine's verifier ` +
    `runs only inside /orchestrate. Before you report this work as done, run \`${verifier}\` on the files it changed ` +
    `(and require per-file rule IDs from it), or hand the task to /orchestrate. A production change an agent made outside its ` +
    `layer is a finding, not a fix.`;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } }));
}

try { main(); } catch { /* a hook never breaks the session */ }
process.exit(0);
