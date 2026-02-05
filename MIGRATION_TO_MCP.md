# Migration Guide: Symlinks → MCP Server

**Date**: 2026-02-05
**Reason**: Multi-project pattern sharing (LocalHero + new projects)
**Status**: MCP server ready, awaiting deployment decision

---

## Current State

**Repository**: `~/projects/claude-patterns/` (v1.0.0)
- ✅ 13 generic patterns extracted
- ✅ Scripts created (extract, setup, validate)
- ✅ Documentation complete
- ✅ MCP server implemented (`mcp-server/`)

**LocalHero (local-hero-3)**: Hybrid approach
- 15 symlinks (generic patterns)
- 22 local files (LocalHero-specific patterns)
- Tests passing (16239 passed, 171 failed baseline)

---

## Why MCP Server?

**User Requirement** (from conversation):
> "te shared patterns nie są tylko dla projektu local-hero. Aktualnie startuję z kolejnym i chciałbym też używać tych patternów. My wypracowywaliśmy je od miesięcy, więc są ok, działają i chciałbym ich re-używać wszędzie"

**Translation**: Patterns must work across MULTIPLE DIFFERENT PROJECTS, not just LocalHero.

**MCP Benefits**:
1. Works for LocalHero + MarketPlace + any future project
2. Git pull/push works out-of-box (config in repo)
3. Teammates get patterns automatically (zero setup)
4. Single source of truth maintained

---

## Migration Steps

### Step 1: Install MCP Dependencies (5 min)

```bash
cd ~/projects/claude-patterns/mcp-server
python3 -m pip install -r requirements.txt

# Verify installation
python3 -c "import mcp; print('MCP installed successfully')"
```

### Step 2: Test MCP Server (2 min)

```bash
cd ~/projects/claude-patterns/mcp-server
python3 server.py

# Should show MCP initialization (no errors)
# Ctrl+C to exit
```

### Step 3: Configure LocalHero (5 min)

**Option A: Keep Hybrid (Recommended)**

Keep symlinks for LocalHero, add MCP for new projects only.

```bash
cd ~/projects/local-hero-3
vim .claude/settings.json
```

Add to existing `settings.json`:

```json
{
  "mcpServers": {
    "claude-patterns": {
      "command": "python3",
      "args": ["/home/node/projects/claude-patterns/mcp-server/server.py"],
      "disabled": false
    }
  }
}
```

Commit:
```bash
git add .claude/settings.json
git commit -m "Add claude-patterns MCP server (hybrid with symlinks)"
```

**Option B: Full MCP Migration**

Remove symlinks, use MCP exclusively.

```bash
cd ~/projects/local-hero-3/.claude/knowledge

# 1. Remove symlinked patterns (keep local files)
rm -rf patterns/domain/*.md
rm -rf patterns/application/*.md
rm -rf patterns/architecture/dual-identity-pattern.md
rm -rf patterns/architecture/transactional-pattern.md
rm -rf patterns/architecture/fresh-context-pattern.md

# 2. Keep patterns-local/ (LocalHero-specific)
# (no action needed)

# 3. Add MCP config
cd ~/projects/local-hero-3
vim .claude/settings.json
# (add mcpServers section as above)

# 4. Commit
git add .claude/
git commit -m "Migrate from symlinks to MCP server"
```

### Step 4: Setup New Project (MarketPlace) (3 min)

```bash
cd ~/projects/marketplace  # or your new project path

# Create Claude settings
mkdir -p .claude
cat > .claude/settings.json << 'EOF'
{
  "mcpServers": {
    "claude-patterns": {
      "command": "python3",
      "args": ["/home/node/projects/claude-patterns/mcp-server/server.py"],
      "disabled": false
    }
  }
}
EOF

# Commit
git add .claude/settings.json
git commit -m "Setup claude-patterns MCP server"
```

### Step 5: Verify (2 min)

**In LocalHero**:
```bash
cd ~/projects/local-hero-3
# Restart Claude Code
# Ask: "Show me all available patterns"
# Should see 13+ patterns via MCP
```

**In MarketPlace**:
```bash
cd ~/projects/marketplace
# Restart Claude Code
# Ask: "Show me the aggregate pattern"
# Should load pattern from MCP
```

---

## Rollback Plan

If MCP doesn't work as expected:

```bash
# 1. Remove MCP config
cd ~/projects/local-hero-3
vim .claude/settings.json
# Delete mcpServers section

# 2. If you removed symlinks (Option B), restore them
cd ~/projects/claude-patterns
./scripts/setup-project.sh ~/projects/local-hero-3

# 3. Restart Claude Code
```

---

## Future Enhancements

Once MCP is stable:

1. **Other LocalHero folders**: Add MCP config to local-hero, local-hero-2, local-hero-4
2. **Pattern versioning**: Tag patterns with semantic versions
3. **Usage analytics**: Track which patterns are used most
4. **Auto-sync**: Git pull patterns on Claude Code startup
5. **Pattern search UI**: VS Code extension for browsing patterns

---

## Decision Required

**Choose migration path**:

1. **Keep Hybrid** (Recommended)
   - LocalHero keeps symlinks (already working)
   - Add MCP for new projects (MarketPlace, etc.)
   - Gradual migration, low risk

2. **Full MCP Migration**
   - Remove symlinks from LocalHero
   - Use MCP everywhere (unified approach)
   - Single pattern access method

3. **Delay Migration**
   - Keep symlinks for now
   - Revisit when new project is active
   - Can migrate later without losing work

**My recommendation**: Keep Hybrid (Option 1)
- LocalHero already working with symlinks
- MCP adds new project support without disrupting LocalHero
- Can migrate LocalHero to full MCP later if desired

---

## Questions to Resolve

1. Which migration path do you prefer? (Hybrid, Full MCP, or Delay)
2. What's the new project name? (for step 4 example)
3. Do you want to migrate all 4 LocalHero folders? (local-hero, local-hero-2, local-hero-3, local-hero-4)
4. Should we create GitHub repo now, or after MCP is tested?

---

**Next Action**: Awaiting decision on migration path.

---

**References**:
- MCP Server README: `mcp-server/README.md`
- Main README: `README.md` (updated with MCP vs Symlinks comparison)
- Troubleshooting: `docs/troubleshooting.md`
