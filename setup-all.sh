#!/bin/bash
# ~/projects/claude-patterns/setup-all.sh
# ONE COMMAND to set up claude-patterns for any project
#
# Usage: ./setup-all.sh [project-path]
#        ./setup-all.sh --update [project-path]   # Re-generate CLAUDE.md only
#        ./setup-all.sh --validate [project-path]  # Check project.yml + symlinks
#
# Example: ./setup-all.sh ~/projects/local-hero-4

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Parse flags
MODE="full"
PROJECT_ARG=""
for arg in "$@"; do
  case "$arg" in
    --update)  MODE="update" ;;
    --validate) MODE="validate" ;;
    -*) echo -e "${RED}Unknown flag: $arg${NC}"; exit 1 ;;
    *)  PROJECT_ARG="$arg" ;;
  esac
done

# Determine project path
PROJECT_DIR="${PROJECT_ARG:-.}"
PROJECT_DIR=$(cd "$PROJECT_DIR" && pwd)

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Claude Patterns - Unified Setup (mode: ${MODE})${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Project:${NC} $PROJECT_DIR"
echo -e "${BLUE}Claude Patterns:${NC} $SCRIPT_DIR"
echo ""

# ============================================
# VALIDATE MODE
# ============================================
if [[ "$MODE" == "validate" ]]; then
  echo -e "${BLUE}Validating setup...${NC}"
  echo ""
  ERRORS=0

  # Check global symlinks
  for name in agents skills commands hooks; do
    link=~/.claude/$name
    if [ -L "$link" ]; then
      echo -e "  ${GREEN}✅${NC} ~/.claude/$name → $(readlink "$link")"
    else
      echo -e "  ${RED}❌${NC} ~/.claude/$name (missing or not a symlink)"
      ERRORS=$((ERRORS + 1))
    fi
  done

  # Check patterns symlink
  PATTERNS_LINK="$PROJECT_DIR/.claude/knowledge/patterns"
  if [ -L "$PATTERNS_LINK" ]; then
    echo -e "  ${GREEN}✅${NC} patterns/ symlink valid"
  else
    echo -e "  ${RED}❌${NC} patterns/ symlink missing"
    ERRORS=$((ERRORS + 1))
  fi

  # Check project.yml
  PROJECT_YML="$PROJECT_DIR/.claude/config/project.yml"
  if [ -f "$PROJECT_YML" ]; then
    echo -e "  ${GREEN}✅${NC} project.yml exists"
    # Basic structure check
    for key in "project:" "contexts:" "rules:" "cost:"; do
      if grep -q "^${key}" "$PROJECT_YML"; then
        echo -e "    ${GREEN}✅${NC} ${key} section found"
      else
        echo -e "    ${YELLOW}⚠️${NC}  ${key} section missing"
      fi
    done
  else
    echo -e "  ${YELLOW}⚠️${NC}  project.yml not found (CLAUDE.md generation unavailable)"
  fi

  # Check generated CLAUDE.md
  if [ -f "$PROJECT_DIR/CLAUDE.md" ]; then
    lines=$(wc -l < "$PROJECT_DIR/CLAUDE.md")
    echo -e "  ${GREEN}✅${NC} CLAUDE.md exists (${lines} lines)"
  else
    echo -e "  ${YELLOW}⚠️${NC}  CLAUDE.md not found"
  fi

  echo ""
  if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
  else
    echo -e "${RED}${ERRORS} error(s) found. Run ./setup-all.sh to fix.${NC}"
    exit 1
  fi
  exit 0
fi

# ============================================
# UPDATE MODE (re-generate CLAUDE.md only)
# ============================================
if [[ "$MODE" == "update" ]]; then
  echo -e "${BLUE}Re-generating CLAUDE.md...${NC}"
  "$SCRIPT_DIR/scripts/generate-claude-md.sh" "$PROJECT_DIR"
  echo ""
  echo -e "${GREEN}Done! CLAUDE.md updated.${NC}"
  exit 0
fi

# ============================================
# FULL MODE (phases 1-6)
# ============================================

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
  local target=$SCRIPT_DIR/$name
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
  echo -e "${RED}Error: Project directory not found: $PROJECT_DIR${NC}"
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
GLOBAL_PATTERNS=$SCRIPT_DIR/patterns

if [ -L "$PATTERNS_LINK" ]; then
  current_target=$(readlink "$PATTERNS_LINK")
  if [ "$current_target" = "$GLOBAL_PATTERNS" ]; then
    echo -e "${GREEN}✅${NC} patterns/ symlink correct"
  else
    echo -e "${YELLOW}⚠️${NC}  patterns/ points to wrong target, updating..."
    rm "$PATTERNS_LINK"
    ln -sf "$GLOBAL_PATTERNS" "$PATTERNS_LINK"
    echo -e "${GREEN}✅${NC} Updated patterns/ symlink"
  fi
elif [ -d "$PATTERNS_LINK" ]; then
  echo -e "${YELLOW}⚠️${NC}  patterns/ is a directory, backing up..."
  mv "$PATTERNS_LINK" "$PATTERNS_LINK.backup.$(date +%Y%m%d-%H%M%S)"
  ln -sf "$GLOBAL_PATTERNS" "$PATTERNS_LINK"
  echo -e "${GREEN}✅${NC} Created patterns/ symlink"
else
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
  pattern_count=$(find -L "$PATTERNS_LINK" -name "*.md" -not -name "README.md" 2>/dev/null | wc -l)
  echo -e "  ${GREEN}✅${NC} patterns/ → $target"
  echo -e "  ${GREEN}✅${NC} $pattern_count patterns accessible"
else
  echo -e "  ${RED}❌${NC} patterns/ (missing or not a symlink)"
fi

echo ""

# Count global resources (follow symlinks, exclude deprecated)
echo -e "${BLUE}Available Resources:${NC}"
agents_count=$(find -L ~/.claude/agents -maxdepth 2 -name "*.md" -not -path "*/deprecated/*" 2>/dev/null | wc -l)
skills_count=$(find -L ~/.claude/skills -maxdepth 1 -name "*.md" -not -path "*/deprecated/*" 2>/dev/null | wc -l)
commands_count=$(find -L ~/.claude/commands -maxdepth 1 -name "*.md" -not -name "README.md" -not -path "*/deprecated/*" 2>/dev/null | wc -l)
hooks_count=$(find -L ~/.claude/hooks -maxdepth 1 -name "*.sh" -not -path "*/deprecated/*" 2>/dev/null | wc -l)

echo -e "  ${GREEN}✅${NC} Agents: $agents_count"
echo -e "  ${GREEN}✅${NC} Skills: $skills_count"
echo -e "  ${GREEN}✅${NC} Commands: $commands_count"
echo -e "  ${GREEN}✅${NC} Hooks: $hooks_count"

echo ""

# ============================================
# PHASE 4: CONFIGURE SETTINGS.JSON
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}PHASE 4: Configure settings.json${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

SETTINGS_JSON="$PROJECT_DIR/.claude/settings.json"
HOOKS_CONFIG="$SCRIPT_DIR/hooks/hooks-config.json"

if [ -f "$HOOKS_CONFIG" ]; then
  echo -e "${BLUE}Generating hooks configuration from hooks-config.json...${NC}"

  # Check if settings.json exists and has hooks section
  if [ -f "$SETTINGS_JSON" ]; then
    # Backup existing settings.json
    cp "$SETTINGS_JSON" "$SETTINGS_JSON.backup.$(date +%Y%m%d-%H%M%S)"
    echo -e "${YELLOW}⚠️${NC}  Backed up existing settings.json"

    # Use Python to merge hooks configuration
    SCRIPT_DIR="$SCRIPT_DIR" PROJECT_DIR="$PROJECT_DIR" python3 <<'PYTHON_SCRIPT'
import json
import sys
import os

script_dir = os.environ['SCRIPT_DIR']
project_dir = os.environ['PROJECT_DIR']
hooks_config_path = f"{script_dir}/hooks/hooks-config.json"
settings_path = f"{project_dir}/.claude/settings.json"

# Read hooks-config.json
with open(hooks_config_path, 'r') as f:
    hooks_config = json.load(f)

# Read existing settings.json
with open(settings_path, 'r') as f:
    settings = json.load(f)

# Build hooks section from hooks-config.json
hooks_section = {}

for hook_name, hook_info in hooks_config.get('hooks', {}).items():
    if not hook_info.get('enabled', True):
        continue

    script_path = f"/home/node/.claude/{hook_info['script']}"

    for trigger in hook_info.get('triggers', []):
        if trigger not in hooks_section:
            hooks_section[trigger] = []

        # Determine matcher based on trigger
        matcher = "*" if trigger in ["PreToolUse", "PostToolUse", "Bash"] else ""

        # Build hook entry
        hook_entry = {
            "matcher": matcher,
            "hooks": [
                {
                    "type": "command",
                    "command": script_path
                }
            ]
        }

        # Special case: state-manager has different commands per trigger
        if hook_name == "state-manager":
            if trigger == "SessionStart":
                hook_entry["hooks"][0]["command"] = f"{script_path} show"
            elif trigger == "ClearContext":
                hook_entry["hooks"][0]["command"] = f"{script_path} check"
            elif trigger == "Bash":
                hook_entry["hooks"][0]["command"] = f"{script_path} update"

        hooks_section[trigger].append(hook_entry)

# Update settings.json
settings['hooks'] = hooks_section

# Write updated settings.json
with open(settings_path, 'w') as f:
    json.dump(settings, f, indent=2)

print("✅ Updated hooks section in settings.json", file=sys.stderr)
PYTHON_SCRIPT

    if [ $? -eq 0 ]; then
      echo -e "${GREEN}✅${NC} settings.json hooks updated from hooks-config.json"
    else
      echo -e "${RED}❌${NC} Failed to update settings.json"
      exit 1
    fi
  else
    echo -e "${YELLOW}⚠️${NC}  settings.json not found, skipping hooks configuration"
  fi
else
  echo -e "${YELLOW}⚠️${NC}  hooks-config.json not found, skipping hooks configuration"
fi

echo ""

# ============================================
# PHASE 5: PROJECT CONFIG (idempotent)
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}PHASE 5: Project Config${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

CONFIG_DIR="$PROJECT_DIR/.claude/config"
mkdir -p "$CONFIG_DIR"
echo -e "${GREEN}✅${NC} Verified .claude/config/ exists"

PROJECT_YML="$CONFIG_DIR/project.yml"
if [ ! -f "$PROJECT_YML" ]; then
  cp "$SCRIPT_DIR/templates/project.yml.example" "$PROJECT_YML"
  echo -e "${GREEN}✅${NC} Created project.yml (edit to customize CLAUDE.md generation)"
else
  echo -e "${GREEN}✅${NC} project.yml exists"
fi

LOCAL_MD="$CONFIG_DIR/CLAUDE-LOCAL.md"
if [ ! -f "$LOCAL_MD" ]; then
  cp "$SCRIPT_DIR/templates/CLAUDE-LOCAL.md.example" "$LOCAL_MD"
  echo -e "${GREEN}✅${NC} Created CLAUDE-LOCAL.md (for project-specific additions)"
else
  echo -e "${GREEN}✅${NC} CLAUDE-LOCAL.md exists"
fi

echo ""

# ============================================
# PHASE 6: GENERATE CLAUDE.MD
# ============================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}PHASE 6: Generate CLAUDE.md${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ -f "$PROJECT_YML" ]; then
  "$SCRIPT_DIR/scripts/generate-claude-md.sh" "$PROJECT_DIR"
else
  echo -e "${YELLOW}⚠️${NC}  Skipping CLAUDE.md generation (no project.yml)"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Edit .claude/config/project.yml to match your project"
echo "  2. Run: ./setup-all.sh --update $PROJECT_DIR  (to regenerate CLAUDE.md)"
echo "  3. Restart Claude Code"
echo ""
echo -e "${BLUE}Maintenance:${NC}"
echo "  --update   Re-generate CLAUDE.md from project.yml"
echo "  --validate Check project.yml + all symlinks"
echo ""
