// Custom promptfoo provider (TASK-GUARDRAILS-001 Sekcja 4, spike): shells out to a real,
// headless Claude Code subagent via `claude -p --agent <name>` and returns its final
// StructuredOutput/verdict text as the provider's `output`. Question the spike answers:
// can promptfoo drive an agentic, multi-tool-call Claude Code subagent (not a single
// prompt→completion call) and score its FINAL verdict, not each turn.
const { execFileSync } = require('child_process');

const CWD = __dirname + '/fixture'; // has .claude/agents/code-quality-verifier.md locally

// promptfoo's `file://` loader always does `new (await import(path))(options)` — a plain
// object export throws "is not a constructor" (spike finding: custom providers on this
// promptfoo version MUST be a class, contra some older docs/examples showing a bare object).
class ClaudeCodeAgentProvider {
  constructor(options) { this.options = options; }
  id() { return 'claude-code-agent'; }
  async callApi(prompt, context) {
    const agent = (context && context.vars && context.vars.agent) || 'code-quality-verifier';
    const args = [
      '-p', prompt,
      '--agent', agent,
      '--output-format', 'json',
      '--permission-mode', 'bypassPermissions',
      '--allowedTools', 'Read', 'Glob', 'Grep', 'Task',
      '--add-dir', '/opt/projects/claude-patterns',
      '--max-budget-usd', '0.75',
    ];
    let raw;
    try {
      raw = execFileSync('claude', args, {
        cwd: CWD, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 180000,
      });
    } catch (e) {
      return { error: `claude CLI failed (exit ${e.status}): ${(e.stderr || e.message || '').slice(0, 2000)}` };
    }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return { error: `nie-JSON output z --output-format json: ${raw.slice(0, 500)}` }; }

    if (parsed.is_error) return { error: `agent zakończył z błędem: ${parsed.result || JSON.stringify(parsed).slice(0, 500)}` };

    return {
      output: parsed.result ?? '',
      cost: parsed.total_cost_usd,
      metadata: { num_turns: parsed.num_turns, duration_ms: parsed.duration_ms },
    };
  }
}

module.exports = ClaudeCodeAgentProvider;
