#!/bin/bash
# migrate-v2.sh - Migrate a project to v2 Claude Code features
#
# Adds:
#   - .claude/rules/ (native auto-discovery)
#   - .mcp.json (project-scope MCP)
#   - .worktreeinclude (env files for worktrees)
#   - Regenerated CLAUDE.md with @import directives
#
# Usage: ./migrate-v2.sh /path/to/project
# Safe to run multiple times (idempotent)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATTERNS_REPO="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="${1:-.}"
PROJECT_DIR=$(cd "$PROJECT_DIR" && pwd)
PROJECT_NAME=$(basename "$PROJECT_DIR")

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Migration to v2: ${PROJECT_NAME}${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Validate
if [[ ! -d "$PROJECT_DIR/.claude" ]]; then
  echo -e "${RED}Error: .claude/ not found in $PROJECT_DIR${NC}"
  echo -e "Run setup-project.sh first"
  exit 1
fi

PROJECT_YML="$PROJECT_DIR/.claude/config/project.yml"
if [[ ! -f "$PROJECT_YML" ]]; then
  echo -e "${RED}Error: project.yml not found${NC}"
  exit 1
fi

# YAML helper
yml_get() {
  local key="$1"
  local section="${key%%.*}"
  local field="${key#*.}"
  if [[ "$section" == "$field" ]]; then
    grep "^${key}:" "$PROJECT_YML" | head -1 | sed 's/^[^:]*: *//' | sed 's/^"//' | sed 's/"$//'
  else
    sed -n "/^${section}:/,/^[a-z]/p" "$PROJECT_YML" | grep "^  ${field}:" | head -1 | sed 's/^[^:]*: *//' | sed 's/^"//' | sed 's/"$//'
  fi
}

PROJECT_LANGUAGE=$(yml_get "project.language")
STACK_PROFILE=$(yml_get "project.stack_profile")

echo -e "${BLUE}Language:${NC} ${PROJECT_LANGUAGE:-none}"
echo -e "${BLUE}Stack:${NC} ${STACK_PROFILE:-none}"
echo ""

CHANGES=0

# --- 1. Native .claude/rules/ (replaces .claude/knowledge/rules/) ---
echo -e "${BLUE}[1/5] Native .claude/rules/${NC}"
NATIVE_RULES="$PROJECT_DIR/.claude/rules"

# Remove deprecated .claude/knowledge/rules/ (duplicated by .claude/rules/)
OLD_RULES="$PROJECT_DIR/.claude/knowledge/rules"
if [[ -d "$OLD_RULES" ]]; then
  for link in "$OLD_RULES"/*/; do
    [[ -L "${link%/}" ]] && rm "${link%/}"
  done
  rmdir "$OLD_RULES" 2>/dev/null && echo -e "  ${YELLOW}Removed:${NC} knowledge/rules/ (migrated to .claude/rules/)" || true
  CHANGES=$((CHANGES + 1))
fi

if [[ -n "$PROJECT_LANGUAGE" ]]; then
  mkdir -p "$NATIVE_RULES"

  # Common rules
  COMMON_SRC="$PATTERNS_REPO/rules/common"
  if [[ -d "$COMMON_SRC" && ! -L "$NATIVE_RULES/common" ]]; then
    ln -sf "$COMMON_SRC" "$NATIVE_RULES/common"
    echo -e "  ${GREEN}Created:${NC} .claude/rules/common"
    CHANGES=$((CHANGES + 1))
  else
    echo -e "  ${YELLOW}Already exists:${NC} .claude/rules/common"
  fi

  # Language rules
  LANG_SRC="$PATTERNS_REPO/rules/$PROJECT_LANGUAGE"
  if [[ -d "$LANG_SRC" && ! -L "$NATIVE_RULES/$PROJECT_LANGUAGE" ]]; then
    ln -sf "$LANG_SRC" "$NATIVE_RULES/$PROJECT_LANGUAGE"
    echo -e "  ${GREEN}Created:${NC} .claude/rules/$PROJECT_LANGUAGE"
    CHANGES=$((CHANGES + 1))
  else
    echo -e "  ${YELLOW}Already exists:${NC} .claude/rules/$PROJECT_LANGUAGE"
  fi
else
  echo -e "  ${YELLOW}Skipped:${NC} No project.language"
fi
echo ""

# --- 2. .mcp.json ---
echo -e "${BLUE}[2/5] .mcp.json${NC}"
MCP_JSON="$PROJECT_DIR/.mcp.json"
MCP_TEMPLATE="$PATTERNS_REPO/templates/mcp.json.template"
if [[ ! -f "$MCP_JSON" && -f "$MCP_TEMPLATE" ]]; then
  sed "s|%%PATTERNS_REPO%%|$PATTERNS_REPO|g" "$MCP_TEMPLATE" > "$MCP_JSON"
  echo -e "  ${GREEN}Created:${NC} .mcp.json"
  CHANGES=$((CHANGES + 1))
else
  echo -e "  ${YELLOW}Already exists:${NC} .mcp.json"
fi
echo ""

# --- 3. .worktreeinclude ---
echo -e "${BLUE}[3/5] .worktreeinclude${NC}"
WTI="$PROJECT_DIR/.worktreeinclude"
WTI_TEMPLATE="$PATTERNS_REPO/templates/.worktreeinclude"
if [[ ! -f "$WTI" && -f "$WTI_TEMPLATE" ]]; then
  cp "$WTI_TEMPLATE" "$WTI"
  echo -e "  ${GREEN}Created:${NC} .worktreeinclude"
  CHANGES=$((CHANGES + 1))
else
  echo -e "  ${YELLOW}Already exists:${NC} .worktreeinclude"
fi
echo ""

# --- 4. Stack-specific settings merge ---
echo -e "${BLUE}[4/5] Settings template${NC}"
SETTINGS_FILE="$PROJECT_DIR/.claude/settings.json"

# Determine which settings template to use
case "$STACK_PROFILE" in
  nestjs-ddd)           SETTINGS_TEMPLATE="$PATTERNS_REPO/templates/settings/nestjs-ddd.json" ;;
  sveltekit*)           SETTINGS_TEMPLATE="$PATTERNS_REPO/templates/settings/sveltekit.json" ;;
  nextjs*)              SETTINGS_TEMPLATE="$PATTERNS_REPO/templates/settings/nextjs-app.json" ;;
  flutter*)             SETTINGS_TEMPLATE="$PATTERNS_REPO/templates/settings/flutter.json" ;;
  python*)              SETTINGS_TEMPLATE="$PATTERNS_REPO/templates/settings/python.json" ;;
  typescript-library)   SETTINGS_TEMPLATE="$PATTERNS_REPO/templates/settings/typescript-library.json" ;;
  *)                    SETTINGS_TEMPLATE="$PATTERNS_REPO/templates/settings/base.json" ;;
esac

if [[ -f "$SETTINGS_TEMPLATE" ]]; then
  if [[ -f "$SETTINGS_FILE" ]]; then
    # Merge: add hooks, worktree, autoMode from template without overwriting existing permissions
    node -e "
      const fs = require('fs');
      const existing = JSON.parse(fs.readFileSync('$SETTINGS_FILE', 'utf8'));
      const template = JSON.parse(fs.readFileSync('$SETTINGS_TEMPLATE', 'utf8'));

      // Merge worktree config (template wins)
      if (template.worktree) existing.worktree = template.worktree;

      // Merge autoMode (template wins, doesn't touch permissions)
      if (template.autoMode) existing.autoMode = template.autoMode;

      // Merge hooks (add template hooks without removing existing)
      if (template.hooks) {
        if (!existing.hooks) existing.hooks = {};
        for (const [event, entries] of Object.entries(template.hooks)) {
          if (!existing.hooks[event]) {
            existing.hooks[event] = entries;
          } else {
            // Add only hooks with descriptions not already present
            const existingDescs = new Set(existing.hooks[event].map(e => e.description));
            for (const entry of entries) {
              if (!existingDescs.has(entry.description)) {
                existing.hooks[event].push(entry);
              }
            }
          }
        }
      }

      fs.writeFileSync('$SETTINGS_FILE', JSON.stringify(existing, null, 2) + '\n');
    "
    echo -e "  ${GREEN}Merged:${NC} .claude/settings.json (added ${STACK_PROFILE} hooks + worktree + autoMode)"
    CHANGES=$((CHANGES + 1))
  else
    cp "$SETTINGS_TEMPLATE" "$SETTINGS_FILE"
    echo -e "  ${GREEN}Created:${NC} .claude/settings.json (${STACK_PROFILE:-base} preset)"
    CHANGES=$((CHANGES + 1))
  fi
fi
echo ""

# --- 5. Update .gitignore ---
echo -e "${BLUE}[5/6] .gitignore${NC}"
GITIGNORE="$PROJECT_DIR/.gitignore"
GITIGNORE_TEMPLATE="$PATTERNS_REPO/templates/gitignore-claude.template"
if [[ -f "$GITIGNORE" && -f "$GITIGNORE_TEMPLATE" ]]; then
  # Add entries not already present
  ADDED=0
  while IFS= read -r line; do
    [[ -z "$line" || "$line" == \#* ]] && continue
    if ! grep -qxF "$line" "$GITIGNORE" 2>/dev/null; then
      echo "$line" >> "$GITIGNORE"
      ADDED=$((ADDED + 1))
    fi
  done < "$GITIGNORE_TEMPLATE"
  if [[ $ADDED -gt 0 ]]; then
    echo -e "  ${GREEN}Added:${NC} $ADDED entries to .gitignore"
    CHANGES=$((CHANGES + 1))
  else
    echo -e "  ${YELLOW}Up to date:${NC} .gitignore"
  fi
else
  echo -e "  ${YELLOW}Skipped:${NC} No .gitignore found"
fi
echo ""

# --- 6. Regenerate CLAUDE.md with @import ---
echo -e "${BLUE}[6/6] CLAUDE.md with @import${NC}"
bash "$SCRIPT_DIR/generate-claude-md.sh" "$PROJECT_DIR"
CHANGES=$((CHANGES + 1))
echo ""

# --- Summary ---
echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}Migration complete: ${CHANGES} changes${NC}"
echo -e "${BLUE}================================${NC}"
echo ""
echo -e "New features enabled:"
echo -e "  - .claude/rules/ auto-discovery (no CLAUDE.md reference needed)"
echo -e "  - .mcp.json project-scope MCP server"
echo -e "  - .worktreeinclude for env files in worktrees"
echo -e "  - CLAUDE.md with @import directives"
if [[ -f "$SETTINGS_FILE" ]]; then
  echo -e "  - worktree.symlinkDirectories configured"
  echo -e "  - autoMode classifier rules"
fi
echo ""
