# Global Claude Code Agents

**Purpose**: Reusable specialist and utility agents for Claude Code projects.

**Location**: Symlinked from `~/.claude/agents/` → `~/projects/claude-patterns/agents/`

---

## 📚 What Are Global Agents?

Global agents are **user-level** AI specialists available to ALL projects on your system. Unlike project-specific agents (in `.claude/agents/` within a project), global agents are shared across every Claude Code project you work on.

**Key Benefits**:
- ✅ **Write once, use everywhere** - Define agent behavior once
- ✅ **Consistent expertise** - Same specialist across all projects
- ✅ **Version control** - Track agent improvements over time
- ✅ **Sync across machines** - Git pull on new machine → agents work

---

## 🗂️ Agent Categories

### Specialists (4 agents)

Expert agents for strategic decisions and architecture guidance.

| Agent | Purpose | Model | When to Use |
|-------|---------|-------|-------------|
| **ddd-application-expert** | Domain-Driven Design specialist | Sonnet | Bounded context modeling, aggregate design, event storming, ubiquitous language |
| **backend-technology-expert** | Backend technology decisions | Opus | Sync vs async patterns, performance optimization, tech stack evaluation |
| **security-privacy-architect** | Security & privacy guidance | Opus | OWASP compliance, GDPR, encryption, authentication strategies |
| **technical-architecture-lead** | Technical architecture decisions | Opus | Technology stack evaluation, infrastructure design, scalability planning |

### Utilities (3 agents)

Fast, cost-optimized agents for common tasks.

| Agent | Purpose | Model | When to Use |
|-------|---------|-------|-------------|
| **codebase-explorer** | Fast codebase navigation | Haiku | Finding files, searching code, exploring structure (60x cheaper than Sonnet) |
| **schema-testing-agent** | Generate schema tests | Haiku | Creating comprehensive Zod schema tests using 6-category methodology |
| **test-scaffolder** | Generate test boilerplate | Haiku | Scaffolding unit/integration/E2E tests with proper patterns |

### Verifiers (2 agents)

Quality gate agents with VETO power for DDD/CQRS projects.

| Agent | Purpose | Model | VETO Power | When to Use |
|-------|---------|-------|------------|-------------|
| **code-quality-verifier** | DDD/CQRS quality verification | Sonnet | ✅ YES | Verify DDD patterns, CQRS implementation, test pyramid compliance |
| **security-e2e-verifier** | Security & E2E validation | Opus | ✅ YES | Final GO/NO-GO decision, OWASP compliance, E2E test coverage |

---

## 🚀 Setup (One-Time Per Machine)

### Step 1: Clone Repository

```bash
cd ~/projects
git clone <your-github-url> claude-patterns
```

### Step 2: Create Symlink

```bash
# Backup existing agents (if any)
if [ -d ~/.claude/agents ]; then
  mv ~/.claude/agents ~/.claude/agents.backup
fi

# Create symlink
ln -sf ~/projects/claude-patterns/agents ~/.claude/agents

# Verify
ls -la ~/.claude/
# Should show: agents -> /opt/projects/claude-patterns/agents
```

### Step 3: Restart Claude Code

Exit and re-enter any project. Global agents now available! ✅

---

## 📖 Usage

### Automatic (Claude Decides)

Claude Code automatically uses global agents when relevant:

```
User: "How should I design the UserProfile aggregate?"
Claude: [Automatically consults ddd-application-expert]
Claude: "Based on DDD patterns, UserProfile should..."
```

### Manual (Direct Invocation)

Use Task tool to invoke specific agent:

```
User: "Use ddd-application-expert to review this bounded context"
Claude: [Calls Task tool with subagent_type='ddd-application-expert']
```

### Cost Optimization

Utility agents (Haiku model) are **60x cheaper** than Sonnet/Opus:

```
# ❌ Expensive (Sonnet/Opus searching)
Grep("UserRepository", ...)

# ✅ Cheap (Haiku via codebase-explorer)
Task(subagent_type='Explore', prompt='Find UserRepository')
```

---

## 🔄 Updating Agents

### Edit Agent

```bash
cd ~/projects/claude-patterns/agents/specialists
vim ddd-application-expert.md
```

### Commit & Push

```bash
git add agents/
git commit -m "Improved DDD expert: added event storming guidance"
git push
```

### Sync on Other Machines

```bash
cd ~/projects/claude-patterns
git pull
# Symlink ensures all projects see update immediately
```

---

## 📝 Adding New Agents

### 1. Create Agent File

```bash
cd ~/projects/claude-patterns/agents

# Specialist (strategic decisions, complex reasoning)
vim specialists/new-expert.md

# Utility (fast, repetitive tasks)
vim utilities/new-utility.md
```

### 2. Agent Template

```markdown
# Agent Name

**Model**: sonnet|opus|haiku
**Purpose**: One-line description

## When to Use

- Bullet list of use cases

## Capabilities

- What this agent can do

## Examples

Concrete usage examples
```

### 3. Test Agent

```bash
# In any project
# Ask Claude to use the new agent
User: "Use new-expert to analyze X"
```

### 4. Commit

```bash
git add agents/
git commit -m "Add new-expert agent for Y domain"
git push
```

---

## 🎯 Agent Precedence

Claude Code loads agents in this order:

1. **Project agents** (`.claude/agents/` in project) - Highest priority
2. **Global agents** (`~/.claude/agents/` → symlink → this repo)
3. **Built-in agents** - Fallback

**Example Override**:
```
# Project-specific DDD expert
local-hero-3/.claude/agents/ddd-application-expert.md
  ↓ overrides ↓
# Global DDD expert
~/.claude/agents/ddd-application-expert.md (symlink → this repo)
```

Use case: Project needs specialized variant of global agent.

---

## 🧪 Testing Agents

### Verify Agent Loaded

```bash
# In Claude Code
User: "List available agents"

# Should see global agents:
# - ddd-application-expert
# - backend-technology-expert
# - security-privacy-architect
# - codebase-explorer
# - schema-testing-agent
# - test-scaffolder
```

### Test Agent Invocation

```bash
# Direct test
User: "@codebase-explorer Find all aggregates in src/"

# Should return: List of aggregate files
```

---

## 📊 Model Distribution Strategy

**Cost-optimized model assignments**:

| Role Type | Model | Rationale |
|-----------|-------|-----------|
| **Strategic/Security** | Opus | Critical decisions requiring deep reasoning |
| **Domain Specialists** | Sonnet | Domain expertise with good comprehension |
| **Utilities/Search** | Haiku | Read-only, pattern matching = **60x savings** |

**Expected savings**: 15-20% of total costs by routing simple tasks to Haiku agents.

---

## 🐛 Troubleshooting

### Symlink Not Working

**Symptom**: Agents not appearing in Claude Code

**Solution**:
```bash
# Verify symlink exists
ls -la ~/.claude/agents

# Should show symlink target:
# agents -> /opt/projects/claude-patterns/agents

# If broken, recreate:
rm ~/.claude/agents
ln -sf ~/projects/claude-patterns/agents ~/.claude/agents
```

### Agent Not Loading

**Symptom**: Specific agent not available

**Solution**:
```bash
# Verify agent file exists
ls ~/projects/claude-patterns/agents/specialists/
ls ~/projects/claude-patterns/agents/utilities/

# Check file is valid markdown
head ~/projects/claude-patterns/agents/specialists/ddd-application-expert.md

# Restart Claude Code
```

### Agent Outdated

**Symptom**: Agent behavior doesn't match recent updates

**Solution**:
```bash
# Pull latest changes
cd ~/projects/claude-patterns
git pull

# Restart Claude Code (agents reload)
```

---

## 📚 References

**Source Projects**:
- Extracted from LocalHero v3 production codebase
- Agents validated across 6 bounded contexts
- Proven in 1355+ tests

**Related Documentation**:
- Main README: `../README.md`
- Commands: `../commands/README.md`
- Patterns: `../patterns/`

**External Resources**:
- [Claude Code Agent Documentation](https://docs.anthropic.com/claude-code/agents)
- [Agent Best Practices](https://docs.anthropic.com/claude-code/agents/best-practices)

---

**Version**: 1.0.0
**Created**: 2026-02-05
**Last Updated**: 2026-02-05
**Maintained By**: LocalHero Team
**Agent Count**: 6 (3 specialists + 3 utilities)
