# Global Claude Code Commands

**Location**: `~/.claude/commands/` -> `~/projects/claude-patterns/commands/`
**Commands**: 23 active

---

## Project Management (6)

| Command | Purpose | Model |
|---------|---------|-------|
| `/pulse` | Full team standup: run @tech-lead + @product-owner, update TEAM-STATE.md | Sonnet |
| `/pm-status` | Quick PM briefing — reads TEAM-STATE.md only, no agents (~$0) | Haiku |
| `/sprint` | Interactive sprint planning with both advisory agents | Sonnet |
| `/reprioritize` | Priority advisor: promote, demote, cut, or add tasks — dual agent perspective | Sonnet |
| `/task-health` | Deep task audit: broken deps, stuck tasks, orphaned items | Sonnet |
| `/tech-debt` | Tech debt report: aggregate, trend, prioritize, update TECH-DEBT.md | Sonnet |

## Orchestration & Workflow (4)

| Command | Purpose | Model |
|---------|---------|-------|
| `/orchestrate` | Unified orchestration (search/implement/validate/analyze/review) | Sonnet |
| `/plan` | Restate requirements, assess risks, create implementation plan | — |
| `/tdd` | Test-driven development: interfaces -> tests -> minimal implementation | — |
| `/scaffold` | Haiku template generator — fast boilerplate (60x cheaper) | Haiku |

## Quality & Review (4)

| Command | Purpose | Model |
|---------|---------|-------|
| `/verify` | Run quality gates: typecheck, lint, test, build, coverage | — |
| `/code-review` | Structured code review with severity levels | — |
| `/build-fix` | Diagnose and fix TypeScript build errors with minimal changes | — |
| `/test-coverage` | Analyze test coverage gaps prioritized by business criticality | — |

## Session & Progress (3)

| Command | Purpose | Model |
|---------|---------|-------|
| `/progress` | Visual progress tracking — task status, completions, next actions | Haiku |
| `/sessions` | List and manage Claude Code session history with pagination | — |
| `/checkpoint` | Save session state snapshot for cross-session continuity | — |

## Learning System (4)

| Command | Purpose | Model |
|---------|---------|-------|
| `/instinct-status` | Show all learned instincts with confidence levels | — |
| `/instinct-export` | Export instincts for sharing with teammates | — |
| `/instinct-import` | Import instincts from teammates or other sources | — |
| `/evolve` | Cluster related instincts into skills, commands, or agents | — |

## Infrastructure (2)

| Command | Purpose | Model |
|---------|---------|-------|
| `/pm2` | Configure PM2 process manager for Node.js application | — |
| `/skill-create` | Analyze git history to extract patterns and generate SKILL.md | — |

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
