# Claude Patterns MCP Server

**Purpose**: Serve DDD/CQRS patterns from `~/projects/claude-patterns/patterns/` to any Claude Code project via MCP protocol.

**Benefits**:
- ✅ Works across ALL projects (not just LocalHero)
- ✅ Out-of-box: git pull → patterns work immediately
- ✅ Single source of truth: One patterns folder
- ✅ No symlink complexity in git

---

## Quick Setup (5 minutes)

### 1. Install Dependencies

```bash
cd ~/projects/claude-patterns/mcp-server
python3 -m pip install -r requirements.txt
```

### 2. Verify Server Works

```bash
# Test the server
python3 server.py

# Should show MCP initialization (Ctrl+C to exit)
```

### 3. Configure Projects

**For LocalHero (or any existing project):**

```bash
cd ~/projects/local-hero-3
vim .claude/settings.json
```

Add this to `mcpServers` section:

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

**For NEW projects:**

Just copy `.claude/settings.json` from LocalHero (or add the `mcpServers` section above).

### 4. Restart Claude Code

After adding MCP config:
1. Exit Claude Code
2. Re-enter project
3. Patterns now accessible via MCP tools

---

## Usage in Claude Code

### List Available Patterns

```
User: "Show me all available patterns"
Claude: [Uses list_resources() → sees all 13 patterns]
```

### Search Patterns

```
User: "Find patterns related to aggregates"
Claude: [Uses search_patterns tool → finds aggregate-pattern.md, entity-pattern.md]
```

### Get Specific Pattern

```
User: "Show me the command handler pattern"
Claude: [Uses get_pattern tool → loads command-handler-pattern.md]
```

### Implementation Reference

```
User: "Create UserProfile aggregate following our patterns"
Claude: [Uses get_pattern("aggregate-pattern") → reads 700-line pattern → implements correctly]
```

---

## How It Works

**Architecture**:
```
~/projects/claude-patterns/patterns/      ← Single source of truth
           ↓
~/projects/claude-patterns/mcp-server/    ← MCP Server
           ↓
local-hero-3/.claude/settings.json        ← MCP Config (in repo)
local-hero-4/.claude/settings.json        ← MCP Config (in repo)
new-project/.claude/settings.json         ← MCP Config (in repo)
           ↓
Claude Code → Patterns accessible         ← Works out-of-box after git pull
```

**Key Points**:
- MCP config is IN project repo (`.claude/settings.json`)
- When you `git pull` in new folder → config is there → patterns work
- All projects point to ONE patterns folder (`~/projects/claude-patterns/patterns/`)
- Update patterns once → all projects see changes immediately

---

## MCP Protocol Details

**Resources** (Pattern Files):
- URI: `pattern://domain/aggregate-pattern.md`
- Type: `text/markdown`
- Auto-discovered from `~/projects/claude-patterns/patterns/`

**Tools** (Search):
- `search_patterns(query, category?)` - Find patterns by keyword
- `get_pattern(name)` - Get specific pattern by name

**Example Tool Call**:
```json
{
  "name": "search_patterns",
  "arguments": {
    "query": "command",
    "category": "application"
  }
}
```

Response:
```
Found 2 pattern(s):
- application/command-handler-pattern.md: pattern://application/command-handler-pattern.md
- domain/domain-service-pattern.md: pattern://domain/domain-service-pattern.md
```

---

## Multi-Project Setup Example

**Scenario**: You have LocalHero + new project "MarketPlace"

### Setup LocalHero (already done)

```bash
cd ~/projects/local-hero-3
# Add MCP config to .claude/settings.json (see step 3 above)
git add .claude/settings.json
git commit -m "Add claude-patterns MCP server"
git push
```

### Setup MarketPlace (NEW project)

```bash
cd ~/projects/marketplace
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

git add .claude/settings.json
git commit -m "Setup claude-patterns MCP server"
```

**Done!** Now MarketPlace can use all patterns from `~/projects/claude-patterns/`.

---

## Maintenance

### Updating Patterns

```bash
# Edit pattern
cd ~/projects/claude-patterns/patterns/domain
vim aggregate-pattern.md

# Commit to patterns repo
git add aggregate-pattern.md
git commit -m "Improved aggregate factory method pattern"
git push

# All projects see update immediately (no action needed)
```

### Adding New Patterns

```bash
# Add new pattern
cd ~/projects/claude-patterns/patterns/domain
vim new-pattern.md

# Update METADATA.yml
vim METADATA.yml

# Commit
git add .
git commit -m "Added new-pattern.md to domain layer"
git push

# Server auto-discovers new pattern (no code changes needed)
```

### Server Updates

```bash
# Update server code
cd ~/projects/claude-patterns/mcp-server
vim server.py

# Commit
git add server.py
git commit -m "Improved search functionality"
git push

# Restart Claude Code in any project to load new server code
```

---

## Troubleshooting

### MCP Server Not Appearing

**Check**:
```bash
# 1. Verify dependencies installed
python3 -c "import mcp; print('MCP installed')"

# 2. Verify server starts
cd ~/projects/claude-patterns/mcp-server
python3 server.py
# Should show initialization, not errors

# 3. Check Claude Code settings
cat ~/.claude/projects/local-hero-3/.claude/settings.json | grep -A 5 claude-patterns
```

### Patterns Not Loading

**Check**:
```bash
# 1. Verify patterns folder exists
ls ~/projects/claude-patterns/patterns/domain/
# Should show 6 .md files + METADATA.yml

# 2. Check file paths in MCP config
grep -A 3 claude-patterns .claude/settings.json
# "args": should have full path to server.py

# 3. Restart Claude Code
# (exit and re-enter project)
```

### Wrong Pattern Version

**Issue**: Old pattern content appears in Claude

**Solution**:
```bash
# 1. Verify patterns folder is up-to-date
cd ~/projects/claude-patterns
git pull

# 2. Restart MCP server (restart Claude Code)
```

---

## Migration Path (LocalHero)

**Current state**: LocalHero has 15 symlinks + 22 local files (hybrid approach)

**Migration options**:

**Option A: Keep Hybrid (Recommended)**
- Symlinks stay as-is (13 generic patterns via symlinks)
- Add MCP server for NEW projects (MarketPlace, etc.)
- Best of both worlds

**Option B: Full MCP Migration**
- Remove symlinks from LocalHero
- Use MCP for all patterns (unified approach)
- Simpler, but requires commit in LocalHero

**To migrate LocalHero to full MCP**:
```bash
cd ~/projects/local-hero-3/.claude/knowledge

# 1. Remove symlinked patterns (keep local files)
rm -rf patterns/domain/*.md patterns/application/*.md patterns/architecture/{dual-identity,transactional,fresh-context}*

# 2. Keep patterns-local/ (LocalHero-specific overrides)
# (no action needed)

# 3. Add MCP config (if not already added)
vim .claude/settings.json  # Add mcpServers section

# 4. Commit
git add .claude/
git commit -m "Migrate from symlinks to MCP server for generic patterns"
```

---

## Performance

**MCP vs Symlinks**:
- **Load time**: ~50ms to load pattern via MCP (vs instant for symlinks)
- **Context usage**: Same (pattern content loaded into context)
- **Disk usage**: Same (single source of truth)

**Optimization**:
- Server caches pattern content (no repeated disk reads)
- Search is indexed (fast keyword lookup)
- Claude Code caches MCP resources (subsequent loads are instant)

---

## Future Enhancements

**Potential additions to MCP server**:
- Pattern versioning (load specific version)
- Pattern dependencies (auto-load related patterns)
- Pattern validation (check syntax before serving)
- Usage analytics (track which patterns are used most)
- Dynamic context (serve only relevant patterns based on project type)

---

**Version**: 1.0.0
**Last Updated**: 2026-02-05
**Maintained By**: LocalHero Team
