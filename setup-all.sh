#!/bin/bash
# ~/projects/claude-patterns/setup-all.sh
# ONE COMMAND to set up claude-patterns for any project
#
# Usage: ./setup-all.sh [project-path]
# Example: ./setup-all.sh ~/projects/local-hero-2
# If no path provided, uses current directory

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🚀 Claude Patterns - Unified Setup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Determine project path
PROJECT_DIR="${1:-.}"
PROJECT_DIR=$(cd "$PROJECT_DIR" && pwd)

echo -e "${BLUE}Project:${NC} $PROJECT_DIR"
echo -e "${BLUE}Claude Patterns:${NC} ~/projects/claude-patterns"
echo ""

# ============================================
# PHASE 1: GLOBAL SETUP (idempotent)
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}PHASE 1: Global Setup (shared by all projects)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Function to setup global symlink
setup_global_symlink() {
  local name=$1
  local target=~/projects/claude-patterns/$name
  local link=~/.claude/$name

  if [ -L "$link" ]; then
    current_target=$(readlink "$link")
    if [ "$current_target" = "$target" ]; then
      echo -e "${GREEN}✅${NC} $name symlink correct"
      return 0
    else
      echo -e "${YELLOW}⚠️${NC}  $name symlink points to wrong target"
      echo -e "   Current: $current_target"
      echo -e "   Expected: $target"
      echo -e "   Updating..."
      rm "$link"
      ln -s "$target" "$link"
      echo -e "${GREEN}✅${NC} Updated $name symlink"
      return 0
    fi
  elif [ -d "$link" ]; then
    echo -e "${YELLOW}⚠️${NC}  $name is a directory (not symlink)"
    echo -e "   Backing up and creating symlink..."
    mv "$link" "$link.backup.$(date +%Y%m%d-%H%M%S)"
    ln -s "$target" "$link"
    echo -e "${GREEN}✅${NC} Created $name symlink"
    return 0
  else
    echo -e "${BLUE}📁${NC} Creating $name symlink..."
    mkdir -p ~/.claude
    ln -s "$target" "$link"
    echo -e "${GREEN}✅${NC} Created $name symlink"
    return 0
  fi
}

# Setup all global symlinks
setup_global_symlink "agents"
setup_global_symlink "skills"
setup_global_symlink "commands"
setup_global_symlink "hooks"

echo ""

# ============================================
# PHASE 2: PROJECT SETUP (idempotent)
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}PHASE 2: Project Setup ($PROJECT_DIR)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Validate project directory
if [ ! -d "$PROJECT_DIR" ]; then
  echo -e "${RED}❌ Error: Project directory not found: $PROJECT_DIR${NC}"
  exit 1
fi

# Create .claude/knowledge structure
KNOWLEDGE_DIR="$PROJECT_DIR/.claude/knowledge"
mkdir -p "$KNOWLEDGE_DIR"
echo -e "${GREEN}✅${NC} Verified .claude/knowledge/ exists"

# Create patterns-local for project-specific overrides
PATTERNS_LOCAL="$KNOWLEDGE_DIR/patterns-local"
mkdir -p "$PATTERNS_LOCAL"
echo -e "${GREEN}✅${NC} Verified patterns-local/ exists"

# Setup patterns symlink
PATTERNS_LINK="$KNOWLEDGE_DIR/patterns"
GLOBAL_PATTERNS=~/projects/claude-patterns/patterns

if [ -L "$PATTERNS_LINK" ]; then
  current_target=$(readlink "$PATTERNS_LINK")
  if [ "$current_target" = "$GLOBAL_PATTERNS" ]; then
    echo -e "${GREEN}✅${NC} patterns/ symlink correct"
  else
    echo -e "${YELLOW}⚠️${NC}  patterns/ points to wrong target"
    echo -e "   Current: $current_target"
    echo -e "   Expected: $GLOBAL_PATTERNS"
    echo -e "   Updating..."
    rm "$PATTERNS_LINK"
    ln -sf "$GLOBAL_PATTERNS" "$PATTERNS_LINK"
    echo -e "${GREEN}✅${NC} Updated patterns/ symlink"
  fi
elif [ -d "$PATTERNS_LINK" ]; then
  echo -e "${YELLOW}⚠️${NC}  patterns/ is a directory (not symlink)"
  echo -e "   Backing up and creating symlink..."
  mv "$PATTERNS_LINK" "$PATTERNS_LINK.backup.$(date +%Y%m%d-%H%M%S)"
  ln -sf "$GLOBAL_PATTERNS" "$PATTERNS_LINK"
  echo -e "${GREEN}✅${NC} Created patterns/ symlink"
else
  echo -e "${BLUE}📁${NC} Creating patterns/ symlink..."
  ln -sf "$GLOBAL_PATTERNS" "$PATTERNS_LINK"
  echo -e "${GREEN}✅${NC} Created patterns/ symlink"
fi

# Create README in patterns-local if missing
README="$PATTERNS_LOCAL/README.md"
if [ ! -f "$README" ]; then
  cat > "$README" <<'EOF'
# Project-Specific Pattern Overrides

This directory contains patterns that override global patterns from `claude-patterns`.

## Pattern Precedence

1. **Local patterns** (this directory) - Highest priority
2. **Global patterns** (symlinked from claude-patterns)
3. **Claude Code defaults** - Fallback

## When to Add Overrides

- ✅ Project has unique requirements
- ✅ Need to extend/customize generic pattern
- ✅ Temporary experimental patterns

## DO NOT Add Here

- ❌ Learnings → Use `.claude/knowledge/learned/`
- ❌ Tasks → Use `project-orchestration/`
EOF
  echo -e "${GREEN}✅${NC} Created patterns-local/README.md"
else
  echo -e "${GREEN}✅${NC} patterns-local/README.md exists"
fi

echo ""

# ============================================
# PHASE 3: VERIFICATION
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}PHASE 3: Verification${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Verify global symlinks
echo -e "${BLUE}Global Symlinks:${NC}"
for name in agents skills commands hooks; do
  link=~/.claude/$name
  if [ -L "$link" ]; then
    target=$(readlink "$link")
    echo -e "  ${GREEN}✅${NC} $name → $target"
  else
    echo -e "  ${RED}❌${NC} $name (missing or not a symlink)"
  fi
done

echo ""

# Verify project symlink
echo -e "${BLUE}Project Symlinks:${NC}"
if [ -L "$PATTERNS_LINK" ]; then
  target=$(readlink "$PATTERNS_LINK")
  pattern_count=$(find "$PATTERNS_LINK" -name "*.md" -not -name "README.md" 2>/dev/null | wc -l)
  echo -e "  ${GREEN}✅${NC} patterns/ → $target"
  echo -e "  ${GREEN}✅${NC} $pattern_count patterns accessible"
else
  echo -e "  ${RED}❌${NC} patterns/ (missing or not a symlink)"
fi

echo ""

# Count global resources
echo -e "${BLUE}Available Resources:${NC}"
agents_count=$(find ~/.claude/agents -name "*.md" 2>/dev/null | wc -l)
skills_count=$(find ~/.claude/skills -name "*.md" 2>/dev/null | wc -l)
commands_count=$(find ~/.claude/commands -name "*.md" 2>/dev/null | wc -l)
hooks_count=$(find ~/.claude/hooks -name "*.sh" 2>/dev/null | wc -l)

echo -e "  ${GREEN}✅${NC} Agents: $agents_count"
echo -e "  ${GREEN}✅${NC} Skills: $skills_count"
echo -e "  ${GREEN}✅${NC} Commands: $commands_count"
echo -e "  ${GREEN}✅${NC} Hooks: $hooks_count"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🎉 Setup Complete!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Restart Claude Code"
echo "  2. Test with: znajdź wszystkie aggregates"
echo "  3. Test with: /scaffold dto TestDTO auth"
echo ""
echo -e "${BLUE}Single Source of Truth:${NC}"
echo "  - Agents, Skills, Commands, Hooks: ~/projects/claude-patterns"
echo "  - Patterns: ~/projects/claude-patterns/patterns"
echo "  - All projects use symlinks → automatic updates!"
echo ""
echo -e "${BLUE}To update all projects:${NC}"
echo "  cd ~/projects/claude-patterns"
echo "  git pull"
echo "  # All projects get updates automatically via symlinks ✅"
echo ""
