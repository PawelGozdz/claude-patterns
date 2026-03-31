# Global Claude Code Patterns Repository

**Version**: 3.0.0
**Created**: 2026-02-05
**Updated**: 2026-03-30
**Purpose**: Reusable DDD/CQRS patterns + universal agent templates for multi-project use

---

## 📚 What Is This?

A **single source of truth** for production-tested software patterns and agent templates that can be shared across multiple Claude Code projects.

**Three Distribution Systems**:
1. **MCP Server** (`.mcp.json` per project) - Pattern delivery to Claude Code
2. **Filesystem Symlinks** (Global agents/commands/hooks) - Universal resources
3. **Stack Presets** (Settings templates) - Per-stack hooks, autoMode, worktree config

**Key Benefits**:
- ✅ **Write once, use everywhere** - No pattern duplication
- ✅ **Instant updates** - Change once, all projects see it immediately
- ✅ **Consistency** - Same patterns = consistent AI agent behavior
- ✅ **Multi-project support** - Works across different projects, not just multiple folders
- ✅ **Proven quality** - Extracted from LocalHero production codebase (1355+ tests)
- ✅ **Stack presets** - DDD hooks only in NestJS, Flutter hooks only in Flutter
- ✅ **Native integration** - .claude/rules/ auto-discovery, @import directives, worktree config

---

## 🏗️ Repository Structure

```
~/projects/claude-patterns/
├── README.md                    # This file
├── METADATA.yml                 # Repository metadata
├── .gitignore                   # Git exclusions
├── patterns/                    # Generic patterns (33 total + README)
│   ├── README.md                # Pattern index & usage guide
│   ├── domain/                  # Domain layer (6 patterns)
│   │   ├── aggregate-pattern.md
│   │   ├── value-object-pattern.md
│   │   ├── domain-event-pattern.md
│   │   ├── entity-pattern.md
│   │   ├── specification-policy-pattern.md
│   │   ├── domain-service-pattern.md
│   │   └── METADATA.yml
│   ├── application/             # Application layer (4 patterns)
│   │   ├── command-handler-pattern.md
│   │   ├── query-handler-pattern.md
│   │   ├── application-service-pattern.md
│   │   ├── audit-handler-pattern.md
│   │   └── METADATA.yml
│   ├── infrastructure/          # Infrastructure layer (4 patterns)
│   │   ├── repository-pattern.md
│   │   ├── repository-events-pattern.md
│   │   ├── mapper-pattern.md
│   │   ├── controller-schema-pattern.md
│   │   └── METADATA.yml
│   ├── architecture/            # Architecture patterns (8 patterns)
│   │   ├── dual-identity-pattern.md
│   │   ├── transactional-pattern.md
│   │   ├── fresh-context-pattern.md
│   │   ├── acl-registry-pattern.md
│   │   ├── user-projection-pattern.md
│   │   ├── bullmq-queue-pattern.md
│   │   ├── integration-event-pattern.md
│   │   ├── entity-event-emission-pattern.md
│   │   └── METADATA.yml
│   ├── testing/                 # Testing patterns (7 patterns)
│   │   ├── testing-pyramid-pattern.md
│   │   ├── schema-testing-pattern.md
│   │   ├── context-isolation-pattern.md
│   │   ├── e2e-hybrid-fixture-pattern.md
│   │   ├── test-seeding-performance-guide.md
│   │   ├── rate-limit-testing-pattern.md
│   │   ├── redis-test-isolation-pattern.md
│   │   └── METADATA.yml
│   └── cross-layer/             # Cross-layer patterns (4 patterns)
│       ├── domain-errors-pattern.md
│       ├── logger-pattern.md
│       ├── error-handler-chain-pattern.md
│       ├── conventions-pattern.md
│       └── METADATA.yml
├── mcp-server/                  # MCP Server for multi-project use
│   ├── server.py                # MCP server implementation
│   ├── requirements.txt         # Python dependencies
│   ├── settings.json.example    # Example Claude settings
│   └── README.md                # MCP setup & usage guide
├── agents/                      # Agent definitions (universal + per-stack)
│   ├── README.md                # Agent setup & usage guide
│   ├── universal/               # Stack-agnostic agents (3 — linked to ~/.claude/agents/)
│   │   ├── backend-technology-expert.md
│   │   ├── security-privacy-architect.md
│   │   └── technical-architecture-lead.md
│   └── stacks/                  # Stack-specific agents (linked per-project)
│       ├── nestjs-ddd/          # DDD quality + expert (3 agents)
│       ├── flutter-clean-arch/  # Flutter quality + arch + UI (3 agents)
│       ├── nextjs-app/          # Next.js quality + arch (2 agents)
│       ├── python/              # Python quality + arch (2 agents)
│       └── typescript-library/  # Library quality + API guardian (2 agents)
├── commands/                    # Global commands (symlinked from ~/.claude/commands)
│   ├── orchestrate.md           # Unified orchestration (search/implement/validate/analyze/review)
│   ├── progress.md              # Visual progress tracking (Haiku)
│   ├── scaffold.md              # Haiku template generator
│   └── README.md                # Command setup & usage guide
├── scripts/                     # Setup & maintenance scripts
│   ├── setup-project.sh         # Setup per-project (patterns, agents, rules, skills, MCP)
│   ├── setup-global.sh          # Setup global ~/.claude/ (universal agents, commands, hooks)
│   ├── migrate-v2.sh            # Migrate existing project to v3 features
│   ├── migrate-all.sh           # Batch migrate all projects
│   ├── setup-global.sh          # Setup global agents/commands (NEW)
│   ├── extract-patterns.sh      # Extract patterns from LocalHero
│   ├── validate-metadata.sh     # Validate METADATA.yml files
│   └── migration-guide.md       # User migration documentation
└── docs/                        # Additional documentation
    └── troubleshooting.md       # Common issues & solutions
```

---

## ⚡ Quick Setup (Recommended)

**For new projects or clean integration**: Use the unified setup script that handles BOTH global and project-level configuration in one command.

### One-Command Setup

```bash
# From claude-patterns directory
cd ~/projects/claude-patterns

# Setup for specific project
./setup-all.sh ~/projects/your-project

# Or setup for current directory
cd ~/projects/your-project
~/projects/claude-patterns/setup-all.sh .
```

### What This Does

**Phase 1: Global Setup** (idempotent, shared by all projects)
- Creates `~/.claude/agents` → symlink to `~/projects/claude-patterns/agents/`
- Creates `~/.claude/skills` → symlink to `~/projects/claude-patterns/skills/`
- Creates `~/.claude/commands` → symlink to `~/projects/claude-patterns/commands/`
- Creates `~/.claude/hooks` → symlink to `~/projects/claude-patterns/hooks/`

**Phase 2: Project Setup** (per-project configuration)
- Creates `.claude/knowledge/patterns/` → symlink to `~/projects/claude-patterns/patterns/`
- Creates `.claude/knowledge/patterns-local/` for project-specific overrides
- Generates `patterns-local/README.md` with override documentation

**Phase 3: Verification**
- Verifies all symlinks are correct
- Counts available resources (agents, skills, commands, hooks, patterns)
- Displays setup summary

### Features

- **Idempotent**: Safe to run multiple times, won't break existing setup
- **Auto-update detection**: Fixes broken/wrong symlinks automatically
- **Backup protection**: Backs up existing directories before symlinking
- **Comprehensive verification**: Shows exactly what's available after setup
- **Single source of truth**: All projects use symlinks → instant updates across projects

### Example Output

```
═══════════════════════════════════════════════════════════
🚀 Claude Patterns - Unified Setup
═══════════════════════════════════════════════════════════

Project: /opt/projects/local-hero-3
Claude Patterns: ~/projects/claude-patterns

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 1: Global Setup (shared by all projects)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ agents symlink correct
✅ skills symlink correct
✅ commands symlink correct
✅ hooks symlink correct

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 2: Project Setup (/opt/projects/local-hero-3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Verified .claude/knowledge/ exists
✅ Verified patterns-local/ exists
✅ patterns/ symlink correct
✅ patterns-local/README.md exists

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 3: Verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Global Symlinks:
  ✅ agents → /opt/projects/claude-patterns/agents
  ✅ skills → /opt/projects/claude-patterns/skills
  ✅ commands → /opt/projects/claude-patterns/commands
  ✅ hooks → /opt/projects/claude-patterns/hooks

Project Symlinks:
  ✅ patterns/ → /opt/projects/claude-patterns/patterns
  ✅ 33 patterns accessible

Available Resources:
  ✅ Agents: 9
  ✅ Skills: 0
  ✅ Commands: 2
  ✅ Hooks: 11

═══════════════════════════════════════════════════════════
🎉 Setup Complete!
═══════════════════════════════════════════════════════════

Next Steps:
  1. Restart Claude Code
  2. Test with: znajdź wszystkie aggregates
  3. Test with: /scaffold dto TestDTO auth
```

### When to Use

- ✅ **New project**: First-time claude-patterns integration
- ✅ **Existing project**: Migrating from old setup scripts
- ✅ **Broken symlinks**: Fixing incorrect/missing symlinks
- ✅ **Multi-machine**: Setting up claude-patterns on new development machine
- ✅ **Team onboarding**: New developer needs full claude-patterns setup

### Alternative: Detailed Setup Options

For more control or specific use cases, see detailed options below:
- **Option A**: MCP Server (multi-project, team collaboration)
- **Option B**: Filesystem Symlinks (manual control)
- **Option C**: Compilation System (project-specific agents)

---

## v3 Migration (Existing Projects)

For projects already set up with v2, run:

```bash
# Single project
./scripts/migrate-v2.sh /path/to/project

# All projects in /opt/projects/
./scripts/migrate-all.sh
```

### What v3 Adds

| Feature | How It Works |
|---------|-------------|
| `.claude/rules/` auto-discovery | Claude Code natively finds rules without CLAUDE.md reference |
| `@import` in CLAUDE.md | Rules and skills loaded via native import directives |
| `.mcp.json` per project | Project-scope MCP server, committed to git |
| Stack-specific hooks | DDD/Flutter/Python hooks only in matching projects |
| `worktree` config | `node_modules` symlinked, `.env` copied to worktrees |
| `autoMode` classifier | Custom per-stack permission rules |
| Agent `memory: project` | Specialists remember decisions between sessions |
| Agent `isolation: worktree` | Verifiers run without blocking working tree |
| Skill `paths:` filtering | Skills auto-activate only for matching files |

### Stack Presets

Each project gets hooks and settings matching its `stack_profile`:

| Preset | Hooks | autoMode |
|--------|-------|----------|
| `nestjs-ddd` | DDD patterns, domain purity, TypeScript check, context isolation | pnpm test, pnpm lint, tsc |
| `flutter` | Clean arch, Riverpod patterns, cross-feature imports | flutter test, flutter analyze |
| `python` | Layer purity, type annotations | pytest, mypy, ruff |
| (base) | Universal only (formatting, console.log, git push) | Read, Glob, Grep |

---

## 🚀 Quick Start

### Option A: MCP Server (Recommended for Multi-Project Use)

**Use when**: Multiple DIFFERENT projects need patterns (e.g., LocalHero + MarketPlace + FutureProject)

**Setup** (5 minutes):

```bash
# 1. Install MCP dependencies
cd ~/projects/claude-patterns/mcp-server
python3 -m pip install -r requirements.txt

# 2. Add to your project's Claude settings
cd ~/your-project
vim .claude/settings.json
```

Add this to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "claude-patterns": {
      "command": "python3",
      "args": ["/opt/projects/claude-patterns/mcp-server/server.py"],
      "disabled": false
    }
  }
}
```

```bash
# 3. Commit config to git
git add .claude/settings.json
git commit -m "Add claude-patterns MCP server"

# 4. Restart Claude Code
# Patterns now work! When teammates git pull, patterns work for them too.
```

**Full MCP documentation**: See `mcp-server/README.md`

---

### Option B: Filesystem Symlinks (Simpler for Single Project)

**Use when**: Only one project needs patterns (or multiple folders of same project)

**For New Projects**:

```bash
# 1. Setup symlinks in your project
cd ~/my-new-project
~/projects/claude-patterns/scripts/setup-project.sh .

# 2. Done! Your project now uses global patterns
ls -la .claude/knowledge/patterns  # Should show symlink
```

**For Existing Projects**:

```bash
# 1. Backup current patterns (optional)
cd ~/my-project/.claude/knowledge
cp -r patterns patterns.backup

# 2. Setup symlinks
~/projects/claude-patterns/scripts/setup-project.sh ~/my-project

# 3. Verify
ls -la .claude/knowledge/patterns  # Should show symlink
```

**Note**: Symlinks require global repo to exist on each machine. When cloning project on new machine, run `setup-project.sh` again.

---

---

## 🤖 Global Agents & Commands Setup

**What are these?** User-level agents and commands that work across ALL projects on your system.

### Quick Setup (5 minutes)

```bash
# 1. Run setup script
cd ~/projects/claude-patterns
./scripts/setup-global.sh

# 2. Restart Claude Code

# 3. Done! Global agents and commands now available in all projects
```

**What this does**:
- Creates `~/.claude/agents` → symlink to `~/projects/claude-patterns/agents/`
- Creates `~/.claude/commands` → symlink to `~/projects/claude-patterns/commands/`
- Backs up existing directories if present

### Manual Setup (Alternative)

```bash
# Agents
ln -sf ~/projects/claude-patterns/agents ~/.claude/agents

# Commands
ln -sf ~/projects/claude-patterns/commands ~/.claude/commands

# Verify
ls -la ~/.claude/
# Should show:
# agents -> /opt/projects/claude-patterns/agents
# commands -> /opt/projects/claude-patterns/commands
```

### Available Resources

**Global Agents** (6 total):
- **Specialists** (3): ddd-application-expert, backend-technology-expert, security-privacy-architect
- **Utilities** (3): codebase-explorer, schema-testing-agent, test-scaffolder

**Global Commands** (3 total):
- `/orchestrate` - Unified orchestration with mode detection (search, implement, validate, analyze, review)
- `/progress` - Visual progress tracking (shows task status, git changes, recent completions)
- `/scaffold` - Haiku-based boilerplate generator (60x cost savings)

### Cost Optimization Strategy

The orchestrator automatically delegates to the most cost-effective agents:

| Task Type | Before | After | Savings |
|-----------|--------|-------|---------|
| Search queries | Sonnet ($3/M) | Haiku via Explore ($0.25/M) | **92%** |
| Scaffolding | Manual (Sonnet) | Haiku auto-gen ($0.25/M) | **92%** |
| Progress check | Manual (Sonnet) | Haiku read-only ($0.25/M) | **92%** |
| Implementation | Sonnet ($3/M) | Sonnet ($3/M) | 0% (needs intelligence) |
| Security VETO | N/A | Opus ($15/M) | New feature |

**Target Distribution**: Opus <30%, Sonnet ~55%, Haiku >15%

**Example**: "Find all aggregates" query:
- Before: ~89k tokens × $3/M = **$0.27**
- After: ~89k tokens × $0.25/M = **$0.022** (12x cheaper)

**Full documentation**:
- Agents: `agents/README.md`
- Commands: `commands/README.md`

---

## 📖 How It Works

### Symlink Architecture

Each project has a symlink from `.claude/knowledge/patterns/` pointing to `~/projects/claude-patterns/patterns/`:

```
my-project/
├── .claude/
│   └── knowledge/
│       ├── patterns/            # Symlink → ~/projects/claude-patterns/patterns/
│       ├── patterns-local/      # Project-specific overrides
│       └── learned/             # Project-specific learnings (NOT symlinked)
```

### Pattern Precedence

When Claude Code loads patterns, it uses this precedence:

1. **Local patterns** (`.claude/knowledge/patterns-local/`) - Highest priority
2. **Symlinked global patterns** (`.claude/knowledge/patterns/`)
3. **Claude Code defaults** - Fallback

**Example**:
- Global pattern: `~/projects/claude-patterns/patterns/domain/aggregate-pattern.md`
- Local override: `.claude/knowledge/patterns-local/domain/aggregate-pattern.md`
- Result: Claude uses the **local override** (project-specific needs)

---

### Config-Only Hook Pattern

Most Python projects need **zero hook scripts** — only a config file:

```
your-project/
├── python-hooks.json          ← Only this file needed
└── .claude/config/project.yml
```

**How it works:**

1. Global hooks live at `~/.claude/hooks/` (symlinked from claude-patterns)
2. When triggered, each hook walks upward from the edited file to find `python-hooks.json`
3. Config found → enforce rules from config
4. No config found → silent skip (no false positives)

**Analogy**: Like `.eslintrc.json` configures ESLint without copying the ESLint binary into your project. The enforcement engine is global; the rules are local.

**What goes in `python-hooks.json`:**
- Which layers to enforce purity on (domain, services, etc.)
- Which imports are forbidden in pure layers
- Which file patterns to check for type annotations
- Skip patterns for tests, venvs, etc.

See [`templates/PYTHON-HOOKS-GUIDE.md`](templates/PYTHON-HOOKS-GUIDE.md) for config variants by project type.

---

## 🔀 MCP vs Symlinks: Which to Use?

### Quick Decision Matrix

| Your Situation | Recommendation | Why |
|----------------|----------------|-----|
| Multiple DIFFERENT projects (LocalHero + MarketPlace + etc.) | **MCP Server** | Works out-of-box, no setup on new machines |
| Multiple folders of SAME project (local-hero-3, local-hero-4) | **MCP Server** | Git pull/push works immediately |
| Single project, simple setup | **Symlinks** | Simpler, no Python dependency |
| Team collaboration (git pull must work) | **MCP Server** | Config in repo, zero setup for teammates |
| Frequent machine changes | **MCP Server** | Config in repo, patterns work everywhere |

### Detailed Comparison

**MCP Server**:
- ✅ Works across ANY projects (not limited to one codebase)
- ✅ Out-of-box: git pull → patterns work (config in repo)
- ✅ Team-friendly: teammates pull config, patterns work immediately
- ✅ Future-proof: can add tools, versioning, analytics later
- ⚠️ Requires Python + MCP library (~5 min setup)
- ⚠️ Slightly more complex than symlinks

**Symlinks**:
- ✅ Simpler setup (one script, done)
- ✅ No dependencies (just filesystem)
- ✅ Instant access (no MCP protocol overhead)
- ⚠️ Requires setup on each machine (run `setup-project.sh`)
- ⚠️ Git doesn't store symlink content (just path)
- ⚠️ Breaks when global repo missing

### Real-World Example

**Your case** (from conversation):
- 4 parallel LocalHero folders (local-hero, local-hero-2, local-hero-3, local-hero-4)
- Starting NEW project (MarketPlace)
- Need patterns reusable everywhere
- Want git pull/push to work out-of-box

**Recommendation**: **MCP Server**

**Why**:
1. Works for LocalHero AND MarketPlace (different projects)
2. When you `git pull` in local-hero-4, MCP config is there → patterns work
3. When teammate clones project → patterns work immediately (no setup)
4. Update patterns once → all projects + teammates see changes

---

## 🏷️ Stack Tagging System

Patterns are tagged with supported tech stacks in `METADATA.yml`:

```yaml
# ~/projects/claude-patterns/patterns/domain/METADATA.yml
version: "1.0"
stack_support:
  - typescript
  - python      # Future
  - generic     # Language-agnostic concepts

patterns:
  - name: aggregate-pattern.md
    stacks: [typescript]
    maturity: production
    last_verified: 2026-02-05
  - name: value-object-pattern.md
    stacks: [typescript, python]
    maturity: production
    last_verified: 2026-02-05
```

**Why Stack Tags?**
- Python projects won't load TypeScript-specific patterns
- Generic patterns work for all languages
- Reduces context pollution for Claude agents

---

## 📝 Pattern Categories

### Domain Layer (6 patterns)

Production-tested domain modeling patterns:
- `aggregate-pattern.md` - Factory methods, event emission, invariants
- `value-object-pattern.md` - Immutability, validation, reconstruction
- `domain-event-pattern.md` - Event naming, correlation IDs, GDPR segregation
- `entity-pattern.md` - Identity-based equality, lifecycle management
- `specification-policy-pattern.md` - PolicyBuilder pattern, business rules
- `domain-service-pattern.md` - Cross-aggregate operations

### Application Layer (4 patterns)

CQRS and orchestration patterns:
- `command-handler-pattern.md` - Write-side, @CommandHandler auto-discovery
- `query-handler-pattern.md` - Read-side, @QueryHandler auto-discovery
- `application-service-pattern.md` - Multi-step workflows, saga pattern
- `audit-handler-pattern.md` - @EventHandler auto-discovery, GDPR audit

### Architecture Layer (3 patterns)

Cross-cutting architectural patterns:
- `dual-identity-pattern.md` - Security pattern (userId extraction)
- `transactional-pattern.md` - Transaction management
- `fresh-context-pattern.md` - Claude Code context management

---

## 🔧 Maintenance

### Updating Patterns

```bash
# 1. Edit pattern in global repo
cd ~/projects/claude-patterns
vim patterns/domain/aggregate-pattern.md

# 2. Commit change
git add patterns/domain/aggregate-pattern.md
git commit -m "Improved aggregate factory method pattern"
git push

# 3. All projects see the update immediately (no action needed)
# - MCP Server: serves latest version automatically
# - Symlinks: point to latest version automatically
```

### Adding New Patterns

```bash
# 1. Add new pattern
cd ~/projects/claude-patterns/patterns/domain
vim new-pattern.md

# 2. Update METADATA.yml
vim METADATA.yml  # Add entry for new-pattern.md

# 3. Validate
cd ~/.claude-patterns
./scripts/validate-metadata.sh

# 4. Commit
git add .
git commit -m "Added new-pattern.md to domain layer"
```

### Syncing Across Machines (After GitHub Setup)

```bash
# On Machine A (after making changes)
cd ~/.claude-patterns
git push

# On Machine B (pull changes)
cd ~/.claude-patterns
git pull  # All projects see updates via symlinks
```

---

## 🛠️ Scripts Reference

### `setup-project.sh`

Setup symlinks in a new or existing project.

**Usage**:
```bash
~/projects/claude-patterns/scripts/setup-project.sh /path/to/project
```

**What it does**:
1. Creates `.claude/knowledge/patterns-local/` directory
2. Creates symlink: `patterns/ → ~/projects/claude-patterns/patterns/`
3. Creates `patterns-local/README.md` with override documentation

### `extract-patterns.sh`

Extract generic patterns from LocalHero to global repo.

**Usage**:
```bash
cd ~/.claude-patterns
./scripts/extract-patterns.sh
```

**What it does**:
1. Copies 13 generic patterns from LocalHero
2. Generates METADATA.yml for each directory
3. Validates pattern integrity

### `validate-metadata.sh`

Validate all METADATA.yml files in the repository.

**Usage**:
```bash
cd ~/.claude-patterns
./scripts/validate-metadata.sh
```

**What it does**:
1. Finds all METADATA.yml files
2. Validates YAML syntax
3. Reports errors or success

---

## 📊 Pattern Maturity Levels

Each pattern has a maturity level in METADATA.yml:

| Level | Description | Example |
|-------|-------------|---------|
| **production** | Battle-tested in production (1000+ tests) | aggregate-pattern.md |
| **stable** | Well-tested, minor tweaks expected | value-object-pattern.md |
| **experimental** | New pattern, may change significantly | (none yet) |
| **deprecated** | Obsolete, use alternative | (none yet) |

---

## 🎯 Success Metrics

After setup, you should see:
- ✅ 13+ generic patterns in `~/projects/claude-patterns/patterns/`
- ✅ Symlink working: `ls -la .claude/knowledge/patterns` shows `→ ~/projects/claude-patterns/patterns/`
- ✅ Claude agents reference patterns correctly
- ✅ All tests pass (if migrating existing project)
- ✅ ~85% disk savings (no pattern duplication across projects)

---

## 🐛 Troubleshooting

### Symlink Not Working

**Symptom**: `ls -la .claude/knowledge/patterns` shows broken symlink

**Solution**:
```bash
# Check if global patterns exist
ls ~/projects/claude-patterns/patterns/

# Re-run setup script
~/projects/claude-patterns/scripts/setup-project.sh .
```

### Windows Compatibility

**Symptom**: Symlinks don't work on Windows

**Solution**:
- **WSL2**: Symlinks work natively (recommended)
- **Windows native**: Use junction points instead:
  ```cmd
  mklink /J .claude\knowledge\patterns %USERPROFILE%\.claude-patterns\patterns
  ```

### Patterns Not Loading

**Symptom**: Claude doesn't see patterns

**Solution**:
```bash
# Verify symlink target exists
readlink .claude/knowledge/patterns

# Verify METADATA.yml is valid
cd ~/.claude-patterns
./scripts/validate-metadata.sh

# Check Claude Code settings
cat .claude/settings.json  # Ensure patterns path is correct
```

---

## 🚀 Next Steps

### After Initial Setup

1. **Test with existing project**: Verify all tests pass with symlinked patterns
2. **Create local overrides**: Add project-specific patterns to `patterns-local/`
3. **Update patterns**: Make improvements to global patterns as you learn
4. **Commit regularly**: Keep git history clean and descriptive

### Future Enhancements (Not Yet Implemented)

- [ ] Python pattern examples (Flask/FastAPI equivalents)
- [ ] GitHub repository for community contributions
- [ ] Auto-update mechanism (git pull on project open via hook)
- [ ] VS Code extension for pattern browsing
- [ ] Pattern versioning (semver for breaking changes)
- [ ] Pattern search CLI (`claude-patterns search "aggregate"`)
- [ ] Pattern diff tool (compare local vs global)

---

## 📚 References

**Source Material**:
- Extracted from LocalHero v3 production codebase
- Validated across 1355+ tests
- Production-tested patterns since 2026-01-06

**Related Documentation**:
- [TS-INFRA-002 Task](../../local-hero-3/project-orchestration/tasks/TS-INFRA-002-global-patterns-repository.md) - Implementation task
- [TS-KNOWLEDGE-001](../../local-hero-3/project-orchestration/completed-tasks/TS-KNOWLEDGE-001-pattern-library-migration.md) - Pattern library migration

**External Resources**:
- [Dotfiles Guide](https://dotfiles.github.io/) - Inspiration for symlink architecture
- [DDD Reference](https://www.domainlanguage.com/ddd/reference/) - Domain-Driven Design concepts

---

## 📧 Support

**Issues?** Check:
1. `docs/troubleshooting.md` in this repo
2. LocalHero CLAUDE.md (if working in LocalHero context)
3. Open issue on GitHub (after repo is created)

---

**License**: MIT (if public) / Private (if personal repo)
**Author**: Extracted from LocalHero by @localhero-project-orchestrator
**Maintained By**: You (the project owner)
