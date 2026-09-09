# Hooks

Hooks are event-driven automations that fire before or after Claude Code tool executions. They enforce code quality, catch mistakes early, and automate repetitive checks.

## How Hooks Work

```
User request → Claude picks a tool → PreToolUse hook runs → Tool executes → PostToolUse hook runs
```

- **PreToolUse** hooks run before the tool executes. They can **block** (exit code 2) or **warn** (stderr without blocking).
- **PostToolUse** hooks run after the tool completes. They can analyze output but cannot block.
- **Stop** hooks run after each Claude response.
- **SessionStart/SessionEnd** hooks run at session lifecycle boundaries.
- **PreCompact** hooks run before context compaction, useful for saving state.

## Hooks in This Plugin

### PreToolUse Hooks

| Hook | Matcher | Behavior | Exit Code |
|------|---------|----------|-----------|
| **Root grep blocker** (`block-root-grep.js`) | `Bash` | Denies `grep -r`/`rg`/`git grep`/`find … \| xargs grep` over the repo root (`.`, `*`, repo dir). A `Read(.env)` deny rule turns such a walk into a permission prompt that stalls the flow; scoped searches (`src/ docs/`) and the Grep tool pass. In global `hooks.json` since 2026-09-07 (K53). | 2 (blocks) |
| **Workflow lint** (`pre-workflow-lint.js`) | `Workflow` | Lints a Workflow script before it runs. `WORKFLOW_LINT=warn\|off`. | 2 (blocks) |
| **Approval gate** (`check-approval-before-impl.js`) _(per-stack)_ | `Write\|Edit\|MultiEdit` | Backstop for the research→implementation hard gate (ADR 0002): warns (or blocks) when source code is edited while an `*.analysis.md` is still unapproved. Subagents pass through. `APPROVAL_GATE_MODE=warn\|block\|off`. | 0/2 |
| **Delegation gate** (`check-delegation.js`) _(per-stack)_ | `Write\|Edit\|MultiEdit` | Blocks the **main agent** from implementing production code directly — forces delegation to a subagent / `/orchestrate`. Subagents pass through (detected via `agent_id`). Threshold: pattern files (`lib/pattern-routing.js`), widened to **any enforced source file** while an orchestration run is active (STRICT, below). Wired in via `templates/settings/<stack>.json`, not global `hooks.json`. `DELEGATION_MODE=warn\|off`. | 2 (blocks) |

> **Session lifecycle, formatting and generic guard hooks now come from ECC**
> (`ECC_HOOK_PROFILE=minimal|standard|strict`), not from here. Retired 2026-09-07 (K98):
> `session-start`, `session-end`, `evaluate-session`, `pre-compact`, `post-edit-format`,
> `post-edit-console-warn`, `pre-write-doc-warn`, `git-push-reminder`, plus the dev-server
> blocker and tmux reminder that this table used to advertise. Rationale and the ECC
> equivalent for each: [`docs/adr/0009-wynik-spike-fazy-0-i-lista-retire.md`](../docs/adr/0009-wynik-spike-fazy-0-i-lista-retire.md).
> Watch for the double gate: ECC's `gateguard-fact-force` also fires on `Edit`/`Write`/`Bash`,
> so DDD projects set `ECC_GATEGUARD=off` (or `ECC_DISABLED_HOOKS=…`) in their block `env:`.

> **Per-stack enforcement** (`check-delegation.js`, `check-patterns-read.js`, `check-ddd-patterns.js`, `check-domain-purity.js`, …) lives in the hooks dir but is **not** registered in global `hooks.json`. It is injected per project via `templates/settings/<stack>.json` because the routing rules are stack-specific. `check-delegation.js` and `check-patterns-read.js` share their file→pattern routing through `lib/pattern-routing.js` (single source of truth).

> **STRICT mode in `check-delegation.js`** (since 2026-08-13). `/orchestrate` writes
> `<cwd>/.claude/run-state/orchestrating.json` — `{ "task_id": "TS-X-001", "session_id": "<uuid>",
> "ts": "<ISO 8601 UTC>" }` — at gate 0 and removes it on every exit path. While that marker is
> fresh **and belongs to the calling session**, the main agent cannot write any
> `.ts/.tsx/.dart/.py/.svelte` file, mapped to a pattern or not. Coordination artifacts (`.md`,
> `.yml`, `.json`, `.claude/**`, `project-orchestration/**`) stay editable — `isExempt()` clears
> them. The `session_id` check keeps a run in one instance from gating a parallel session on the
> same repo (ADR 0006); the 8-hour TTL keeps a crashed run from gating tomorrow's work.
>
> It replaced `disallowedTools: Edit` on the `/orchestrate` command, which enforced nothing real:
> `Write` (full-file overwrite) stayed open, while the coordinator lost the ability to maintain its
> own `.analysis.md` and to patch a workflow script before `resumeFromRunId`. Removing one write
> tool while leaving another is a gate in appearance only.

### PostToolUse Hooks

| Hook | Matcher | What It Does |
|------|---------|-------------|
| **PR logger** (`pr-url-logger.js`) | `Bash` | Logs PR URL and review command after `gh pr create` |
| **TypeScript check** (`post-edit-typecheck.js`) | `Edit` | Runs `npx --no-install tsc --noEmit` in the nearest tsconfig root and reports only errors touching the edited file. Since K107 it uses `--incremental` (build info under `.claude/run-state/`) and a **per-directory cooldown**, default 120 s — editing six files of one feature costs one typecheck, not six. `TYPECHECK_COOLDOWN_MS=<ms>`, `TYPECHECK_MODE=off`. Never blocks. |
| **PM housekeeping** (`pm-task-housekeeping.js`) | `Edit\|Write\|MultiEdit` | Moves task files to `completed-tasks/` once they read `status: done`. `PM_HOUSEKEEPING_MODE=off`. |
| **Security impl feedback** (`security-impl-feedback.js`) | `Edit\|Write\|MultiEdit` | Shows security-checklist progress while `.ts` source is edited. `AGENT_SECURITY_IMPL_FEEDBACK=off`. |
| **GPU patterns** (`check-gpu-patterns.js`) | `Edit` | ML inference: blocking calls in `async def`, `empty_cache()` without `gc.collect()`, `asyncio.gather` fan-out over GPU calls. Requires `gpu.enabled` in `python-hooks.json` — silent skip otherwise |
| **Human voice** (`check-human-voice.js`) _(per-stack)_ | `Write\|Edit\|MultiEdit` | On `*.analysis.md`: warns when `open_questions[].ask` / `decisions[].means` are missing, empty, or still written in codebase language (file names, ADR numbers, class names, layer jargon). Register comes from `runtime.yml` `human_voice`. Wired in by the `approval-gate` block. `HUMAN_VOICE_MODE=off`. |
| **Workflow metrics** (`workflow-metrics-postrun.js`) | `Workflow` | TASK-OBS-002: fire-and-forget spawn of `scripts/workflow-metrics-collect.mjs` after every Workflow run — per-step tokens/$/outcome land in `~/.claude/metrics/workflow-steps.jsonl` (idempotent, key `runId+agentId`). Never blocks (always exit 0); skips subagent contexts via `agent_id`. Format + reports: `scripts/WORKFLOW-METRICS.md`. L1 eval: `node tests/flow-evals/workflow-metrics/run.js` |

> **Knowledge freshness** (`knowledge-freshness-postwrite.js`) lives in the hooks dir but is **not**
> registered in global `hooks.json` — it's OPT-IN per project, since it only makes sense for
> projects that use the `knowledge-retriever` MCP server (`mcp-server/knowledge-retriever/`). A
> project that wants incremental re-embed on save adds it to its own `.claude/settings.json`:
> ```json
> {
>   "hooks": {
>     "PostToolUse": [
>       {
>         "matcher": "Edit|Write|MultiEdit",
>         "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/hooks/knowledge-freshness-postwrite.js\"" }]
>       }
>     ]
>   }
> }
> ```
> It also needs `.claude/config/knowledge.json` in the project root:
> `{ "collection": "code_myproject", "watchDirs": ["src"] }`. On every `.ts`/`.tsx` edit under a
> watched dir, it fires a fire-and-forget `POST http://localhost:${KR_HTTP_PORT:-6403}/reindex-file`
> (bounded ~3s timeout, all errors swallowed — daemon-down/network issues never block the edit).
> Follows the exact stdin/stdout contract of `post-edit-typecheck.js` (always passes stdin through
> and exits 0, even on failure).

> **Productivity watchdog** (`productivity-watchdog.js`, PreToolUse) — TASK-OBS-001. Also **not**
> in global `hooks.json` — OPT-IN per project. Enforcement arm of `scripts/workflow-watcher.js`
> (the external transcript watcher): the hook measures nothing itself, it reads flags written by
> the watcher and **denies further tool calls** (exit 2) for subagents flagged as spinning
> (tokens growing with NO progress event for their stage contract — D6), plus a kill-switch.
> Main agent is NEVER blocked (subagent detection via `agent_id`, same as `check-delegation.js`;
> no transcript scanning). Flags: `.claude/run-state/halt.json` (15-min TTL) and
> `.claude/run-state/KILL` (touch = stop all subagents). `WATCHDOG_MODE=block|warn|off`.
> Register in the project's `.claude/settings.json`:
> ```json
> {
>   "hooks": {
>     "PreToolUse": [
>       {
>         "matcher": "*",
>         "hooks": [{ "type": "command", "command": "node \"$HOME/.claude/hooks/productivity-watchdog.js\"" }]
>       }
>     ]
>   }
> }
> ```
> Run the watcher alongside long `/orchestrate` runs:
> `node scripts/workflow-watcher.js --project /path/to/project` → live `RUN-STATE.md`
> (per-agent burn tokens, tokens-since-progress, silence) + HALT flags at 2× the spin threshold.
> L1 eval (run on every hook change): `node tests/flow-evals/hooks/run.js`.

### Lifecycle Hooks

| Hook | Event | What It Does |
|------|-------|-------------|
| **PM briefing** (`session-start-pm.js`) | `SessionStart` | Loads `TEAM-STATE.md` for projects with a PM system; silent when there is none |
| **Subagent start log** (`subagent-start-log.js`) | `SubagentStart` | Cost monitoring — records that a subagent started (async) |
| **Subagent stop log** (`subagent-stop-log.js`) | `SubagentStop` | Cost monitoring — records that a subagent finished (async) |
| **Agent usage log** (`subagent-stop-cost-log.js`) | `SubagentStop` | Per-agent token usage → `~/.claude/logs/agent-usage.jsonl`. `AGENT_USAGE_LOG_MODE=off` |
| **Agent memory guard** (`agent-memory-size-guard.js`) | `SubagentStop` | Warns when an agent's memory dir looks like a run log. `AGENT_MEMORY_SIZE_GUARD=off` |
| **Subagent pattern reads** (`check-subagent-pattern-reads.js`) | `SubagentStop` | The moat: closes the gap left when `check-patterns-read.js` waves all subagents through. `PATTERN_READS_MODE=block\|warn\|off` |
| **Worktree env copy** (`worktree-env-copy.js`) | `WorktreeCreate` | Copies `.env` files into a fresh worktree |

Everything else at session boundaries — `SessionStart` context loading, `SessionEnd`
persistence, `PreCompact` state saving, pattern extraction — comes from ECC since 2026-09-07
(K98). Manual compaction advice lives in the [`strategic-compact`](../skills/optimization/strategic-compact/)
skill, not in a hook.

## Environment Variables

Every switch a hook reads, in one place. Convention (K106): `<NAME>_MODE=block|warn|off`.
Three variables predate it and keep their old spelling as a **deprecated alias** so satellite
projects that set them keep working — the new name wins when both are present.

| Variable | Hook | Values | Default |
|----------|------|--------|---------|
| `AGENT_MEMORY_SIZE_GUARD` | `agent-memory-size-guard.js` | `off` | (on) |
| `AGENT_SECURITY_IMPL_FEEDBACK` | `security-impl-feedback.js` | `off` | (on) |
| `AGENT_USAGE_DEBUG` | `subagent-stop-cost-log.js` | `1` | (off) |
| `AGENT_USAGE_LOG_MODE` | `subagent-stop-cost-log.js` | `off` | (on) — alias deprecated: `AGENT_USAGE_LOG` |
| `APPROVAL_GATE_MODE` | `check-approval-before-impl.js` | `warn` \| `block` \| `off` | `warn` — alias deprecated: `ORCHESTRATE_DDD_GATE` |
| `CHECK_PATTERNS_LOOKBACK` | `check-patterns-read.js` | integer (tool calls scanned) | `15` |
| `CHECK_PATTERNS_MODE` | `check-patterns-read.js` | `block` \| `warn` | `block` |
| `CHECK_PATTERNS_REQUIRED_HITS` | `check-patterns-read.js` | integer | `1` |
| `CHECK_SECURITY_MODE` | `check-security-considerations.js` | `warn` \| `block` \| `off` | `warn` |
| `DELEGATION_MODE` | `check-delegation.js` | `block` \| `warn` \| `off` | `block` |
| `HUMAN_VOICE_MODE` | `check-human-voice.js` | `warn` \| `off` | `warn` |
| `KR_HTTP_PORT` | `knowledge-freshness-postwrite.js` | port of the knowledge-retriever daemon | `6403` |
| `KR_TRANSCRIPT_MAX_BYTES` | `lib/transcript-usage.js` | bytes | (internal cap) |
| `PATTERN_READS_MODE` | `check-subagent-pattern-reads.js` | `block` \| `warn` \| `off` | `block` |
| `PM_HOUSEKEEPING_MODE` | `pm-task-housekeeping.js` | `off` | (on) — alias deprecated: `PM_NO_AUTO_HOUSEKEEPING=true` |
| `TYPECHECK_COOLDOWN_MS` | `post-edit-typecheck.js` | milliseconds | `120000` |
| `TYPECHECK_MODE` | `post-edit-typecheck.js` | `off` | (on) |
| `WATCHDOG_MODE` | `productivity-watchdog.js` | `block` \| `warn` \| `off` | `block` |
| `WORKFLOW_LINT` | `pre-workflow-lint.js` | `block` \| `warn` \| `off` | `block` |

ECC's own hooks read their own variables (`ECC_HOOK_PROFILE`, `ECC_DISABLED_HOOKS`,
`ECC_GATEGUARD`, `ECC_SESSION_START_MAX_CHARS`) — see `docs/ECC-USAGE.md`.

## Customizing Hooks

### Disabling a Hook

Remove or comment out the hook entry in `hooks.json`. If installed as a plugin, override in your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [],
        "description": "Override: allow all .md file creation"
      }
    ]
  }
}
```

### Writing Your Own Hook

Hooks are shell commands that receive tool input as JSON on stdin and must output JSON on stdout.

**Basic structure:**

```javascript
// my-hook.js
let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
  const input = JSON.parse(data);

  // Access tool info
  const toolName = input.tool_name;        // "Edit", "Bash", "Write", etc.
  const toolInput = input.tool_input;      // Tool-specific parameters
  const toolOutput = input.tool_output;    // Only available in PostToolUse

  // Warn (non-blocking): write to stderr
  console.error('[Hook] Warning message shown to Claude');

  // Block (PreToolUse only): exit with code 2
  // process.exit(2);

  // Always output the original data to stdout
  console.log(data);
});
```

**Exit codes:**
- `0` — Success (continue execution)
- `2` — Block the tool call (PreToolUse only)
- Other non-zero — Error (logged but does not block)

### Hook Input Schema

```typescript
interface HookInput {
  tool_name: string;          // "Bash", "Edit", "Write", "Read", etc.
  tool_input: {
    command?: string;         // Bash: the command being run
    file_path?: string;       // Edit/Write/Read: target file
    old_string?: string;      // Edit: text being replaced
    new_string?: string;      // Edit: replacement text
    content?: string;         // Write: file content
  };
  tool_output?: {             // PostToolUse only
    output?: string;          // Command/tool output
  };
}
```

### Async Hooks

For hooks that should not block the main flow (e.g., background analysis):

```json
{
  "type": "command",
  "command": "node my-slow-hook.js",
  "async": true,
  "timeout": 30
}
```

Async hooks run in the background. They cannot block tool execution.

## Common Hook Recipes

### Warn about TODO comments

```json
{
  "matcher": "Edit",
  "hooks": [{
    "type": "command",
    "command": "node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const ns=i.tool_input?.new_string||'';if(/TODO|FIXME|HACK/.test(ns)){console.error('[Hook] New TODO/FIXME added - consider creating an issue')}console.log(d)})\""
  }],
  "description": "Warn when adding TODO/FIXME comments"
}
```

### Block large file creation

```json
{
  "matcher": "Write",
  "hooks": [{
    "type": "command",
    "command": "node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const c=i.tool_input?.content||'';const lines=c.split('\\n').length;if(lines>800){console.error('[Hook] BLOCKED: File exceeds 800 lines ('+lines+' lines)');console.error('[Hook] Split into smaller, focused modules');process.exit(2)}console.log(d)})\""
  }],
  "description": "Block creation of files larger than 800 lines"
}
```

### Auto-format Python files with ruff

```json
{
  "matcher": "Edit",
  "hooks": [{
    "type": "command",
    "command": "node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const p=i.tool_input?.file_path||'';if(/\\.py$/.test(p)){const{execFileSync}=require('child_process');try{execFileSync('ruff',['format',p],{stdio:'pipe'})}catch(e){}}console.log(d)})\""
  }],
  "description": "Auto-format Python files with ruff after edits"
}
```

### Require test files alongside new source files

```json
{
  "matcher": "Write",
  "hooks": [{
    "type": "command",
    "command": "node -e \"const fs=require('fs');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const i=JSON.parse(d);const p=i.tool_input?.file_path||'';if(/src\\/.*\\.(ts|js)$/.test(p)&&!/\\.test\\.|\\.spec\\./.test(p)){const testPath=p.replace(/\\.(ts|js)$/,'.test.$1');if(!fs.existsSync(testPath)){console.error('[Hook] No test file found for: '+p);console.error('[Hook] Expected: '+testPath);console.error('[Hook] Consider writing tests first (/tdd)')}}console.log(d)})\""
  }],
  "description": "Remind to create tests when adding new source files"
}
```

## Additional Hooks (quick reference, K42)

Files in `hooks/` not covered by name in the prose sections above (added over time, not
backfilled here). One line per file, from its own header comment — see the file itself for
full detail. Every `.js`/`.sh` in this directory appears either here or in a table above;
if you add one, add its row.

| File | Event | Purpose |
|------|-------|---------|
| `check-approval-before-impl.js` | PreToolUse | Backstop for the research→implementation hard gate (ADR 0002) |
| `check-clean-arch.js` | PostToolUse | Flutter domain/application layer purity after editing |
| `check-context-isolation.js` | Stop | Detect cross-context imports in modified TypeScript files |
| `check-debugprint-guard.js` | PostToolUse | `debugPrint()`/`print()` without `kDebugMode` guard (Flutter) |
| `check-design-tokens.js` | PostToolUse | Visual literals used instead of design tokens |
| `check-flutter-imports.js` | Stop | Detect cross-feature imports in modified Dart files |
| `check-focus-wrapper.js` | PostToolUse | Bare `GestureDetector(` in a file with no `Focus(`/`FocusableActionDetector(`/`SoftPressable(`/Material tap widget (WCAG SC 2.4.7). Config `interactiveFocus` in `flutter-hooks.json`; wired via `blocks/clean-arch.yml` `overlay.hooks` (K53) |
| `check-l10n-hardcoded.js` | PostToolUse | Hardcoded UI text instead of localization keys |
| `check-pumpandsettle.js` | PostToolUse | Warn on bare `pumpAndSettle()` (no `Duration`) in Flutter tests |
| `check-python-layers.js` | PostToolUse | Python domain/service layer purity after editing |
| `check-python-typing.js` | PostToolUse | Detect missing type hints in Python functions |
| `check-riverpod-patterns.js` | PostToolUse | Detect `ref.read()` inside `build()` methods (Flutter/Riverpod) |
| `check-security-considerations.js` | PostToolUse | Security-aware task file analysis |
| `check-subagent-pattern-reads.js` | SubagentStop | Closes the gap left when `check-patterns-read.js` passes all subagents |
| `check-typography-tokens.js` | PostToolUse | Inline `TextStyle(fontSize:...)`/`EdgeInsets.*()` literals |
| `cost-optimizer.sh` | — | Tool-restriction enforcement (renamed from `enforce-tool-restrictions.sh`) |
| `pm-task-check.js` | PostToolUse | PM health check when `project-orchestration/` task files change |
| `pm-task-housekeeping.js` | PostToolUse | Auto-housekeeping for task files marked `status: done` |
| `pre-workflow-lint.js` | PreToolUse | Thin wrapper around `workflow-lint.js`'s hardcoded rule set |
| `security-impl-feedback.js` | PostToolUse | Security implementation feedback |
| `session-monitor.sh` | — | Merges `session-summary.sh` + `periodic-visual-feedback.sh` + `post-tool-use-feedback.sh` |
| `session-start-pm.js` | SessionStart | Auto-load `TEAM-STATE.md` for projects with a PM system |
| `state-manager.sh` | — | Merges `auto-state-manager.sh` + `ensure-state-saved.sh` + `state-banner.sh` |
| `statusline-pm.js` | statusLine | PM-aware status bar |
| `subagent-stop-cost-log.js` | SubagentStop | Append per-agent token usage to the cost log |
| `workflow-metrics-postrun.js` | PostToolUse | Fire-and-forget metrics collection after each `Workflow` run |
| `agent-memory-size-guard.js` | SubagentStop | Warn when an agent's memory looks like a run log: `MEMORY.md` > 4 KB, > 20 note files, files named like task statuses (`project_ts_*_status`), or > 40 KB total (K35, `TASK-KAIZEN-001`; tightened 2026-09-06) |

`workflow-lint.js` is **not a hook** — it's a CLI tool that lives in `hooks/` because this
directory is what gets symlinked into satellite projects; see `tests/flow-evals/workflow-lint/`
for its eval and `commands/orchestrate.md` for how it's invoked.

## Cross-Platform Notes

All hooks in this plugin use Node.js (`node -e` or `node script.js`) for maximum compatibility across Windows, macOS, and Linux. Avoid bash-specific syntax in hooks.

## Related

- [rules/common/hooks.md](../rules/common/hooks.md) — Hook architecture guidelines
- [skills/optimization/strategic-compact/](../skills/optimization/strategic-compact/) — Strategic compaction skill (a skill, not a hook)
- [docs/adr/0009-wynik-spike-fazy-0-i-lista-retire.md](../docs/adr/0009-wynik-spike-fazy-0-i-lista-retire.md) — which hooks moved to ECC and why
- [tests/flow-evals/hooks/](../tests/flow-evals/hooks/) — L1 eval; run `node tests/flow-evals/hooks/run.js` on every hook change
