#!/bin/bash
# setup-global.sh v3.0 - Setup global Claude Code resources (one-time per machine)
#
# Creates symlinks in ~/.claude/ pointing to claude-patterns repo:
#   agents/  → universal specialists + verifiers (with permissionMode, memory, isolation)
#   commands/ → global slash commands (/plan, /tdd, /scaffold, etc.)
#   hooks/   → universal hooks only (stack-specific hooks are per-project)
#
# Stack-specific hooks (DDD, Flutter, Python) are NOT global.
# They are injected into per-project .claude/settings.json by setup-project.sh.
#
# Usage: ./scripts/setup-global.sh

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_CLAUDE_DIR="$HOME/.claude"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Global Setup v3.0${NC}"
echo -e "${BLUE}================================${NC}"
echo ""
echo -e "${BLUE}Repository:${NC} $REPO_DIR"
echo -e "${BLUE}Target:${NC} $USER_CLAUDE_DIR"
echo ""

mkdir -p "$USER_CLAUDE_DIR"

# --- Helper: setup a symlink (non-interactive for automation) ---
setup_symlink() {
  local name="$1"
  local source_dir="$2"
  local target="$USER_CLAUDE_DIR/$name"

  if [ -L "$target" ]; then
    CURRENT_TARGET=$(readlink "$target")
    if [ "$CURRENT_TARGET" = "$source_dir" ]; then
      echo -e "  ${YELLOW}Already correct:${NC} $name"
    else
      rm "$target"
      ln -sf "$source_dir" "$target"
      echo -e "  ${GREEN}Updated:${NC} $name (was: $CURRENT_TARGET)"
    fi
  elif [ -d "$target" ]; then
    BACKUP_DIR="$target.backup.$(date +%Y%m%d-%H%M%S)"
    mv "$target" "$BACKUP_DIR"
    ln -sf "$source_dir" "$target"
    echo -e "  ${GREEN}Created:${NC} $name (backed up existing to: $(basename $BACKUP_DIR))"
  else
    ln -sf "$source_dir" "$target"
    echo -e "  ${GREEN}Created:${NC} $name"
  fi
}

# --- Global agents (universal only — stack-specific are per-project) ---
echo -e "${BLUE}[1/3] Agents${NC} (universal specialists — stack agents are per-project)"

# Remove old symlink if it pointed to entire agents/ dir
if [ -L "$USER_CLAUDE_DIR/agents" ]; then
  rm "$USER_CLAUDE_DIR/agents"
  echo -e "  ${YELLOW}Removed:${NC} old agents/ symlink (migrating to per-file links)"
fi
mkdir -p "$USER_CLAUDE_DIR/agents"

# Link universal agents (stack-agnostic)
for agent_file in "$REPO_DIR/agents/universal/"*.md; do
  [ -f "$agent_file" ] || continue
  agent_name=$(basename "$agent_file")
  target="$USER_CLAUDE_DIR/agents/$agent_name"
  if [ -L "$target" ]; then
    echo -e "  ${YELLOW}Already linked:${NC} $agent_name"
  else
    ln -sf "$agent_file" "$target"
    echo -e "  ${GREEN}Linked:${NC} $agent_name"
  fi
done

# Link integration agents (globally available — e.g. grant-flow-time-logger)
if [[ -d "$REPO_DIR/agents/integrations" ]]; then
  for agent_file in "$REPO_DIR/agents/integrations/"*.md; do
    [ -f "$agent_file" ] || continue
    agent_name=$(basename "$agent_file")
    target="$USER_CLAUDE_DIR/agents/$agent_name"
    if [ -L "$target" ]; then
      echo -e "  ${YELLOW}Already linked:${NC} $agent_name (integration)"
    else
      ln -sf "$agent_file" "$target"
      echo -e "  ${GREEN}Linked:${NC} $agent_name (integration)"
    fi
  done
fi
echo ""

echo -e "${BLUE}[2/3] Commands${NC} (slash commands: /plan, /tdd, /scaffold, etc.)"
setup_symlink "commands" "$REPO_DIR/commands"
echo ""

echo -e "${BLUE}[3/4] Hooks${NC} (universal only — stack hooks are per-project)"
setup_symlink "hooks" "$REPO_DIR/hooks"
echo ""

echo -e "${BLUE}[4/4] Output Styles${NC} (strategist voice presets)"
if [ -d "$REPO_DIR/output-styles" ]; then
  setup_symlink "output-styles" "$REPO_DIR/output-styles"
else
  echo -e "  ${YELLOW}Skipped:${NC} output-styles directory missing"
fi
echo ""

# --- Cleanup: remove global skills (per-project only) ---
if [ -L "$USER_CLAUDE_DIR/skills" ]; then
  rm "$USER_CLAUDE_DIR/skills"
  echo -e "${YELLOW}Removed:${NC} global skills symlink (skills are per-project via project.yml)"
  echo ""
fi

# --- Verification ---
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Verification${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

for resource in agents commands hooks; do
  if [ -L "$USER_CLAUDE_DIR/$resource" ]; then
    target=$(readlink "$USER_CLAUDE_DIR/$resource")
    count=$(find "$target" -maxdepth 3 \( -name "*.md" -o -name "*.json" -o -name "*.js" \) ! -name "README.md" 2>/dev/null | wc -l)
    echo -e "${GREEN}$resource${NC} → $target ($count files)"
  fi
done

echo ""
echo -e "${BLUE}Hook architecture:${NC}"
echo -e "  Global (hooks.json):     session lifecycle, formatting, console.log, git push, subagent monitoring"
echo -e "  Per-project (settings):  DDD patterns, Flutter clean arch, Python layers/typing"
echo ""
echo -e "${GREEN}Global setup complete!${NC}"
echo ""
echo -e "Next steps:"
echo -e "  New project:       ${BLUE}./scripts/setup-project.sh /path/to/project${NC}"
echo -e "  Migrate existing:  ${BLUE}./scripts/migrate-v2.sh /path/to/project${NC}"
echo -e "  Migrate all:       ${BLUE}./scripts/migrate-all.sh${NC}"
echo ""
