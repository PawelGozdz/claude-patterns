# CLAUDE.md — claude-patterns Repository

This is the **claude-patterns** repository: a single source of truth for
production-tested software patterns, universal agents, and skills shared
across multiple claude-code projects.

**When working in this repo**: you are maintaining the tooling that other
projects depend on. Changes here propagate instantly to all projects via
symlinks. Think carefully before removing or renaming anything.

> **🔌 CURRENT DIRECTION (2026-06, wording updated 2026-09): claude-patterns = opinionated DDD/domain OVERLAY on ECC.**
> We do **not** reinvent generic tooling — the [ECC plugin](https://github.com/affaan-m/ECC)
> (installed globally: `ecc@ecc`) is the BASE (agents, skills, loops, MCP); claude-patterns adds the
> domain layer ON TOP (DDD patterns/rules, VETO verifiers, grounding/delegation hooks, `/analyze`
> + `/orchestrate` driven by the block composition in `.claude/config/runtime.yml`). A project opts
> in with `stack_blocks:` in `project.yml`; stack presets are gone since 2026-08-12 (ADR 0008).
> When building/extending here, prefer **consuming ECC** over rebuilding, and make any ECC
> dependency **explicit** (block `requires_ecc:`, `ecc:*` agent refs) — never leave the
> integration to guesswork.
> **Why & how:** [ADR 0008](docs/adr/0008-stack-blocks-composition.md) ·
> [`blocks/README.md`](blocks/README.md) · [`docs/DECISIONS-LOG.md`](docs/DECISIONS-LOG.md) (running rationale) ·
> ADRs in [`docs/adr/`](docs/adr/).

---

## What's In This Repo

```
patterns/       105 production patterns (55 core + 45 stack-specific + 1 marketing + 2 finance + 2 legal)
agents/         24 universal + 30 stack-specific agents
skills/         194 skills across 23 categories (42 marketing + 91 finance + 12 legal + others)
hooks/          42 hooks (39 js + 3 sh, incl. pm-task-check.js — PM, per-project)
templates/      CLAUDE.md composition + project-orchestration/ + per-stack settings and hook configs
commands/       33 global commands (PM, orchestration, quality, marketing, finance, legal)
tools/          External tool reference (vendored): marketing/ (CLIs + integrations)
tests/          Eval frameworks (vendored): finance-evals/ (grade_responses.py + iterations)
rules/          Language-specific coding rules
blocks/         Composition blocks (ADR 0008) — the unit a project opts into
scripts/        Setup and sync scripts (incl. sync-{marketing,finance,legal}-skills.sh)
schemas/        JSON Schema for blocks/*.yml, hooks.json and BUSINESS_RULES.yaml
```

Counters are checked against the tree by `node scripts/count-assets.mjs --check-docs`.

---

## How to Work in This Repo

Full procedures — what to create, in what order, and why each step exists —
are in **[`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md)**. Read the relevant
section before you start; the summaries below are reminders, not substitutes.

**Adding a new pattern.** Run `/add-pattern` (or `node scripts/new-pattern.mjs`)
rather than writing the file by hand — it generates the required sections,
validates tags against `blocks/_taxonomy.yml`, and creates the paired rule card.
The ✅/❌ "When to Use" bullets and the `**Tags**` line are required, not
decoration: they are the only things `retrieve_patterns` can filter on. Every
file needs at least one `## ` heading or the chunker produces nothing and the
pattern silently vanishes from the index. Finish with `./scripts/reseed-patterns.sh`
— an unseeded pattern is invisible to every agent that would use it.

**Promoting a project refactor to a pattern.** Default to
`**Scope**: project-specific` until a *second* independent project adopts the
same shape. Prose that sounds generalizable is not evidence of reuse.

**Adding or updating vendored skills** (marketing, finance, legal). These trees
are vendored copies — use `scripts/sync-*-skills.sh`, never hand-edit a
`SKILL.md` inside them. A skill you wrote yourself needs the
`<!-- LOCAL — not synced from upstream -->` marker under its frontmatter, or the
next sync deletes it. For legal, `--verify-licenses` runs first and aborts on
license drift; claude-patterns is MIT and cannot absorb AGPL.

**Adding an agent, skill, hook or template.** Each has a required frontmatter
shape and a registry to update, both checked by the CI validators in
`scripts/ci/`. Agents need explicit `disallowedTools`; hooks must always `exit 0`.

---

## Architecture Decisions

Rationale and alternatives rejected: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
and [`docs/adr/`](docs/adr/). The four that come up most often:

- **Symlinks, not npm packages** — edit once, every project sees it immediately. No publish cycle.
- **`TEAM-STATE.md`, not a database** — zero dependencies, works offline, git-tracked, readable by humans and agents.
- **Event-driven hooks (PostToolUse), not session-start** — tmux sessions run for weeks; session-start fires too rarely to be useful.
- **`tech-lead` and `product-owner` kept separate** — merging the two mental models produces analysis that is mediocre in both dimensions.

---

## Conventions

- **Never remove** something without checking all projects that symlink to it
- **Never rename** agents or skills without a deprecation notice
- **Always update** the README.md when adding new components
- **Always update** `CHANGELOG.md` and the `METADATA.yml` version
- **Test locally** before committing — changes propagate instantly via symlinks
- **Pattern files**: real production code as examples, not pseudocode
- **Agent files**: clear `disallowedTools` — explicit deny is safer than permissive
- **Language**: indexes and READMEs in English; decision records and design notes in Polish
- **Human-facing prose** (README, ADRs, `/analyze` open questions, task Goal/Findings
  summaries) — finish with the `humanizer` skill pass (`skills/quality/humanizer/`) before
  saving. Leave YAML/frontmatter, code, and machine-parsed fields untouched — see the
  skill's When to Use / Do NOT list.

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `README.md` | Main documentation + setup guide |
| `CHANGELOG.md` | Release history (Keep a Changelog) |
| `docs/CONTRIBUTING.md` | How to add a pattern, agent, skill, hook or template |
| `METADATA.yml` | Repository version + metadata |
| `docs/ARCHITECTURE.md` | Full architecture reference (3-layer model, override matrix, examples) |
| `docs/adr/` | Architecture Decision Records (rationale + alternatives rejected) |
| `docs/ROADMAP.md` | Implementation plan (sprintwise, status-tracked) |
| `agents/README.md` | Agent catalog + setup guide |
| `patterns/README.md` | Pattern index (105 patterns) |
| `blocks/README.md` | Composition blocks — what each one contributes |
| `hooks/hooks.json` | Global hook registry — applied to `~/.claude/settings.json` by `scripts/sync-global-hooks.mjs` (called from `setup-global.sh`; audit: `--check`). The `~/.claude/hooks/` symlink alone registers nothing. Per-project hooks take another route: blocks → `runtime.yml` → `scripts/sync-runtime-hooks.mjs` |
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
project/.claude/config/runtime.yml  ← materialized from blocks/ by setup-project.sh

project/project-orchestration/  ← copy of templates/project-orchestration/
    TEAM-STATE.md                ← local instance (not in claude-patterns)
    tasks/*.md                   ← local tasks (not in claude-patterns)
```

**The rule**: patterns, agents, skills, hooks, templates → claude-patterns.
Instance data (actual tasks, actual TEAM-STATE.md) → the project.

The PM dashboards under `project-orchestration/` in *this* repo are deliberately
unused — claude-patterns tracks its own work in `docs/tasks/`.
