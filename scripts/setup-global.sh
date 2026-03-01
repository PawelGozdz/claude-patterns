#!/bin/bash
# Setup global agents, commands, and hooks for Claude Code
# Usage: ./scripts/setup-global.sh

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_CLAUDE_DIR="$HOME/.claude"

echo "Setting up global Claude Code resources..."
echo ""
echo "Repository: $REPO_DIR"
echo "Target: $USER_CLAUDE_DIR"
echo ""

# Create ~/.claude if not exists
if [ ! -d "$USER_CLAUDE_DIR" ]; then
  echo "Creating $USER_CLAUDE_DIR directory..."
  mkdir -p "$USER_CLAUDE_DIR"
fi

# --- Helper: setup a symlink ---
# Usage: setup_symlink <name> <source_dir>
setup_symlink() {
  local name="$1"
  local source_dir="$2"
  local target="$USER_CLAUDE_DIR/$name"

  echo "Setting up global $name..."
  if [ -L "$target" ]; then
    CURRENT_TARGET=$(readlink "$target")
    if [ "$CURRENT_TARGET" = "$source_dir" ]; then
      echo "  Already pointing to correct location"
    else
      echo "  Points to different location: $CURRENT_TARGET"
      read -p "  Replace with new symlink? (y/n): " confirm
      if [ "$confirm" = "y" ]; then
        rm "$target"
        ln -sf "$source_dir" "$target"
        echo "  Global $name symlink updated"
      else
        echo "  Skipping $name"
      fi
    fi
  elif [ -d "$target" ]; then
    echo "  Directory already exists: $target"
    read -p "  Backup and replace with symlink? (y/n): " confirm
    if [ "$confirm" = "y" ]; then
      BACKUP_DIR="$target.backup.$(date +%Y%m%d-%H%M%S)"
      mv "$target" "$BACKUP_DIR"
      echo "  Backed up to: $BACKUP_DIR"
      ln -sf "$source_dir" "$target"
      echo "  Global $name symlink created"
    else
      echo "  Skipping $name"
    fi
  else
    ln -sf "$source_dir" "$target"
    echo "  Global $name symlink created"
  fi
  echo ""
}

# Setup agents, commands, and hooks symlinks
setup_symlink "agents" "$REPO_DIR/agents"
setup_symlink "commands" "$REPO_DIR/commands"
setup_symlink "hooks" "$REPO_DIR/hooks"

# Remove global skills symlink (skills are now per-project)
if [ -L "$USER_CLAUDE_DIR/skills" ]; then
  echo "Removing global skills symlink (skills are now per-project)..."
  rm "$USER_CLAUDE_DIR/skills"
  echo "  Removed: $USER_CLAUDE_DIR/skills"
  echo "  Skills will be configured per-project via project.yml"
  echo ""
elif [ -d "$USER_CLAUDE_DIR/skills" ]; then
  echo "Note: $USER_CLAUDE_DIR/skills is a directory (not a symlink)"
  echo "  Consider managing skills per-project instead."
  echo ""
fi

# Verification
echo "Verification:"
echo ""
ls -la "$USER_CLAUDE_DIR" | grep -E "agents|commands|hooks" || echo "No symlinks found"

# Count resources
for resource in agents commands hooks; do
  if [ -L "$USER_CLAUDE_DIR/$resource" ]; then
    COUNT=$(find "$REPO_DIR/$resource" -name "*.md" -o -name "*.json" -o -name "*.js" 2>/dev/null | grep -v README | wc -l)
    echo ""
    echo "Global $resource: $COUNT files"
  fi
done

# Verify skills symlink is gone
if [ -L "$USER_CLAUDE_DIR/skills" ] || [ -d "$USER_CLAUDE_DIR/skills" ]; then
  echo ""
  echo "Warning: ~/.claude/skills still exists"
else
  echo ""
  echo "Global skills: removed (per-project scoping)"
fi

echo ""
echo "Global setup complete!"
echo ""
echo "Next steps:"
echo "   1. Run setup-project.sh for each project"
echo "   2. Or use: ./setup.sh ~/projects/my-project"
echo ""
