# Architecture: claude-patterns + per-project extensions

This document describes how `claude-patterns` (central, shared) and individual
projects (per-project overrides) compose into a working system.

For the **decisions and rationale** behind the central/local split, see
[`docs/adr/0001-extension-architecture.md`](adr/0001-extension-architecture.md).
For the **decisions and rationale** behind stack composition (blocks,
`runtime.yml`, the generic `/analyze` + `/orchestrate` engines), see
[ADR 0008](adr/0008-stack-blocks-composition.md) — the schema reference for
blocks lives in [`blocks/README.md`](../blocks/README.md), not here.

For the **implementation plan**, see [`docs/ROADMAP.md`](ROADMAP.md) — mostly historical since ADR 0008, see its own banner.

> **History**: before 2026-08-12, stack selection worked through
> `stack_profile`, `patterns/_stack-defaults/<stack>.yml` and
> `templates/stack-presets/`, and DDD projects ran dedicated `/analyze-ddd` +
> `/orchestrate-ddd` commands. All of that was removed the same day ADR 0008
> shipped, in favor of the block composition described below. If you find a
> reference to any of those names outside an ADR or a changelog, it's stale.

---

## Goals

- **Centralized management** — one source of truth for agents, skills, patterns, hooks
- **Flexibility** — every project can extend or override centrally without modifying central repo
- **Locality** — works offline, no publication, no plugin marketplace
- **Preserved workflow** — instant edit (via symlinks) → instant propagation
- **Convention over configuration** — minimum manifests, maximum native Claude Code mechanisms

## Three layers

```
┌─────────────────────────────────────────────────────────────────┐
│  L1: claude-patterns (central, /opt/projects/claude-patterns)   │
│                                                                  │
│  agents/         universal/ (tech-lead, product-owner, ...)     │
│                  stacks/<stack>/ (per stack)                    │
│  skills/         universal skills                                │
│  commands/       incl. generic /analyze + /orchestrate (ADR 0008)│
│  patterns/       <layer>/ (domain, application, cross-layer...) │
│                  <stack>/ (flutter, nextjs, python, ...)        │
│  blocks/         composition units — one YAML per block          │
│                  (ADR 0008: framework/architecture/persistence/  │
│                  validation/security/process axes)               │
│  rules/          language-specific coding rules                  │
│  templates/      project-orchestration/, settings/*.json,       │
│                  examples/, project.yml.example                  │
└─────────────────────────────────────────────────────────────────┘
                            ↓ symlinks + materialization
┌─────────────────────────────────────────────────────────────────┐
│  L3: scripts/setup-project.sh + scripts/materialize-runtime.mjs │
│                                                                  │
│  Reads project.yml → stack_blocks: [...] + stack_profile        │
│  Resolves block `requires:` and `blocks/_aliases.yml`            │
│  Merges blocks (union/dedup patterns.always, concat triggers,   │
│  panel in block order, exit=PAUSE if any block sets it, exactly │
│  one axis:architecture block contributes orchestrate.layers,    │
│  env last-wins-with-warning, budgets min-merge) into             │
│  .claude/config/runtime.yml — the ONLY file the engines read    │
│  Also symlinks block `overlay:` targets (agents/patterns/rules  │
│  dirs) and applies `overlay.hooks` via sync-runtime-hooks.mjs   │
│  `stack_profile` separately selects: CLAUDE.md template         │
│  sections + the stack hooks-config template — it does NOT       │
│  choose patterns, agents or gates (that's stack_blocks only)    │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  L2: project /.claude/ (per-project overrides + extensions)     │
│                                                                  │
│  .claude/agents/                → Claude Code natively           │
│  .claude/skills/                → Claude Code natively           │
│  .claude/commands/              → Claude Code natively           │
│  .claude/hooks/                 → Claude Code natively           │
│  .claude/rules/                 → overlay symlinks (per block)  │
│  .claude/knowledge/patterns/    → overlay symlinks + project-own │
│  .claude/blocks/*.yml           → local blocks (`./name` prefix) │
│  .claude/config/project.yml     → stack_blocks + stack_profile  │
│  .claude/config/runtime.yml     → materialized; engines read it │
│  CLAUDE.md                      → generated from project.yml     │
│  .claude/settings.json          → hooks registration, permissions│
└─────────────────────────────────────────────────────────────────┘
```

## Override matrix

Where you put files determines who sees them:

| Need | Location | Visibility |
|------|----------|------------|
| Add universal skill | `claude-patterns/skills/<cat>/<name>/SKILL.md` | All projects |
| Add project-only skill | `<project>/.claude/skills/<name>/SKILL.md` | One project |
| Add universal agent | `claude-patterns/agents/universal/<name>.md` | All projects |
| Add project-only agent | `<project>/.claude/agents/<name>.md` | One project |
| Override universal agent for one project | `<project>/.claude/agents/<same-name>.md` | One project (precedence wins) |
| Add global hook | `claude-patterns/hooks/foo.js` + `hooks/hooks.json` | All projects (via `sync-global-hooks.mjs`) |
| Add project-only hook | `<project>/.claude/hooks/foo.js` + register in `.claude/settings.json` | One project |
| Add slash command | `commands/foo.md` (global) or `.claude/commands/foo.md` (project) | Global or project |
| Output style for strategist | `claude-patterns/output-styles/foo.md` (global) or `.claude/output-styles/foo.md` (project) | Global or project |
| Universal pattern (no block owns it) | `claude-patterns/patterns/<layer>/foo.md` | All projects (returned by `retrieve_patterns`, `blocks: []`) |
| Pattern tied to one stack | Referenced from `blocks/<name>.yml` → `patterns.always` or `patterns.triggers` | Projects whose `stack_blocks` includes that block |
| Project-specific pattern | `<project>/.claude/knowledge/patterns/<cat>/foo.md` | One project (symlinked overlay + local files) |
| New composition unit | `claude-patterns/blocks/<name>.yml` (or `blocks/<ns>/<name>.yml`) | All projects that add it to `stack_blocks` |
| Project-only composition unit | `<project>/.claude/blocks/<name>.yml`, referenced as `./name` | One project |
| Static instructions (PII, naming, conventions) | `<project>/CLAUDE.md` | One project (auto-injected) |
| Stack composition | `<project>/.claude/config/project.yml` → `stack_blocks: [...]` | Used by `materialize-runtime.mjs` → `/analyze`, `/orchestrate` |

## Modifying `/analyze` and `/orchestrate` per project — escape hatches

Projects do **not** fork the generic engines. `/analyze` and `/orchestrate`
are stack-blind skeletons with fixed slots (ADR 0008 D2); everything
stack-specific comes from `runtime.yml`. Extend behavior through:

### 1. Add or swap blocks (most common)

Add a block to `stack_blocks:` in `project.yml`, or write a local one in
`.claude/blocks/*.yml` (identical schema, see `blocks/README.md`). A local
block can `extends:` a central one and override just the parts that differ
(drop a panel stage, swap an agent, add a trigger) instead of forking the
whole file.

### 2. Add patterns

Drop a file in `.claude/knowledge/patterns/<category>/` (project-only) or
add a path to a block's `patterns.always` / `patterns.triggers` (shared by
every project using that block). Both end up unioned into `runtime.yml` —
the engines don't know or care which source a pattern came from.

### 3. Hook on the engine

Register a hook in `.claude/settings.json` that fires around `/analyze` or
`/orchestrate` phases (grounding, delegation, approval gates). Central hooks
declare themselves in a block's `hooks:` list and get wired in by
`sync-runtime-hooks.mjs`; project-only hooks are registered directly.

### 4. Override an agent (last resort, rare)

`.claude/agents/<same-name>.md` wins via per-project precedence. Use only
when a project genuinely needs a fundamentally different agent than the one
a block's slot names. Prefer blocks + `extends:` first — a full override
drifts silently from the central definition.

## Composition flow — from `project.yml` to a running `/orchestrate`

```
1. project.yml declares composition
   stack_blocks: [nestjs, ddd, kysely]        # `ddd` alias expands via blocks/_aliases.yml
   stack_profile: nestjs-ddd                  # CLAUDE.md template + hooks-config selector only

2. scripts/materialize-runtime.mjs resolves + merges (called by setup-project.sh)
   - expands aliases, checks each block's `requires:` (missing = hard error)
   - patterns.always  → union, deduped (warns above 8 total, OQ4)
   - patterns.triggers → concatenated
   - analyze.panel     → slots in block order, `when:` gates activation
   - analyze.exit      → PAUSE if ANY block sets it (e.g. ddd/core)
   - orchestrate.layers → from exactly ONE block on the `architecture` axis
   - layer_contributions → other-axis blocks enrich that layer's patterns/checks by tag match
   - env               → last block wins, with a warning
   - budgets           → lowest limit wins (project.yml overrides without limit)
   → writes .claude/config/runtime.yml (schema_version, source hashes, provenance per entry)

3. setup-project.sh also symlinks overlay targets
   - overlay.agents/patterns/rules → per-block directories into .claude/
   - overlay.hooks → registered in .claude/settings.json via sync-runtime-hooks.mjs

4. /analyze <TASK-ID>
   - hard gate: no runtime.yml → refuses to start
   - runs the panel from analyze.panel, writes the analysis artifact
   - exit: PAUSE → hard approval gate; CONTINUE → falls through to /orchestrate

5. /orchestrate <TASK-ID>
   - hard gate: no runtime.yml → refuses; analyze.exit=PAUSE → requires an
     approved analysis artifact for this TASK-ID first
   - loops [implement → verify → fix] per orchestrate.layers, runs final_gate
   - ends in "staged, not committed"
```

## Concrete example — a DDD project with Postgres

`stack_blocks: [nestjs, ddd, kysely]` pulls in `blocks/nestjs.yml` (framework:
conventions, security, threat-model panel), the four `blocks/ddd/*.yml` files
(architecture: domain patterns, agents, the PAUSE gate, `orchestrate.layers`),
and `blocks/kysely.yml` (persistence: persistence patterns, contributing to
the `application` layer via `layer_contributions`). The full block catalog
with what each one wires up lives in
[`blocks/README.md`](../blocks/README.md#bloki-i-aliasy) — not duplicated
here to avoid a second copy that drifts.

Adding a project-specific concern (e.g. a security invariant unique to one
domain) doesn't touch any block: drop the pattern in
`.claude/knowledge/patterns/security/`, or declare a local block in
`.claude/blocks/` if it also needs a panel stage or a layer contribution.

## Anti-patterns (avoid)

- ❌ Hardcoding project-specific rules into universal skills in `claude-patterns/skills/<universal>/SKILL.md`
- ❌ Adding "extras" lists to `project.yml` (`agents_extras`, `hooks_extras`, `patterns.always_include`, ...) — composition goes through `stack_blocks`, not ad-hoc manifest fields (ADR 0001, ADR 0008 D1)
- ❌ Forking a whole central block to change one stage — use `extends:` in a local block instead
- ❌ Modifying the generic `/analyze` / `/orchestrate` engines per project — extend via blocks, patterns, or hooks
- ❌ Per-project full copies of an agent when only a slot's model/effort needs tuning — that's `analyze.panel[].model/effort` in the block, not a forked agent file
- ❌ Editing `.claude/config/runtime.yml` by hand — it's generated; edit the block or `project.yml` and re-run `materialize-runtime.mjs`
- ❌ Schema-heavy declarative manifests duplicating native discovery
- ❌ Plugin format / marketplace / release cycle for solo single-user setup

## What this architecture is NOT

- Not a plugin marketplace (intentionally — see ADR 0001)
- Not version-pinned per project (projects consume HEAD of claude-patterns; `runtime.yml` records the source hash used at materialization time, so drift is detectable, not prevented)
- Not designed for multi-team distribution (single-user solo setup)
- Not a substitute for project-level CLAUDE.md (use both)

## Key properties

1. **Workflow preserved** — instant edit via symlinks works as before; blocks add a materialization step only for the parts that must be merged (patterns, panel, layers), not for anything symlinked directly
2. **Zero ceremony for a simple project** — a one-line `stack_blocks:` composes a working setup
3. **Scales to N projects and N stack combinations** — a new framework × architecture × persistence combination is a new line in `stack_blocks`, not a new monolithic profile
4. **Safe changes** — edits to a block propagate on the next `materialize-runtime.mjs` run; `--check` mode detects drift without writing, so a project can be told "your runtime.yml is stale" without silently overwriting it
5. **Discoverable** — `runtime.yml` is inspectable: every merged entry carries which block it came from
6. **Hard entry gates** — `/analyze` and `/orchestrate` refuse to run at all without a materialized `runtime.yml`, so an unconfigured project fails loudly instead of silently degrading
