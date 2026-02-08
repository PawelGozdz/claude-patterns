# Global Claude Code Commands

**Location**: `~/.claude/commands/` -> `~/projects/claude-patterns/commands/`

## Available Commands (3)

| Command | Purpose | Notes |
|---------|---------|-------|
| `/o` | Quick orchestration alias | Routes to implement/search/analyze/validate/review |
| `/scaffold` | Generate boilerplate (Haiku) | 9 types, 60x cheaper than Opus |
| `/progress` | Visual progress tracking | Reads STATE.md, shows status |

## Usage

```bash
/o find all aggregates          # search mode
/o implement UserProfile        # implement mode (full workflow)
/scaffold dto CreateUser auth   # generate DTO boilerplate
/progress                       # show current status
```

## Deprecated Commands

Archived in `commands/deprecated/`. These were consolidated into `/o`:
- `/orchestrate`, `/hero-orchestrate` -> `/o`
- `/validate`, `/workflow`, `/knowledge`, `/agent-registry` -> `/o` modes
- Various utility commands -> `/o` modes

## Adding Commands

1. Create `commands/new-command.md`
2. Commands auto-discovered by Claude Code via symlink

---

**Version**: 2.0.0 (Phase A consolidation)
**Commands**: 3 active, 15+ archived
