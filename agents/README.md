# Global Claude Code Agents

**Purpose**: Reusable specialist and advisory agents for Claude Code projects.
**Total**: 26 universal + 30 stack-specific = 56 agents

---

## Agent Architecture

```
~/.claude/agents/              <- universal agents (global, all projects)
    backend-technology-expert.md  -> agents/universal/
    changelog-bot.md              -> agents/universal/
    finance-strategist.md         -> agents/universal/
    legal-strategist.md           -> agents/universal/
    marketing-strategist.md       -> agents/universal/
    project-orchestrator.md       -> agents/universal/
    security-privacy-architect.md -> agents/universal/
    state-reader.md               -> agents/universal/
    tech-lead.md                  -> agents/universal/
    product-owner.md              -> agents/universal/

project/.claude/agents/        <- stack agents (per-project, via setup-project.sh)
    ddd-application-expert.md     -> agents/stacks/nestjs-ddd/
    ...
```

**Precedence**: Project agents override global agents of the same name.

---

## Universal Agents (26)

Linked globally to `~/.claude/agents/` via `setup-global.sh`.

### Orchestration (1)

| Agent | Purpose | Model | Writes Code |
|-------|---------|-------|-------------|
| **project-orchestrator** | Composition-driven orchestration: reads `.claude/config/runtime.yml` for layers, agent slots and pattern selection, runs the implement→verify loop per layer, enforces the final gate | Sonnet | No |

Mirror of the `/orchestrate` command, callable from `Task()` for async/delegated orchestration. Everything stack-specific comes from the project's `stack_blocks:` composition (ADR 0008).

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

### Specialists (2)

| Agent | Purpose | Model | Writes Code |
|-------|---------|-------|-------------|
| **backend-technology-expert** | Sync vs async, performance, tech stack decisions | Opus | No |
| **security-privacy-architect** | OWASP, GDPR, encryption, auth strategies | Opus | No |

### Marketing, Finance & Legal Strategy (3)

| Agent | Purpose | Model | Writes Code |
|-------|---------|-------|-------------|
| **marketing-strategist** | Coordinator for 41 marketing skills (CRO, copy, SEO, paid, growth, RevOps). Enforces `product-marketing-context` before any deep analysis, routes tasks to the right skill in `skills/marketing/`. | Sonnet | No |
| **finance-strategist** | Coordinator for 84 finance skills (investment, compliance, advisory, trading, ops, data). Plugin-aware (7 plugins with dependency graph). Data-driven hedged recommendations with contextual disclaimers. | Sonnet | No |
| **legal-strategist** | Coordinator for 12 vendored legal skills (1 MIT + 11 Apache 2.0) + catalog of 30 external skills (mostly AGPL — install per-project per their license). Jurisdiction-aware (PL/EU/US/FR/UK), 4-category contextual disclaimers, refuses to fabricate jurisdiction-specific content. | Sonnet | No |

Powers `/marketing`, `/finance`, `/legal` slash commands. All three agents
are **automatically consulted by `@product-owner`** during strategic work
(roadmaps, sprints, milestones, pricing, regulatory exposure, contracts) —
see `patterns/marketing/product-marketing-context-pattern.md`,
`patterns/finance/regulatory-disclaimer-pattern.md`, and
`patterns/legal/jurisdiction-aware-disclaimer-pattern.md` for architecture.

### Code Review Panel (16)

Persona-based reviewers dispatched in parallel by the `review-panel` skill (`/review-panel`).
Each agent is advisory-only (`Writes Code: No` — the skill applies approved fixes itself via
`Edit`, agents only return findings) and enforces a mandatory verification step before flagging
anything missing or wrong, to keep false-positive rate low.

| Agent | Purpose | Model | Writes Code |
|-------|---------|-------|-------------|
| **reviewer-eagle** | Architecture, module boundaries, abstraction quality | Sonnet | No |
| **reviewer-security** | Injection, authz/authn, secrets, PII exposure | Sonnet | No |
| **reviewer-performance** | N+1 queries, blocking I/O, algorithmic complexity | Sonnet | No |
| **reviewer-user** | Loading/error/empty states, a11y, i18n, confusing flows | Sonnet | No |
| **reviewer-nitpicker** | Naming, formatting, dead code — deliberately low-severity | Sonnet | No |
| **reviewer-newbie** | Readability/cognitive load for someone new to the code | Sonnet | No |
| **reviewer-skeptic** | Race conditions, null/edge-case assumptions | Sonnet | No |
| **reviewer-pragmatist** | Production-blocker baseline — always included in the panel | Sonnet | No |
| **reviewer-money** | Financial/numeric calculations, rounding, currency | Sonnet | No |
| **reviewer-compatibility** | Breaking API/schema changes, consumer contracts | Sonnet | No |
| **reviewer-compliance** | PII/regulated-data exposure, retention, audit trails | Sonnet | No |
| **reviewer-tester** | Test quality (not just coverage), flaky/snapshot-abuse patterns | Sonnet | No |
| **reviewer-ops** | Logging, error handling, config/env, migration/rollback safety | Sonnet | No |
| **reviewer-product** | Requirement/acceptance-criteria fit, ambiguity flagging | Sonnet | No |
| **reviewer-champion** | Only positive reviewer — praises good patterns worth repeating | Sonnet | No |
| **reviewer-professor** | Subtle language/runtime bugs (closures, async, coercion), explains why | Sonnet | No |

Skill: `skills/quality/review-panel/SKILL.md` · Command: `/review-panel` · Pattern:
`patterns/cross-layer/snapshot-incremental-review-pattern.md`

---

## Stack-Specific Agents (30)

Linked per-project to `.claude/agents/` via `setup-project.sh`.

### python-ml (2)

For Python ML inference services (FastAPI + PyTorch on a shared GPU).

| Agent | Purpose | Model | VETO |
|-------|---------|-------|------|
| **ml-inference-architect** | Model lifecycle, VRAM budget, batching strategy, serving runtime | Sonnet | No |
| **gpu-resource-verifier** | Event-loop safety, VRAM lifecycle, thread safety, batching correctness | Sonnet | Yes |

### nestjs-ddd (8)

| Agent | Purpose | Model | VETO |
|-------|---------|-------|------|
| **ddd-application-expert** | DDD patterns, bounded contexts, aggregate design | Sonnet | No |
| **code-quality-verifier** | DDD/CQRS quality verification, test pyramid | Sonnet | Yes |
| **security-e2e-verifier** | Security validation, OWASP, E2E coverage | Opus | Yes |
| **sql-postgres-optimizer** | Repository query review — EXPLAIN-backed index/rewrite recommendations, consulted by `@infrastructure-implementer` before any non-trivial query ships | Sonnet | No |
| **business-rules-auditor** | `@BusinessRule` decorator coverage audit (Specs/Policies mandatory, Aggregates/Handlers via litmus test) — advisory, cross-references `BUSINESS_RULES.yaml` | Sonnet | No |
| **implementers/domain-application-implementer** | Auto-triggered for aggregate/value-object/domain-event/command-handler/CQRS keywords — implements domain + application layers | Sonnet | No |
| **implementers/infrastructure-implementer** | Implements Infrastructure/API layer (controllers, Zod schemas, repos, external adapters); hands tests to `@test-implementer` | Sonnet | No |
| **implementers/test-implementer** | Owns the entire test pyramid (L1/L2/L3) across ALL layers, not just its own code, plus load/performance test authoring | Sonnet | No |

### flutter-clean-arch (7)

| Agent | Purpose | Model | VETO |
|-------|---------|-------|------|
| **flutter-implementer** | Implements domain/(application)/data/presentation layers | Sonnet | No |
| **flutter-architecture-expert** | Clean architecture, Riverpod patterns | Sonnet | No |
| **flutter-quality-verifier** | Flutter quality, layer purity | Sonnet | Yes |
| **flutter-ui-verifier** | UI/UX patterns, widget testing | Sonnet | Yes |
| **flutter-ux-designer** | Designs the screen BEFORE code exists — advisory, `/analyze` panel participant, produces a screen spec (structure, states, a11y) | Sonnet | No |
| **flutter-security-verifier** | Mobile-specific security: secret storage, certificate pinning, and related mobile attack surface | Sonnet | Yes |
| **flutter-performance-verifier** | Widget rebuild scope, Riverpod provider granularity, build() cost, main-thread work — advisory, no VETO | Sonnet | No |

### node-ts-claude-api (3)

For messaging-agnostic Node.js/TypeScript bot architectures (core/ + mcp-servers/ separation).

| Agent | Purpose | Model | VETO |
|-------|---------|-------|------|
| **ts-implementer** | Implements core/ modules: router, safety, memory, personas, observability | Sonnet | No |
| **safety-reviewer** | Enforces the 7 non-negotiable safety invariants before merge | Sonnet | Yes |
| **architecture-verifier** | Enforces the core architectural boundary — `core/` and `mcp-servers/` must never cross improperly | Haiku | Yes |

### astro-static (2)

For Astro 5 static blog / AI-first content projects.

| Agent | Purpose | Model | VETO |
|-------|---------|-------|------|
| **astro-implementer** | Content Collections schema updates, Astro components, static blog implementation | Sonnet | No |
| **content-reviewer** | Blog content review: Zod frontmatter schema compliance, brand voice rules | Haiku | No |

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
# Reads stack_blocks: from project.yml, links the agents those blocks name
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

**Version**: 3.6.0
**Last Updated**: 2026-08-27
**Agent Count**: 56 (26 universal + 30 stack-specific)
