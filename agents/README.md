# Global Claude Code Agents

**Purpose**: Reusable specialist and advisory agents for Claude Code projects.
**Total**: 9 universal + 14 stack-specific = 23 agents

---

## Agent Architecture

```
~/.claude/agents/              <- universal agents (global, all projects)
    backend-technology-expert.md  -> agents/universal/
    changelog-bot.md              -> agents/universal/
    marketing-strategist.md       -> agents/universal/
    project-orchestrator.md       -> agents/universal/
    security-privacy-architect.md -> agents/universal/
    state-reader.md               -> agents/universal/
    technical-architecture-lead.md -> agents/universal/
    tech-lead.md                  -> agents/universal/
    product-owner.md              -> agents/universal/

project/.claude/agents/        <- stack agents (per-project, via setup-project.sh)
    ddd-application-expert.md     -> agents/stacks/nestjs-ddd/
    ...
```

**Precedence**: Project agents override global agents of the same name.

---

## Universal Agents (9)

Linked globally to `~/.claude/agents/` via `setup-global.sh`.

### Orchestration (1)

| Agent | Purpose | Model | Writes Code |
|-------|---------|-------|-------------|
| **project-orchestrator** | Stack-aware orchestration: reads `project.yml`, resolves patterns + agent mapping per stack preset, delegates implement/validate/review sequentially, enforces Phase-4 verification gate | Opus | No |

Mirror of the `/orchestrate` skill, callable from `Task()` for async/delegated orchestration. Honors per-project overrides in `project.yml` under `project.orchestrator.overrides`.

### Cost-optimized utility (2)

| Agent | Purpose | Model | Writes Code |
|-------|---------|-------|-------------|
| **state-reader** | Read-only extraction from STATE.md / TEAM-STATE.md / KANBAN.md / TECH-DEBT.md / tasks/. Returns structured summaries — no synthesis, no judgment. | Haiku | No |
| **changelog-bot** | `git log` → CHANGELOG.md (Keep-a-Changelog format). Mechanical conversion using Conventional Commits prefixes. | Haiku | Yes (CHANGELOG.md only) |

Use these instead of running discovery/extraction in Sonnet/Opus context — 12-60× cheaper for bounded I/O work. Default delegation target for skills like `/task-health`, `/task-tidy`, `/pm-status`, `/changelog`.

### Advisory / PM (2)

| Agent | Purpose | Model | Writes Code |
|-------|---------|-------|-------------|
| **tech-lead** | Project health: blocked/stale tasks, debt, dependencies, critical path | Sonnet | No |
| **product-owner** | Business value: milestones, mobile UX, segment gaps, validation | Sonnet | No |

These agents power the PM system (`/pulse`, `/sprint`, etc.).
See `patterns/orchestration/project-management-system.md` for full docs.

### Specialists (3)

| Agent | Purpose | Model | Writes Code |
|-------|---------|-------|-------------|
| **backend-technology-expert** | Sync vs async, performance, tech stack decisions | Opus | No |
| **security-privacy-architect** | OWASP, GDPR, encryption, auth strategies | Opus | No |
| **technical-architecture-lead** | Infrastructure design, scalability, architecture decisions | Opus | No |

### Marketing (1)

| Agent | Purpose | Model | Writes Code |
|-------|---------|-------|-------------|
| **marketing-strategist** | Coordinator for 41 marketing skills (CRO, copy, SEO, paid, growth, RevOps). Enforces `product-marketing-context` before any deep analysis, routes tasks to the right skill in `skills/marketing/`. | Sonnet | No |

Powers the `/marketing` slash command. See `patterns/marketing/product-marketing-context-pattern.md` for the foundational context pattern.

---

## Stack-Specific Agents (15)

Linked per-project to `.claude/agents/` via `setup-project.sh`.

### nestjs-ddd (3)

| Agent | Purpose | Model | VETO |
|-------|---------|-------|------|
| **ddd-application-expert** | DDD patterns, bounded contexts, aggregate design | Sonnet | No |
| **code-quality-verifier** | DDD/CQRS quality verification, test pyramid | Sonnet | Yes |
| **security-e2e-verifier** | Security validation, OWASP, E2E coverage | Opus | Yes |

### flutter-clean-arch (3)

| Agent | Purpose | Model | VETO |
|-------|---------|-------|------|
| **flutter-architecture-expert** | Clean architecture, Riverpod patterns | Sonnet | No |
| **flutter-quality-verifier** | Flutter quality, layer purity | Sonnet | Yes |
| **flutter-ui-verifier** | UI/UX patterns, widget testing | Sonnet | Yes |

### nextjs-app (2)

| Agent | Purpose | Model | VETO |
|-------|---------|-------|------|
| **nextjs-architecture-expert** | App Router, RSC, data fetching patterns | Sonnet | No |
| **nextjs-quality-verifier** | Next.js quality, performance, SSR | Sonnet | Yes |

### sveltekit (2)

| Agent | Purpose | Model | VETO |
|-------|---------|-------|------|
| **sveltekit-architecture-expert** | SvelteKit 2, Svelte 5, runes, load functions | Sonnet | No |
| **sveltekit-quality-verifier** | SvelteKit quality, reactivity, SSR | Sonnet | Yes |

### python (2)

| Agent | Purpose | Model | VETO |
|-------|---------|-------|------|
| **python-architecture-expert** | Python architecture, layer purity, typing | Sonnet | No |
| **python-quality-verifier** | Python quality, testing, type coverage | Sonnet | Yes |

### typescript-library (2)

| Agent | Purpose | Model | VETO |
|-------|---------|-------|------|
| **library-api-guardian** | Public API surface, breaking changes, semver | Sonnet | Yes |
| **library-quality-verifier** | Library quality, tree-shaking, bundle size | Sonnet | Yes |

---

## Setup

### Global (universal agents)

```bash
cd ~/projects/claude-patterns
./scripts/setup-global.sh
# Creates per-file symlinks in ~/.claude/agents/
```

### Per-project (stack agents)

```bash
./scripts/setup-project.sh /path/to/project
# Reads project.yml stack_profile, links matching stack agents
```

### Project-specific override

Create `.claude/agents/agent-name.md` in your project to override a global agent.
Use case: add VETO power to `product-owner` for a specific project.

---

## Agent Frontmatter Schema

```yaml
---
name: agent-name
description: |
  Multi-line description used for agent selection.
tools: Read, Glob, Grep
disallowedTools: Write, Edit, Bash
model: opus|sonnet|haiku
effort: max|medium|low
memory: project
maxTurns: 15
---
```

---

**Version**: 3.1.0
**Last Updated**: 2026-04-03
**Agent Count**: 19 (5 universal + 14 stack-specific)
