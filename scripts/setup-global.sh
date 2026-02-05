#!/bin/bash
# Setup global agents and commands for Claude Code
# Usage: ./scripts/setup-global.sh

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_CLAUDE_DIR="$HOME/.claude"

echo "🚀 Setting up global Claude Code resources..."
echo ""
echo "Repository: $REPO_DIR"
echo "Target: $USER_CLAUDE_DIR"
echo ""

# Create ~/.claude if not exists
if [ ! -d "$USER_CLAUDE_DIR" ]; then
  echo "📁 Creating $USER_CLAUDE_DIR directory..."
  mkdir -p "$USER_CLAUDE_DIR"
fi

# Setup agents symlink
echo "🔗 Setting up global agents..."
if [ -L "$USER_CLAUDE_DIR/agents" ]; then
  echo "  ⚠️  Symlink already exists: $USER_CLAUDE_DIR/agents"
  CURRENT_TARGET=$(readlink "$USER_CLAUDE_DIR/agents")
  if [ "$CURRENT_TARGET" = "$REPO_DIR/agents" ]; then
    echo "  ✅ Already pointing to correct location"
  else
    echo "  ❌ Points to different location: $CURRENT_TARGET"
    read -p "  Replace with new symlink? (y/n): " confirm
    if [ "$confirm" = "y" ]; then
      rm "$USER_CLAUDE_DIR/agents"
      ln -sf "$REPO_DIR/agents" "$USER_CLAUDE_DIR/agents"
      echo "  ✅ Global agents symlink updated"
    else
      echo "  ⏭️  Skipping agents"
    fi
  fi
elif [ -d "$USER_CLAUDE_DIR/agents" ]; then
  echo "  ⚠️  Directory already exists: $USER_CLAUDE_DIR/agents"
  read -p "  Backup and replace with symlink? (y/n): " confirm
  if [ "$confirm" = "y" ]; then
    BACKUP_DIR="$USER_CLAUDE_DIR/agents.backup.$(date +%Y%m%d-%H%M%S)"
    mv "$USER_CLAUDE_DIR/agents" "$BACKUP_DIR"
    echo "  📦 Backed up to: $BACKUP_DIR"
    ln -sf "$REPO_DIR/agents" "$USER_CLAUDE_DIR/agents"
    echo "  ✅ Global agents symlink created"
  else
    echo "  ⏭️  Skipping agents"
  fi
else
  ln -sf "$REPO_DIR/agents" "$USER_CLAUDE_DIR/agents"
  echo "  ✅ Global agents symlink created"
fi

# Setup commands symlink
echo ""
echo "🔗 Setting up global commands..."
if [ -L "$USER_CLAUDE_DIR/commands" ]; then
  echo "  ⚠️  Symlink already exists: $USER_CLAUDE_DIR/commands"
  CURRENT_TARGET=$(readlink "$USER_CLAUDE_DIR/commands")
  if [ "$CURRENT_TARGET" = "$REPO_DIR/commands" ]; then
    echo "  ✅ Already pointing to correct location"
  else
    echo "  ❌ Points to different location: $CURRENT_TARGET"
    read -p "  Replace with new symlink? (y/n): " confirm
    if [ "$confirm" = "y" ]; then
      rm "$USER_CLAUDE_DIR/commands"
      ln -sf "$REPO_DIR/commands" "$USER_CLAUDE_DIR/commands"
      echo "  ✅ Global commands symlink updated"
    else
      echo "  ⏭️  Skipping commands"
    fi
  fi
elif [ -d "$USER_CLAUDE_DIR/commands" ]; then
  echo "  ⚠️  Directory already exists: $USER_CLAUDE_DIR/commands"
  read -p "  Backup and replace with symlink? (y/n): " confirm
  if [ "$confirm" = "y" ]; then
    BACKUP_DIR="$USER_CLAUDE_DIR/commands.backup.$(date +%Y%m%d-%H%M%S)"
    mv "$USER_CLAUDE_DIR/commands" "$BACKUP_DIR"
    echo "  📦 Backed up to: $BACKUP_DIR"
    ln -sf "$REPO_DIR/commands" "$USER_CLAUDE_DIR/commands"
    echo "  ✅ Global commands symlink created"
  else
    echo "  ⏭️  Skipping commands"
  fi
else
  ln -sf "$REPO_DIR/commands" "$USER_CLAUDE_DIR/commands"
  echo "  ✅ Global commands symlink created"
fi

# Verification
echo ""
echo "📊 Verification:"
echo ""
ls -la "$USER_CLAUDE_DIR" | grep -E "agents|commands" || echo "No symlinks found"

# Count resources
if [ -L "$USER_CLAUDE_DIR/agents" ]; then
  AGENT_COUNT=$(find "$REPO_DIR/agents" -name "*.md" -not -name "README.md" | wc -l)
  echo ""
  echo "✅ Global agents: $AGENT_COUNT"
  echo "   - Specialists: $(find "$REPO_DIR/agents/specialists" -name "*.md" 2>/dev/null | wc -l)"
  echo "   - Utilities: $(find "$REPO_DIR/agents/utilities" -name "*.md" 2>/dev/null | wc -l)"
fi

if [ -L "$USER_CLAUDE_DIR/commands" ]; then
  COMMAND_COUNT=$(find "$REPO_DIR/commands" -name "*.md" -not -name "README.md" | wc -l)
  echo ""
  echo "✅ Global commands: $COMMAND_COUNT"
  find "$REPO_DIR/commands" -name "*.md" -not -name "README.md" -exec basename {} .md \; | sed 's/^/   - \//'
fi

echo ""
echo "🎉 Global setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Restart Claude Code"
echo "   2. In any project, test:"
echo "      - List agents: Ask Claude 'List available agents'"
echo "      - Use command: /orchestrate or /scaffold"
echo ""
echo "📚 Documentation:"
echo "   - Agents: $REPO_DIR/agents/README.md"
echo "   - Commands: $REPO_DIR/commands/README.md"
echo "   - Main: $REPO_DIR/README.md"
