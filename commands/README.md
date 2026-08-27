# Global Claude Code Commands

**Location**: `~/.claude/commands/` -> `~/projects/claude-patterns/commands/`
**Commands**: 45 active

---

## Project Management (8)

| Command | Purpose | Model |
|---------|---------|-------|
| `/pulse` | Full team standup: run @tech-lead + @product-owner, update TEAM-STATE.md | Sonnet |
| `/pm-status` | Quick PM briefing — reads TEAM-STATE.md only, no agents (~$0) | Haiku |
| `/sprint` | Interactive sprint planning with both advisory agents | Sonnet |
| `/reprioritize` | Priority advisor: promote, demote, cut, or add tasks — dual agent perspective | Sonnet |
| `/task-health` | Deep task audit: broken deps, stuck tasks, orphaned items | Sonnet |
| `/tech-debt` | Tech debt report: aggregate, trend, prioritize, update TECH-DEBT.md | Sonnet |
| `/adr` | Create an Architecture Decision Record for a decision just made | — |
| `/task-tidy` | Task housekeeping: move done tasks, fix missing fields, validate YAML (non-destructive, previews first) | — |

## Orchestration & Workflow (4)

| Command | Purpose | Model |
|---------|---------|-------|
| `/orchestrate` | Unified orchestration (search/implement/validate/analyze/review) | Sonnet |
| `/analyze` | Research/analiza sterowana blokami z runtime.yml (ADR 0008, pilot) | Sonnet |
| `/orchestrate` | Implementacja sterowana blokami z runtime.yml (ADR 0008, pilot; w F6 zastąpi /orchestrate) | Sonnet |
| `/plan` | Restate requirements, assess risks, create implementation plan | — |
| `/tdd` | Test-driven development: interfaces -> tests -> minimal implementation | — |
| `/scaffold` | Haiku template generator — fast boilerplate (60x cheaper) | Haiku |

## Quality & Review (7)

| Command | Purpose | Model |
|---------|---------|-------|
| `/verify` | Run quality gates: typecheck, lint, test, build, coverage | — |
| `/code-review` | Structured code review with severity levels | — |
| `/review-panel` | Multi-persona reviewer panel (16 agents), severity-graded report, incremental re-review | Sonnet |
| `/pr-ops` | List/triage open PRs, classify comments blocking/question/resolved (read-only) | Sonnet |
| `/api-schema-sync` | Cross-repo OpenAPI drift check: backend vs mobile/web consumers | Sonnet |
| `/build-fix` | Diagnose and fix TypeScript build errors with minimal changes | — |
| `/test-coverage` | Analyze test coverage gaps prioritized by business criticality | — |

## Security (5)

| Command | Purpose | Model |
|---------|---------|-------|
| `/security-check` | Quick ad-hoc security audit on isolated code changes (lighter than `/security-review`) | — |
| `/security-review` | Complete STRIDE + DREAD + LINDDUN security review for NestJS-DDD code | — |
| `/threat-model` | Interactive STRIDE + DREAD + LINDDUN threat modeling, generates `TM-{TASK-ID}.md` | — |
| `/incident` | Incident response triage — use only when a CRITICAL issue affects deployed code | — |
| `/conformance-check` | Deterministic AST audit of pattern conformance (hard-rule + majority-outlier), no RAG | — |

## Business Strategy (3)

| Command | Purpose | Model |
|---------|---------|-------|
| `/finance` | Entry point for finance tasks — routes to `skills/finance/` via `@finance-strategist` | Sonnet |
| `/marketing` | Entry point for marketing tasks — routes to `skills/marketing/` via `@marketing-strategist` | Sonnet |
| `/legal` | Entry point for legal tasks — routes to `skills/legal/` via `@legal-strategist` (jurisdiction-aware) | Sonnet |

## Grant-flow Integration (2)

| Command | Purpose | Model |
|---------|---------|-------|
| `/grantflow` | Manage grant-flow: setup credentials, list projects, map repos, history, diagnostics | — |
| `/log-time` | Log work hours to grant-flow — use at the end of each session | — |

## Session & Progress (3)

| Command | Purpose | Model |
|---------|---------|-------|
| `/progress` | Visual progress tracking — task status, completions, next actions | Haiku |
| `/sessions` | List and manage Claude Code session history with pagination | — |
| `/checkpoint` | Save session state snapshot for cross-session continuity | — |

## Learning System (7)

| Command | Purpose | Model |
|---------|---------|-------|
| `/instinct-status` | Show all learned instincts with confidence levels | — |
| `/instinct-export` | Export instincts for sharing with teammates | — |
| `/instinct-import` | Import instincts from teammates or other sources | — |
| `/evolve` | Cluster related instincts into skills, commands, or agents | — |
| `/blog` | Build-in-public blog scaffolding from git history + KANBAN.md + completed tasks | — |
| `/capture` | Capture an insight from the current conversation as a blog draft before it disappears | — |
| `/claude-updates` | Scan Claude Platform release notes for new features/models/deprecations since last check | — |

## Cross-instance broadcast (2)

| Command | Purpose | Model |
|---------|---------|-------|
| `/broadcast` | Nadaj/przeczytaj wpis w kanale między instancjami, ACK, claim (ADR 0006) | Haiku |
| `/broadcast-status` | Raport kanału: wpisy bez claimu, martwe topiki, rozjazd manifestów (~$0) | Haiku |

Wymaga `.claude/config/broadcast.yml` w projekcie (plik nieśledzony). Bez niego oba
polecenia mówią wprost, że broadcast jest tu wyłączony — i to jest stan domyślny.

## Infrastructure (3)

| Command | Purpose | Model |
|---------|---------|-------|
| `/pm2` | Configure PM2 process manager for Node.js application | — |
| `/skill-create` | Analyze git history to extract patterns and generate SKILL.md | — |
| `/cost-report` | Pull a usage/cost report from Claude Code Analytics API (per-model spend, daily/weekly) | — |

---

## Usage Examples

```bash
# PM system
/pm-status                      # quick state check (~$0)
/pulse                          # full team sync (~$0.10)
/sprint                         # plan next sprint (~$0.20)
/reprioritize                   # what to promote/demote/cut (~$0.20)

# Development workflow
/plan implement auth module     # plan before coding
/tdd UserService                # test-first development
/verify                         # run all quality gates

# Orchestration
/orchestrate find all aggregates      # search mode
/orchestrate implement UserProfile    # implement mode
/scaffold dto CreateUser auth         # generate boilerplate
```

## Adding Commands

1. Create `commands/new-command.md` with YAML frontmatter
2. Commands auto-discovered by Claude Code via symlink
3. Frontmatter fields: `name`, `description`, `tools`, `model`

---

**Version**: 3.1.0
**Last Updated**: 2026-04-03
