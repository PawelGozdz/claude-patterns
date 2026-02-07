#!/bin/bash
# ~/projects/claude-patterns/setup.sh
# GLOBAL Claude Code setup for all NestJS+DDD projects
# Works for: local-hero-3, local-hero-4, universal-learning-system, future projects

set -e

echo "═══════════════════════════════════════════════════════════"
echo "🚀 Universal NestJS+DDD Claude Code Setup"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "This will set up:"
echo "  - GLOBAL agents (specialists, utilities, verifiers)"
echo "  - GLOBAL skills (orchestrate, scaffold, validate, workflow)"
echo "  - GLOBAL commands (16 generic commands)"
echo "  - GLOBAL hooks (delegation, cost-tracking)"
echo "  - claude-patterns MCP server"
echo ""

# 1. Create global agents symlink (shared by ALL projects)
echo "📁 Setting up ~/.claude/agents symlink..."
if [ ! -L ~/.claude/agents ]; then
  if [ -d ~/.claude/agents ]; then
    echo "⚠️  ~/.claude/agents exists as directory. Backing up..."
    mv ~/.claude/agents ~/.claude/agents-backup-$(date +%Y%m%d-%H%M%S)
  fi
  ln -s ~/projects/claude-patterns/agents ~/.claude/agents
  echo "✅ Created ~/.claude/agents symlink"
else
  echo "✅ ~/.claude/agents symlink already exists"
fi

# 2. Create global skills symlink (if Claude Code supports it)
echo ""
echo "📁 Setting up ~/.claude/skills symlink..."
if [ ! -L ~/.claude/skills ]; then
  if [ -d ~/.claude/skills ]; then
    echo "⚠️  ~/.claude/skills exists as directory. Backing up..."
    mv ~/.claude/skills ~/.claude/skills-backup-$(date +%Y%m%d-%H%M%S)
  fi
  ln -s ~/projects/claude-patterns/skills ~/.claude/skills
  echo "✅ Created ~/.claude/skills symlink"
else
  echo "✅ ~/.claude/skills symlink already exists"
fi

# 3. Create global commands symlink (if Claude Code supports it)
echo ""
echo "📁 Setting up ~/.claude/commands symlink..."
if [ ! -L ~/.claude/commands ]; then
  if [ -d ~/.claude/commands ]; then
    echo "⚠️  ~/.claude/commands exists as directory. Backing up..."
    mv ~/.claude/commands ~/.claude/commands-backup-$(date +%Y%m%d-%H%M%S)
  fi
  ln -s ~/projects/claude-patterns/commands ~/.claude/commands
  echo "✅ Created ~/.claude/commands symlink"
else
  echo "✅ ~/.claude/commands symlink already exists"
fi

# 4. Create global hooks symlink (if Claude Code supports it)
echo ""
echo "📁 Setting up ~/.claude/hooks symlink..."
if [ ! -L ~/.claude/hooks ]; then
  if [ -d ~/.claude/hooks ]; then
    echo "⚠️  ~/.claude/hooks exists as directory. Backing up..."
    mv ~/.claude/hooks ~/.claude/hooks-backup-$(date +%Y%m%d-%H%M%S)
  fi
  ln -s ~/projects/claude-patterns/hooks ~/.claude/hooks
  echo "✅ Created ~/.claude/hooks symlink"
else
  echo "✅ ~/.claude/hooks symlink already exists"
fi

# 5. Register MCP server (shared by ALL projects)
echo ""
echo "📦 Registering claude-patterns MCP server..."
if claude mcp list 2>/dev/null | grep -q "claude-patterns"; then
  echo "✅ claude-patterns MCP server already registered"
else
  claude mcp add claude-patterns -- python3 ~/projects/claude-patterns/mcp-server/server.py
  echo "✅ Registered claude-patterns MCP server"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Global setup complete!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "What you now have access to:"
echo "  ✅ GLOBAL agents (specialists, utilities, verifiers)"
echo "  ✅ GLOBAL skills (5 skills)"
echo "  ✅ GLOBAL commands (16 commands)"
echo "  ✅ GLOBAL hooks (11 hooks)"
echo "  ✅ claude-patterns MCP server (27 patterns)"
echo "  ✅ Cost optimization (Haiku 60x cheaper for search!)"
echo ""
echo "💡 Next steps:"
echo "  1. Restart Claude Code to load configuration"
echo "  2. Your projects (local-hero, universal-learning-system) are ready!"
echo "  3. Projects use absolute paths: /home/node/.claude/hooks/..."
echo "  4. New projects: Just run this script again (global setup only)"
echo ""
echo "📚 Documentation:"
echo "  - Architecture: project/.claude/ARCHITECTURE.md"
echo "  - Patterns: Access via MCP server"
echo "  - Agent registry: Use /agent-registry command"
echo ""
