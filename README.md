# Global Claude Code Patterns Repository

**Version**: 1.0.0
**Created**: 2026-02-05
**Purpose**: Reusable DDD/CQRS patterns for Claude Code projects

---

## 📚 What Is This?

A **single source of truth** for production-tested software patterns that can be shared across multiple Claude Code projects using native filesystem symlinks.

**Key Benefits**:
- ✅ **Write once, use everywhere** - No pattern duplication
- ✅ **Instant updates** - Change once, all projects see it immediately (via symlinks)
- ✅ **Consistency** - Same patterns = consistent AI agent behavior
- ✅ **Simplicity** - Native symlinks (no network layer, no MCP server)
- ✅ **Proven quality** - Extracted from LocalHero production codebase (1355+ tests)

---

## 🏗️ Repository Structure

```
~/.claude-patterns/
├── README.md                    # This file
├── METADATA.yml                 # Repository metadata
├── .gitignore                   # Git exclusions
├── patterns/                    # Generic patterns (13 total)
│   ├── domain/                  # Domain layer (6 patterns)
│   │   ├── aggregate-pattern.md
│   │   ├── value-object-pattern.md
│   │   ├── domain-event-pattern.md
│   │   ├── entity-pattern.md
│   │   ├── specification-policy-pattern.md
│   │   ├── domain-service-pattern.md
│   │   └── METADATA.yml         # Stack support tags
│   ├── application/             # Application layer (4 patterns)
│   │   ├── command-handler-pattern.md
│   │   ├── query-handler-pattern.md
│   │   ├── application-service-pattern.md
│   │   ├── audit-handler-pattern.md
│   │   └── METADATA.yml
│   └── architecture/            # Architecture patterns (3 patterns)
│       ├── dual-identity-pattern.md
│       ├── transactional-pattern.md
│       ├── fresh-context-pattern.md
│       └── METADATA.yml
├── scripts/                     # Setup & maintenance scripts
│   ├── setup-project.sh         # Setup symlinks in new project
│   ├── extract-patterns.sh      # Extract patterns from LocalHero
│   ├── validate-metadata.sh     # Validate METADATA.yml files
│   └── migration-guide.md       # User migration documentation
└── docs/                        # Additional documentation
    └── troubleshooting.md       # Common issues & solutions
```

---

## 🚀 Quick Start

### For New Projects

```bash
# 1. Setup symlinks in your project
cd ~/my-new-project
~/.claude-patterns/scripts/setup-project.sh .

# 2. Done! Your project now uses global patterns
ls -la .claude/knowledge/patterns  # Should show symlink
```

### For Existing Projects

```bash
# 1. Backup current patterns (optional)
cd ~/my-project/.claude/knowledge
cp -r patterns patterns.backup

# 2. Setup symlinks
~/.claude-patterns/scripts/setup-project.sh ~/my-project

# 3. Verify
ls -la .claude/knowledge/patterns  # Should show symlink
```

---

## 📖 How It Works

### Symlink Architecture

Each project has a symlink from `.claude/knowledge/patterns/` pointing to `~/.claude-patterns/patterns/`:

```
my-project/
├── .claude/
│   └── knowledge/
│       ├── patterns/            # Symlink → ~/.claude-patterns/patterns/
│       ├── patterns-local/      # Project-specific overrides
│       └── learned/             # Project-specific learnings (NOT symlinked)
```

### Pattern Precedence

When Claude Code loads patterns, it uses this precedence:

1. **Local patterns** (`.claude/knowledge/patterns-local/`) - Highest priority
2. **Symlinked global patterns** (`.claude/knowledge/patterns/`)
3. **Claude Code defaults** - Fallback

**Example**:
- Global pattern: `~/.claude-patterns/patterns/domain/aggregate-pattern.md`
- Local override: `.claude/knowledge/patterns-local/domain/aggregate-pattern.md`
- Result: Claude uses the **local override** (project-specific needs)

---

## 🏷️ Stack Tagging System

Patterns are tagged with supported tech stacks in `METADATA.yml`:

```yaml
# ~/.claude-patterns/patterns/domain/METADATA.yml
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
cd ~/.claude-patterns
vim patterns/domain/aggregate-pattern.md

# 2. Commit change
git add patterns/domain/aggregate-pattern.md
git commit -m "Improved aggregate factory method pattern"

# 3. All projects using symlinks see the update immediately (no action needed)
```

### Adding New Patterns

```bash
# 1. Add new pattern
cd ~/.claude-patterns/patterns/domain
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
~/.claude-patterns/scripts/setup-project.sh /path/to/project
```

**What it does**:
1. Creates `.claude/knowledge/patterns-local/` directory
2. Creates symlink: `patterns/ → ~/.claude-patterns/patterns/`
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
- ✅ 13+ generic patterns in `~/.claude-patterns/patterns/`
- ✅ Symlink working: `ls -la .claude/knowledge/patterns` shows `→ ~/.claude-patterns/patterns/`
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
ls ~/.claude-patterns/patterns/

# Re-run setup script
~/.claude-patterns/scripts/setup-project.sh .
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
