# Global Claude Code Commands

**Location**: `~/.claude/commands/` -> `/opt/projects/claude-patterns/commands/`
**Commands**: 33 active

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

## Orchestration & Workflow (3)

| Command | Purpose | Model |
|---------|---------|-------|
| `/analyze` | Research/analiza sterowana blokami z runtime.yml (ADR 0008) | Sonnet |
| `/orchestrate` | Implementacja sterowana blokami z runtime.yml (ADR 0008) | Sonnet |
| `/scaffold` | Haiku template generator — fast boilerplate (60x cheaper) | Haiku |

Planowanie i TDD idą do ECC: `/ecc:plan`, skill `ecc:tdd-workflow` (plus `ecc:<lang>-test`
dla konkretnego języka) — patrz [ADR 0009](../docs/adr/0009-wynik-spike-fazy-0-i-lista-retire.md).

## Quality & Review (4)

| Command | Purpose | Model |
|---------|---------|-------|
| `/review-panel` | Multi-persona reviewer panel (16 agents), severity-graded report, incremental re-review | Sonnet |
| `/pr-ops` | List/triage open PRs, classify comments blocking/question/resolved (read-only) | Sonnet |
| `/api-schema-sync` | Cross-repo OpenAPI drift check: backend vs mobile/web consumers | Sonnet |
| `/build-fix` | Diagnose and fix TypeScript build errors with minimal changes | — |

Bramki jakości, przegląd jednoprzebiegowy i pokrycie testami idą do ECC:
`/ecc:quality-gate` (skill `ecc:verification-loop`), `/ecc:code-review`, `/ecc:test-coverage`.

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

## Session & Progress (2)

| Command | Purpose | Model |
|---------|---------|-------|
| `/progress` | Visual progress tracking — task status, completions, next actions | Haiku |
| `/checkpoint` | Handoff only: write `.claude/work/SESSION_STATE.md` for the next session | — |

Historia sesji i checkpointy gitowe idą do ECC: `/ecc:sessions` (`/ecc:save-session`,
`/ecc:resume-session`) oraz `/ecc:checkpoint` dla trybów `create`/`verify`/`list`.

## Learning System (3)

| Command | Purpose | Model |
|---------|---------|-------|
| `/blog` | Build-in-public blog scaffolding from git history + KANBAN.md + completed tasks | — |
| `/capture` | Capture an insight from the current conversation as a blog draft before it disappears | — |
| `/claude-updates` | Scan Claude Platform release notes for new features/models/deprecations since last check | — |

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

# Development workflow (ECC)
/ecc:plan implement auth module # plan before coding
/ecc:quality-gate               # run all quality gates

# Orchestration
/analyze TASK-123                     # analiza sterowana blokami
/orchestrate TASK-123                 # implementacja sterowana blokami
/scaffold dto CreateUser auth         # generate boilerplate
```

## Adding Commands

1. Create `commands/new-command.md` with YAML frontmatter
2. Commands auto-discovered by Claude Code via symlink
3. Frontmatter fields: `name`, `description`, `tools`, `model`

---

**Version**: 3.6.0
**Last Updated**: 2026-09-07
