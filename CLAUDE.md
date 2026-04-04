# CLAUDE.md — claude-patterns Repository

This is the **claude-patterns** repository: a single source of truth for
production-tested software patterns, universal agents, and skills shared
across multiple claude-code projects.

**When working in this repo**: you are maintaining the tooling that other
projects depend on. Changes here propagate instantly to all projects via
symlinks. Think carefully before removing or renaming anything.

---

## What's In This Repo

```
patterns/       67 production patterns (38 core + 29 stack-specific)
agents/         5 universal + 14 stack-specific agents
skills/         30 skills across 18 categories (including 5 PM skills)
hooks/          19 hooks + pm-task-check.js (PM, per-project)
templates/      Stack presets + project-orchestration/ template
commands/       22 global commands (PM, orchestration, quality, learning)
rules/          Language-specific coding rules
scripts/        Setup and migration scripts
```

---

## Recent Changes (v3.1 — 2026-04-03)

### Project Management System (NEW)

Added a complete project management system as a reusable pattern:

**New agents** (`agents/universal/`):
- `tech-lead.md` — Technical PM: tracks blocked/stale tasks, debt, dependencies
- `product-owner.md` — Business PM: customer value, mobile UX, milestone advisory

**New skills** (`skills/orchestration/`):
- `pulse/` — Full team sync (both agents + TEAM-STATE.md update)
- `pm-status/` — Quick read of TEAM-STATE.md (~$0, no agent)
- `task-health/` — Deep task audit (broken deps, stale, orphaned)
- `tech-debt/` — Debt analysis + TECH-DEBT.md update
- `sprint/` — Interactive sprint planning

**New pattern** (`patterns/orchestration/`):
- `project-management-system.md` — Complete system docs, setup guide, conventions

**New template** (`templates/project-orchestration/`):
- Ready-to-copy folder: TEAM-STATE.md, KANBAN.md, TECH-DEBT.md, README.md

**New hook** (`hooks/`):
- `pm-task-check.js` — PostToolUse hook: PM briefing when task files change

**Design principle**: `TEAM-STATE.md` is the shared brain — all agents read it
first and write to it after analysis. This creates continuity across long
tmux sessions (days/weeks) without relying on session-start hooks.

---

## How to Work in This Repo

### Adding a New Pattern

1. Create file in the appropriate layer: `patterns/{layer}/{name}-pattern.md`
2. Use this structure:
   ```markdown
   # Pattern: {Name}
   **Layer**: Domain|Application|Infrastructure|Architecture|Testing|Cross-Layer|Orchestration
   **Status**: production|stable|experimental
   
   ## What This Is
   ## When to Use
   ## Implementation
   ## Anti-Patterns
   ```
3. Update `patterns/README.md` to add it to the index
4. Add `METADATA.yml` entry if adding to a new category

### Adding a New Universal Agent

1. Create file in `agents/universal/{name}.md`
2. Required frontmatter:
   ```yaml
   ---
   name: agent-name
   description: |
     Multi-line description used for agent selection.
     Include: what it does, when to use, key examples.
   tools: Read, Glob, Grep (list only what's needed)
   disallowedTools: Write, Edit, Bash (explicit deny)
   model: opus|sonnet|haiku
   effort: max|medium|low
   memory: project
   maxTurns: 15
   ---
   ```
3. Update `agents/README.md` to add it to the table
4. Agent is immediately available via symlink (no restart needed)

### Adding a New Skill

1. Create directory: `skills/{category}/{name}/`
2. Create `SKILL.md` with frontmatter:
   ```yaml
   ---
   name: skill-name
   description: "One-line description"
   origin: ProjectName
   allowed-tools: Read, Write, Edit, Glob, Grep, Agent
   effort: low|medium|high
   ---
   ```
3. Document: When, Steps, Output Example
4. Skill is immediately available via symlink

### Adding a New Hook

1. Create `hooks/{name}.js` following the stdin→stdout pattern:
   ```javascript
   // Read stdin → parse JSON → do work → write stdin back → exit 0
   // Always exit 0 — never block the workflow
   // Use process.stderr for output (visible to Claude)
   ```
2. Update `hooks/hooks.json` if it should be auto-installed
3. Document in `hooks/README.md`

### Adding a New Template

1. Create directory: `templates/{template-name}/`
2. Include a `README.md` explaining setup
3. Use `{PLACEHOLDER}` syntax for project-specific values
4. Document in main `README.md`

---

## Architecture Decisions

### Why symlinks, not npm packages?

Symlinks give instant propagation: edit once, all projects see it immediately.
No publish cycle, no version management, no install step.

### Why TEAM-STATE.md instead of a database?

Zero dependencies. Works offline. Git-tracked. Readable by humans and agents.
The simplicity is intentional — complexity belongs in the agents, not the storage.

### Why event-driven (PostToolUse) instead of session-start hooks?

tmux sessions last days or weeks. Session-start hooks fire too rarely and
at unpredictable times. PostToolUse on task file changes fires exactly when
it's relevant: when the project state has actually changed.

### Why tech-lead + product-owner, not one unified agent?

Different mental models produce better analysis when kept separate. A tech lead
thinks in terms of blockers, dependencies, and debt. A product owner thinks in
terms of customer value, milestones, and validated assumptions. Merging them
produces mediocre analysis in both dimensions.

---

## Conventions

- **Never remove** something without checking all projects that symlink to it
- **Never rename** agents or skills without a deprecation notice
- **Always update** the README.md when adding new components
- **Always update** the CHANGELOG or METADATA.yml version
- **Test locally** before committing — changes propagate instantly via symlinks
- **Pattern files**: real production code as examples, not pseudocode
- **Agent files**: clear `disallowedTools` — explicit deny is safer than permissive

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `README.md` | Main documentation + setup guide |
| `METADATA.yml` | Repository version + metadata |
| `agents/README.md` | Agent catalog + setup guide |
| `patterns/README.md` | Pattern index (67 patterns) |
| `patterns/orchestration/project-management-system.md` | PM system full docs |
| `hooks/hooks.json` | Auto-install hook configuration |
| `scripts/setup-global.sh` | Global setup (agents, commands, hooks) |
| `scripts/setup-project.sh` | Per-project setup (patterns, rules, skills, PM) |

---

## Relationship to Projects

```
claude-patterns (this repo)
    ↓ symlinks
~/.claude/agents/     → agents/universal/
~/.claude/skills/     → skills/
~/.claude/commands/   → commands/
~/.claude/hooks/      → hooks/

project/.claude/knowledge/patterns/ → patterns/

project/project-orchestration/  ← copy of templates/project-orchestration/
    TEAM-STATE.md                ← local instance (not in claude-patterns)
    tasks/*.md                   ← local tasks (not in claude-patterns)
```

**The rule**: patterns, agents, skills, hooks, templates → claude-patterns.
Instance data (actual tasks, actual TEAM-STATE.md) → the project.
