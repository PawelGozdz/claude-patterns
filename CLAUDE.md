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
patterns/       70 production patterns (38 core + 29 stack-specific + 1 marketing + 2 finance)
agents/         10 universal + 14 stack-specific agents
skills/         155 skills across 20 categories (5 PM + 41 marketing + 84 finance + others)
hooks/          19 hooks + pm-task-check.js (PM, per-project)
templates/      Stack presets + project-orchestration/ + product-marketing-context.md
commands/       24 global commands (PM, orchestration, quality, learning, marketing, finance)
tools/          External tool reference (vendored): marketing/ (CLIs + integrations)
tests/          Eval frameworks (vendored): finance-evals/ (grade_responses.py + iterations)
rules/          Language-specific coding rules
scripts/        Setup and migration scripts (incl. sync-{marketing,finance}-skills.sh)
```

---

## Recent Changes (v3.4 — 2026-05-07)

### Finance System (NEW)

Vendored 84 finance skills from
[JoelLewis/finance_skills](https://github.com/JoelLewis/finance_skills) (MIT)
with plugin-aware structure preserved.

**New skills folder** (`skills/finance/<plugin>/<skill>/`):
- 7 plugins with dependency graph: `core` (3 skills, math/stats foundations,
  required by all) → `wealth-management` (32), `compliance` (16),
  `advisory-practice` (12), `trading-operations` (9), `client-operations` (8),
  `data-integration` (4)
- 29 skills include `scripts/*.py` — runnable numpy/scipy implementations
- Each `SKILL.md` declares `## Layer N` (0-7) for knowledge depth
- `PLUGINS.md` documents the plugin map and dependency graph
- `UPSTREAM_VERSION` records the synced upstream commit + version

**New agent** (`agents/universal/`):
- `finance-strategist.md` — Sonnet coordinator with **data-driven hedged
  voice** ("Based on [evidence], the most viable approach appears to be X.
  Trade-offs: ... Confidence: medium.") rather than paralyzing
  "consult an advisor" deflection. Plugin-aware (enforces dependencies).
  Three access modes: through `@product-owner`, standalone, or via `/finance`.

**New command** (`commands/`):
- `finance.md` — `/finance <task>` entry point.

**New patterns** (`patterns/finance/`):
- `layered-knowledge-pattern.md` — 2-D organization (plugin × layer) for
  large skill collections. Generalizable beyond finance.
- `regulatory-disclaimer-pattern.md` — 6-category contextual disclaimer
  system (educational, general principles, regulatory, investment-specific,
  trading operational, business operations). Replaces boilerplate "this
  is not financial advice" deflections that get tuned out.

**New tests folder** (`tests/finance-evals/`):
- Vendored eval framework: `grade_responses.py` + 2 iterations of
  test responses + `evals.json`

**New script** (`scripts/`):
- `sync-finance-skills.sh` — per-plugin rsync from upstream with
  diff + confirm, preserves local meta files (README.md, PLUGINS.md,
  UPSTREAM_VERSION).

### Strategic Consultation Integration

`@product-owner` now consults `@marketing-strategist` + `@finance-strategist`
in parallel during **strategic work** (roadmaps, sprint planning, milestones,
pricing analysis, growth questions). Skills `/pulse`, `/sprint`, `/reprioritize`
trigger this consultation automatically.

**Boundary**: code implementation skills (`/orchestrate` impl mode, `/tdd`,
`/scaffold`, `/build-fix`, `/verify`, `/code-review`) explicitly do NOT
consult business strategists. They are summoned only for strategy/analysis,
never for code work.

### Marketing voice updated to match finance

`@marketing-strategist` voice refreshed to use the same data-driven hedged
format as `@finance-strategist` — replacing "I refuse to invent customer
quotes" framing with **"Based on industry benchmarks and [observed
trend]..." + contextual validation note**.

---

## Previous Changes (v3.3 — 2026-05-07)

### Marketing System

Vendored 41 marketing skills from
[coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)
(MIT) and wrapped them in claude-patterns conventions.

**New skills folder** (`skills/marketing/`):
- 41 skills across CRO, copy, SEO, paid, email, growth, strategy, RevOps
- `product-marketing-context` is foundational — runs first per project,
  creates `.agents/product-marketing-context.md`
- `UPSTREAM_VERSION` records the synced upstream commit + version

**New agent** (`agents/universal/`):
- `marketing-strategist.md` — Sonnet coordinator. Enforces context gate,
  routes to the right skill, never fabricates positioning facts.

**New command** (`commands/`):
- `marketing.md` — `/marketing <task>` entry point.

**New pattern** (`patterns/marketing/`):
- `product-marketing-context-pattern.md` — architectural rationale for the
  shared positioning document (the marketing equivalent of `BUSINESS_RULES.yaml`).

**New template** (`templates/`):
- `product-marketing-context.md` — copyable scaffold for `.agents/`.

**New tools folder** (`tools/marketing/`):
- 60 reference CLI scripts + 75+ integration guides + REGISTRY.md
- For analytics, email, ads, CRM, SEO, payments, referrals
- Reference materials only — not executed from claude-patterns

**New script** (`scripts/`):
- `sync-marketing-skills.sh` — pull upstream updates with diff + confirm,
  records version in `UPSTREAM_VERSION`.

**Design principle**: vendoring (full copy) over submodules — keeps the
"everything is here" promise of claude-patterns. Updates are explicit and
auditable via the sync script.

---

## Previous Changes (v3.1 — 2026-04-03)

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

### Adding / Updating Finance Skills

The `skills/finance/` and `tests/finance-evals/` folders are **vendored**
from [JoelLewis/finance_skills](https://github.com/JoelLewis/finance_skills) (MIT).

**Updating from upstream**:
```bash
./scripts/sync-finance-skills.sh --diff       # preview
./scripts/sync-finance-skills.sh              # interactive apply
./scripts/sync-finance-skills.sh --ref v1.0.0  # pin to a tag
```

**Local additions / modifications**:
- `skills/finance/README.md`, `skills/finance/PLUGINS.md`,
  `skills/finance/UPSTREAM_VERSION` — ours
- `tests/finance-evals/README.md` — ours (sibling of upstream files)
- Don't modify individual `SKILL.md` files inside
  `skills/finance/<plugin>/<skill>/` unless absolutely necessary —
  the next sync will overwrite them

**Adding a brand-new finance skill that doesn't exist upstream**:
1. Place it in `skills/finance/<plugin>/<name>/SKILL.md` and add a
   marker comment `<!-- LOCAL — not synced from upstream -->` at the top
2. Update `skills/finance/PLUGINS.md` and `skills/finance/README.md`
3. Add it to the routing table in
   `agents/universal/finance-strategist.md`
4. The sync script's `--exclude='LOCAL-*'` won't catch your file by name
   — rename it with `LOCAL-` prefix or add explicit exclusion to the
   rsync command for that plugin

---

### Adding / Updating Marketing Skills

The `skills/marketing/` and `tools/marketing/` folders are **vendored** from
[coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) (MIT).

**Updating from upstream**:
```bash
./scripts/sync-marketing-skills.sh --diff    # preview
./scripts/sync-marketing-skills.sh           # interactive apply
./scripts/sync-marketing-skills.sh --ref v1.10.0  # pin to a tag
```

**Local additions / modifications**:
- `skills/marketing/README.md`, `skills/marketing/UPSTREAM_VERSION` — ours
- `tools/marketing/README.md` — ours (sibling of upstream `REGISTRY.md`)
- Don't modify individual `SKILL.md` files inside `skills/marketing/<name>/`
  unless absolutely necessary — the next sync will overwrite them. If a
  modification is needed, fork upstream or submit a PR there instead.

**Adding a brand-new marketing skill that doesn't exist upstream**:
1. Place it in `skills/marketing/<name>/SKILL.md` and add a marker comment
   `<!-- LOCAL — not synced from upstream -->` at the top of the file
2. Update `skills/marketing/README.md` catalog
3. Add it to the routing table in `agents/universal/marketing-strategist.md`
4. Make sure `sync-marketing-skills.sh` won't delete it (rsync `--exclude`
   may be needed — currently it uses `--delete`, so local-only skills get
   wiped; add an exclusion if you go this route)

---

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
