# Global Claude Code Commands

**Purpose**: Reusable slash commands (skills) for Claude Code projects.

**Location**: Symlinked from `~/.claude/commands/` → `~/projects/claude-patterns/commands/`

---

## 📚 What Are Global Commands?

Global commands (also called "skills" or "slash commands") are **user-level** reusable workflows available to ALL projects on your system. Unlike project-specific commands, global commands work across every Claude Code project.

**Key Benefits**:
- ✅ **Consistent workflows** - Same commands across all projects
- ✅ **Version control** - Track command improvements over time
- ✅ **Sync across machines** - Git pull on new machine → commands work
- ✅ **Single source of truth** - Update once, available everywhere

---

## 🗂️ Available Commands

### `/orchestrate` - Smart Task Orchestrator

**Purpose**: Intelligent routing - analyzes request and delegates to appropriate agent(s)

**Model**: Sonnet (coordination only, no implementation)

**Usage**:
```bash
# Questions
/orchestrate Jak powinna wyglądać granica aggregatu UserProfile?

# Task analysis
/orchestrate Przeanalizuj task TS-GEO-005.md

# Problem solving
/orchestrate Znajdź najlepsze rozwiązanie dla notifications

# Implementation (triggers full workflow)
/orchestrate Zaimplementuj UserProfile aggregate

# Code review
/orchestrate Oceń jakość implementacji TS-AUTH-015
```

**How it works**:
1. Analyzes your request (keywords, intent, domain)
2. Routes to appropriate agent(s):
   - Domain/DDD questions → @ddd-application-expert
   - Tech questions → @backend-technology-expert
   - Security questions → @security-privacy-architect
   - Code search → @codebase-explorer
   - Implementation → Full 11-step workflow
3. Reports results back

**Key Feature**: NEVER implements code - ONLY delegates (has NO Write/Edit tools)

---

### `/scaffold` - Haiku Template Generator

**Purpose**: Generate boilerplate code using Haiku model for massive cost savings (60x cheaper)

**Model**: Haiku (cost-optimized)

**Usage**: `/scaffold <type> <name> [context]`

**Supported Types**:

| Type | Coverage | Example |
|------|----------|---------|
| `dto` | 80-90% | `/scaffold dto CreateUserProfile auth` |
| `query-dto` | 80-90% | `/scaffold query-dto UserProfileList auth` |
| `event` | 70-80% | `/scaffold event UserRegistered auth` |
| `integration-event` | 70-80% | `/scaffold integration-event TrustDelta geographic-auth` |
| `value-object` | 75-85% | `/scaffold value-object CommentContent engagement` |
| `specification` | 55-65% | `/scaffold specification AddressCooldown geographic-auth` |
| `handler` | 40-50% | `/scaffold handler CreateUser auth` |
| `query-handler` | 50-60% | `/scaffold query-handler GetUserProfile auth` |
| `test` | 60-70% | `/scaffold test UserProfile auth` |

**Cost Savings**: ~$12/month at 265 scaffolds (vs Opus)

**How it works**:
1. Loads relevant pattern from patterns repository
2. Generates boilerplate following pattern conventions
3. Returns code ready for customization
4. Uses Haiku model (60x cheaper than Sonnet/Opus)

---

## 🚀 Setup (One-Time Per Machine)

### Step 1: Clone Repository

```bash
cd ~/projects
git clone <your-github-url> claude-patterns
```

### Step 2: Create Symlink

```bash
# Backup existing commands (if any)
if [ -d ~/.claude/commands ]; then
  mv ~/.claude/commands ~/.claude/commands.backup
fi

# Create symlink
ln -sf ~/projects/claude-patterns/commands ~/.claude/commands

# Verify
ls -la ~/.claude/
# Should show: commands -> /home/node/projects/claude-patterns/commands
```

### Step 3: Restart Claude Code

Exit and re-enter any project. Global commands now available! ✅

---

## 📖 Usage

### In Claude Code

Commands are invoked with `/` prefix:

```bash
# Orchestrate task
/orchestrate Create user authentication system

# Scaffold boilerplate
/scaffold dto CreateUser auth
```

### Tab Completion

Claude Code provides tab completion for commands:

```bash
/orc<TAB>  # Completes to /orchestrate
/sca<TAB>  # Completes to /scaffold
```

### Help

```bash
# Get command help
/orchestrate --help
/scaffold --help
```

---

## 🔄 Updating Commands

### Edit Command

```bash
cd ~/projects/claude-patterns/commands
vim orchestrate.md
```

### Commit & Push

```bash
git add commands/
git commit -m "Improved orchestrate: added architecture routing"
git push
```

### Sync on Other Machines

```bash
cd ~/projects/claude-patterns
git pull
# Symlink ensures all projects see update immediately
```

---

## 📝 Adding New Commands

### 1. Create Command File

```bash
cd ~/projects/claude-patterns/commands
vim new-command.md
```

### 2. Command Template

```markdown
# Command Name

**Model**: sonnet|opus|haiku
**Purpose**: One-line description

## Usage

\`\`\`bash
/command-name <arg1> [optional-arg]
\`\`\`

## Arguments

- `arg1`: Description
- `optional-arg`: Description (optional)

## Examples

\`\`\`bash
# Example 1
/command-name value1

# Example 2
/command-name value1 value2
\`\`\`

## How It Works

1. Step 1
2. Step 2
3. Step 3

## Output

Description of what user receives
```

### 3. Register Command

Commands in `~/.claude/commands/` are auto-discovered by Claude Code.

### 4. Test Command

```bash
# In any project
/new-command test-arg
```

### 5. Commit

```bash
git add commands/
git commit -m "Add new-command for X workflow"
git push
```

---

## 🎯 Command Precedence

Claude Code loads commands in this order:

1. **Project commands** (`.claude/commands/` in project) - Highest priority
2. **Global commands** (`~/.claude/commands/` → symlink → this repo)
3. **Built-in commands** - Fallback

**Example Override**:
```
# Project-specific scaffold
local-hero-3/.claude/commands/scaffold.md
  ↓ overrides ↓
# Global scaffold
~/.claude/commands/scaffold.md (symlink → this repo)
```

Use case: Project needs specialized variant of global command.

---

## 🧪 Testing Commands

### Verify Command Loaded

```bash
# In Claude Code
User: "List available commands"

# Or type:
/<TAB>

# Should see global commands:
# - /orchestrate
# - /scaffold
```

### Test Command Execution

```bash
# Simple test
/scaffold dto TestDto auth

# Should return: Generated DTO boilerplate
```

---

## 📊 Command vs Agent

**When to use Command**:
- ✅ Fixed workflow (same steps every time)
- ✅ User-triggered (explicit invocation via `/command`)
- ✅ Templated output (boilerplate, scaffolding)

**When to use Agent**:
- ✅ Dynamic reasoning (adapts to context)
- ✅ Auto-triggered (Claude decides when to use)
- ✅ Complex analysis (multi-step investigation)

**Example**:
- `/scaffold dto CreateUser auth` → Command (fixed workflow)
- "Design UserProfile aggregate" → Agent (dynamic reasoning via ddd-application-expert)

---

## 🐛 Troubleshooting

### Symlink Not Working

**Symptom**: Commands not appearing in Claude Code

**Solution**:
```bash
# Verify symlink exists
ls -la ~/.claude/commands

# Should show symlink target:
# commands -> /home/node/projects/claude-patterns/commands

# If broken, recreate:
rm ~/.claude/commands
ln -sf ~/projects/claude-patterns/commands ~/.claude/commands
```

### Command Not Loading

**Symptom**: Specific command not available

**Solution**:
```bash
# Verify command file exists
ls ~/projects/claude-patterns/commands/

# Check file is valid markdown
head ~/projects/claude-patterns/commands/orchestrate.md

# Restart Claude Code
```

### Command Outdated

**Symptom**: Command behavior doesn't match recent updates

**Solution**:
```bash
# Pull latest changes
cd ~/projects/claude-patterns
git pull

# Restart Claude Code (commands reload)
```

### Tab Completion Not Working

**Symptom**: `/orc<TAB>` doesn't complete

**Solution**:
- Restart Claude Code
- Verify symlink is correct
- Check command file name matches (e.g., `orchestrate.md` for `/orchestrate`)

---

## 📚 References

**Source Projects**:
- Extracted from LocalHero v3 production workflows
- Commands validated across 6 bounded contexts
- Proven cost savings: $12/month at 265 scaffolds

**Related Documentation**:
- Main README: `../README.md`
- Agents: `../agents/README.md`
- Patterns: `../patterns/`

**External Resources**:
- [Claude Code Skills Documentation](https://docs.anthropic.com/claude-code/skills)
- [Skill Best Practices](https://docs.anthropic.com/claude-code/skills/best-practices)

---

**Version**: 1.0.0
**Created**: 2026-02-05
**Last Updated**: 2026-02-05
**Maintained By**: LocalHero Team
**Command Count**: 2 (orchestrate, scaffold)
