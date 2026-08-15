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
| **Dev server blocker** | `Bash` | Blocks `npm run dev` etc. outside tmux — ensures log access | 2 (blocks) |
| **Tmux reminder** | `Bash` | Suggests tmux for long-running commands (npm test, cargo build, docker) | 0 (warns) |
| **Git push reminder** | `Bash` | Reminds to review changes before `git push` | 0 (warns) |
| **Doc file warning** | `Write` | Warns about non-standard `.md`/`.txt` files (allows README, CLAUDE, CONTRIBUTING, CHANGELOG, LICENSE, SKILL, docs/, skills/); cross-platform path handling | 0 (warns) |
| **Strategic compact** | `Edit\|Write` | Suggests manual `/compact` at logical intervals (every ~50 tool calls) | 0 (warns) |
| **Delegation gate** _(per-stack)_ | `Write\|Edit\|MultiEdit` | Blocks the **main agent** from implementing production code directly — forces delegation to a subagent / `/orchestrate`. Subagents pass through (detected via `agent_id`). Threshold: pattern files (`lib/pattern-routing.js`), widened to **any enforced source file** while an orchestration run is active (STRICT, below). Wired in via `templates/settings/<stack>.json`, not global `hooks.json`. `DELEGATION_MODE=warn\|off`. | 2 (blocks) |

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
| **PR logger** | `Bash` | Logs PR URL and review command after `gh pr create` |
| **Build analysis** | `Bash` | Background analysis after build commands (async, non-blocking) |
| **Prettier format** | `Edit` | Auto-formats JS/TS files with Prettier after edits |
| **TypeScript check** | `Edit` | Runs `tsc --noEmit` after editing `.ts`/`.tsx` files |
| **console.log warning** | `Edit` | Warns about `console.log` statements in edited files |
| **GPU patterns** | `Edit` | ML inference: blocking calls in `async def`, `empty_cache()` without `gc.collect()`, `asyncio.gather` fan-out over GPU calls. Requires `gpu.enabled` in `python-hooks.json` — silent skip otherwise |
| **Human voice** _(per-stack)_ | `Write\|Edit\|MultiEdit` | On `*.analysis.md`: warns when `open_questions[].ask` / `decisions[].means` are missing, empty, or still written in codebase language (file names, ADR numbers, class names, layer jargon). Register comes from `runtime.yml` `human_voice`. Wired in by the `approval-gate` block. `HUMAN_VOICE_MODE=off`. |
| **Workflow metrics** | `Workflow` | TASK-OBS-002: fire-and-forget spawn of `scripts/workflow-metrics-collect.mjs` after every Workflow run — per-step tokens/$/outcome land in `~/.claude/metrics/workflow-steps.jsonl` (idempotent, key `runId+agentId`). Never blocks (always exit 0); skips subagent contexts via `agent_id`. Format + reports: `scripts/WORKFLOW-METRICS.md`. L1 eval: `node tests/flow-evals/workflow-metrics/run.js` |

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

### Cross-instance broadcast (ADR 0006)

Dwa hooki + biblioteka `hooks/lib/broadcast/` (segmenty dzienne JSONL, kursory,
claim `O_EXCL`, manifest, walidacja schematu v1). **Wszystko domyślnie wyłączone**:
brak `.claude/config/broadcast.yml` w projekcie = oba hooki kończą `exit 0`, zanim
cokolwiek zrobią. Stan runtime leży w `/opt/projects/.claude-swarm/` — poza repozytoriami.

| Hook | Event | What It Does |
|------|-------|-------------|
| **broadcast-session-start.js** | `SessionStart` | Wypisuje nieprzeczytane wpisy z subskrybowanych topiców, oznaczone jako DANE (nie polecenia). Nie ACK-uje, nie tworzy tasków |
| **broadcast-task-emit.js** | `PostToolUse` (`Edit\|Write\|MultiEdit`) | Przy zapisie taska cross-cluster przypomina o `/broadcast`. Raz na task na dobę. Nic nie emituje sam |
| **broadcast-inbox-inject.js** | `UserPromptSubmit` | Dostarcza inbox do najbliższego promptu (`critical` maks. 2/~1 KB, `important` digest 5, `info` nigdy). **Bezczynny, dopóki manifest nie ma `inject: true`** albo `BROADCAST_INJECT=on` |

Ręczna diagnostyka: `node hooks/lib/broadcast/cli.js doctor`.
Włączenie w projekcie: `node hooks/lib/broadcast/cli.js init`.

### Lifecycle Hooks

| Hook | Event | What It Does |
|------|-------|-------------|
| **Session start** | `SessionStart` | Loads previous context and detects package manager |
| **Pre-compact** | `PreCompact` | Saves state before context compaction |
| **Console.log audit** | `Stop` | Checks all modified files for `console.log` after each response |
| **Session end** | `SessionEnd` | Persists session state for next session |
| **Pattern extraction** | `SessionEnd` | Evaluates session for extractable patterns (continuous learning) |

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

## Cross-Platform Notes

All hooks in this plugin use Node.js (`node -e` or `node script.js`) for maximum compatibility across Windows, macOS, and Linux. Avoid bash-specific syntax in hooks.

## Related

- [rules/common/hooks.md](../rules/common/hooks.md) — Hook architecture guidelines
- [skills/strategic-compact/](../skills/strategic-compact/) — Strategic compaction skill
- [scripts/hooks/](../scripts/hooks/) — Hook script implementations
