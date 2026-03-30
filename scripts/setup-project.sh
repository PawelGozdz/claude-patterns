#!/bin/bash
# setup-project.sh - Setup per-project symlinks (patterns, rules, skills)
#
# Usage: ./setup-project.sh /path/to/project
# Run from: anywhere

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATTERNS_REPO="$(dirname "$SCRIPT_DIR")"

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Project Setup v3.0${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Parse arguments
PROJECT_DIR="${1:-.}"  # Default to current directory if not provided
GLOBAL_PATTERNS="$PATTERNS_REPO/patterns"

# Resolve absolute path
PROJECT_DIR=$(cd "$PROJECT_DIR" && pwd)

echo -e "${BLUE}Project:${NC} $PROJECT_DIR"
echo -e "${BLUE}Patterns repo:${NC} $PATTERNS_REPO"
echo ""

# Validate project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
  echo -e "${RED}Error: Project directory not found: $PROJECT_DIR${NC}"
  exit 1
fi

# Validate global patterns exist
if [ ! -d "$GLOBAL_PATTERNS" ]; then
  echo -e "${RED}Error: Global patterns not found: $GLOBAL_PATTERNS${NC}"
  echo "   Run setup-global.sh first"
  exit 1
fi

# --- YAML helpers (copied from generate-claude-md.sh) ---

PROJECT_YML="$PROJECT_DIR/.claude/config/project.yml"

yml_get() {
  local key="$1"
  local section="${key%%.*}"
  local field="${key#*.}"

  if [[ ! -f "$PROJECT_YML" ]]; then return; fi

  if [[ "$section" == "$field" ]]; then
    grep "^${key}:" "$PROJECT_YML" | head -1 | sed 's/^[^:]*: *//' | sed 's/^"//' | sed 's/"$//'
  else
    sed -n "/^${section}:/,/^[a-z]/p" "$PROJECT_YML" | grep "^  ${field}:" | head -1 | sed 's/^[^:]*: *//' | sed 's/^"//' | sed 's/"$//'
  fi
}

yml_list() {
  local section="$1"
  if [[ ! -f "$PROJECT_YML" ]]; then return; fi
  sed -n "/^${section}:/,/^[a-z]/p" "$PROJECT_YML" | grep '^  - ' | sed 's/^  - //' | sed 's/^"//' | sed 's/"$//'
}

# --- Helper: create or verify a symlink ---
# Usage: ensure_symlink <link_path> <target_path> <display_name>
ensure_symlink() {
  local link_path="$1"
  local target_path="$2"
  local display_name="$3"

  if [ -L "$link_path" ]; then
    CURRENT_TARGET=$(readlink "$link_path")
    if [ "$CURRENT_TARGET" = "$target_path" ]; then
      echo -e "  ${YELLOW}Already exists:${NC} $display_name"
      return 0
    else
      echo -e "  ${YELLOW}Updating:${NC} $display_name (was: $CURRENT_TARGET)"
      rm "$link_path"
      ln -sf "$target_path" "$link_path"
      return 0
    fi
  elif [ -d "$link_path" ]; then
    echo -e "  ${YELLOW}Warning:${NC} $display_name is a real directory, skipping"
    return 1
  else
    ln -sf "$target_path" "$link_path"
    echo -e "  ${GREEN}Created:${NC} $display_name"
    return 0
  fi
}

# --- Create .claude/knowledge structure ---
KNOWLEDGE_DIR="$PROJECT_DIR/.claude/knowledge"
mkdir -p "$KNOWLEDGE_DIR"

# --- 1. Patterns symlink ---
echo -e "${BLUE}[1/7] Patterns${NC}"
PROJECT_LANGUAGE=$(yml_get "project.language")
if [[ "$PROJECT_LANGUAGE" == "typescript" || -z "$PROJECT_LANGUAGE" ]]; then
  ensure_symlink "$KNOWLEDGE_DIR/patterns" "$GLOBAL_PATTERNS" "patterns -> global patterns"
else
  # Patterns are TypeScript/DDD-specific — skip for other languages
  if [ -L "$KNOWLEDGE_DIR/patterns" ]; then
    rm "$KNOWLEDGE_DIR/patterns"
    echo -e "  ${YELLOW}Removed:${NC} patterns symlink (TS-specific, not applicable for $PROJECT_LANGUAGE)"
  else
    echo -e "  ${YELLOW}Skipped:${NC} patterns (TS-specific — use patterns-local/ for $PROJECT_LANGUAGE patterns)"
  fi
fi
echo ""

# --- 2. Patterns-local directory ---
echo -e "${BLUE}[2/7] Patterns-local${NC}"
PATTERNS_LOCAL_DIR="$KNOWLEDGE_DIR/patterns-local"
if [ ! -d "$PATTERNS_LOCAL_DIR" ]; then
  mkdir -p "$PATTERNS_LOCAL_DIR"
  echo -e "  ${GREEN}Created:${NC} patterns-local/"
else
  echo -e "  ${YELLOW}Already exists:${NC} patterns-local/"
fi
echo ""

# --- 3. Rules: migrate from knowledge/rules/ to native .claude/rules/ ---
echo -e "${BLUE}[3/7] Rules (.claude/rules/ — native auto-discovery)${NC}"
PROJECT_LANGUAGE=$(yml_get "project.language")

# Remove deprecated .claude/knowledge/rules/ (replaced by native .claude/rules/)
OLD_RULES_DIR="$KNOWLEDGE_DIR/rules"
if [[ -d "$OLD_RULES_DIR" ]]; then
  # Remove symlinks inside (not real directories)
  for link in "$OLD_RULES_DIR"/*/; do
    [[ -L "${link%/}" ]] && rm "${link%/}"
  done
  # Remove the directory if empty
  rmdir "$OLD_RULES_DIR" 2>/dev/null && echo -e "  ${YELLOW}Removed:${NC} knowledge/rules/ (migrated to .claude/rules/)" || true
fi

# Create native .claude/rules/ (auto-discovered by Claude Code)
echo -e "${BLUE}       Native rules (.claude/rules/ — auto-discovery)${NC}"
NATIVE_RULES_DIR="$PROJECT_DIR/.claude/rules"
mkdir -p "$NATIVE_RULES_DIR"

if [[ -n "$PROJECT_LANGUAGE" ]]; then
  COMMON_RULES_SOURCE="$PATTERNS_REPO/rules/common"
  if [[ -d "$COMMON_RULES_SOURCE" ]]; then
    ensure_symlink "$NATIVE_RULES_DIR/common" "$COMMON_RULES_SOURCE" ".claude/rules/common"
  fi

  LANG_RULES_SOURCE="$PATTERNS_REPO/rules/$PROJECT_LANGUAGE"
  if [[ -d "$LANG_RULES_SOURCE" ]]; then
    ensure_symlink "$NATIVE_RULES_DIR/$PROJECT_LANGUAGE" "$LANG_RULES_SOURCE" ".claude/rules/$PROJECT_LANGUAGE"
  fi

  # Clean up stale language rule symlinks
  for link in "$NATIVE_RULES_DIR"/*/; do
    [[ -L "${link%/}" ]] || continue
    link_name=$(basename "${link%/}")
    if [[ "$link_name" != "common" && "$link_name" != "$PROJECT_LANGUAGE" ]]; then
      echo -e "  ${YELLOW}Removing stale:${NC} .claude/rules/$link_name"
      rm "${link%/}"
    fi
  done
else
  echo -e "  ${YELLOW}Skipped:${NC} No project.language configured"
fi
echo ""

# --- 4. Skills symlinks (based on skills list) ---
echo -e "${BLUE}[4/7] Skills${NC}"
SKILLS_DIR="$KNOWLEDGE_DIR/skills"
mkdir -p "$SKILLS_DIR"

# Collect configured skill categories
CONFIGURED_SKILLS=()
while IFS= read -r category; do
  [[ -z "$category" ]] && continue
  CONFIGURED_SKILLS+=("$category")

  SKILL_SOURCE="$PATTERNS_REPO/skills/$category"
  if [[ -d "$SKILL_SOURCE" ]]; then
    ensure_symlink "$SKILLS_DIR/$category" "$SKILL_SOURCE" "skills/$category"
  else
    echo -e "  ${YELLOW}Warning:${NC} Skill category '$category' not found in repo"
  fi
done < <(yml_list "skills")

if [[ ${#CONFIGURED_SKILLS[@]} -eq 0 ]]; then
  echo -e "  ${YELLOW}Skipped:${NC} No skills configured in project.yml"
fi

# Clean up stale skill symlinks (categories removed from project.yml)
for link in "$SKILLS_DIR"/*/; do
  [[ -L "${link%/}" ]] || continue
  link_name=$(basename "${link%/}")
  found=false
  for cat in "${CONFIGURED_SKILLS[@]}"; do
    if [[ "$cat" == "$link_name" ]]; then
      found=true
      break
    fi
  done
  if [[ "$found" == "false" ]]; then
    echo -e "  ${YELLOW}Removing stale:${NC} skills/$link_name"
    rm "${link%/}"
  fi
done

echo ""

# --- 5. Stack profile configs (ddd-hooks.json, etc.) ---
echo -e "${BLUE}[5/7] Stack profile configs${NC}"
STACK_PROFILE=$(yml_get "project.stack_profile")

if [[ -n "$STACK_PROFILE" ]]; then
  # Hook config filenames are defined by the hook scripts themselves:
  #   ddd-config.js    → looks for "ddd-hooks.json"
  #   flutter-config.js → looks for "flutter-hooks.json"
  #   python-config.js  → looks for "python-hooks.json"
  #
  # Map stack_profile → hook config filename that hooks actually search for
  case "$STACK_PROFILE" in
    nestjs-ddd)       HOOKS_FILENAME="ddd-hooks.json" ;;
    flutter*)         HOOKS_FILENAME="flutter-hooks.json" ;;
    python*)          HOOKS_FILENAME="python-hooks.json" ;;
    *)                HOOKS_FILENAME="" ;;
  esac

  # Find the template source file in templates/
  HOOKS_SOURCE=""
  if [[ -n "$HOOKS_FILENAME" ]]; then
    # Try exact match first, then profile-specific template
    PROFILE_HOOKS="$PATTERNS_REPO/templates/${STACK_PROFILE}-hooks.json"
    CANONICAL_HOOKS="$PATTERNS_REPO/templates/$HOOKS_FILENAME"

    if [[ -f "$PROFILE_HOOKS" ]]; then
      HOOKS_SOURCE="$PROFILE_HOOKS"
    elif [[ -f "$CANONICAL_HOOKS" ]]; then
      HOOKS_SOURCE="$CANONICAL_HOOKS"
    fi
  fi

  if [[ -n "$HOOKS_SOURCE" ]]; then
    HOOKS_TARGET="$PROJECT_DIR/$HOOKS_FILENAME"

    if [[ -f "$HOOKS_TARGET" ]]; then
      if diff -q "$HOOKS_SOURCE" "$HOOKS_TARGET" > /dev/null 2>&1; then
        echo -e "  ${YELLOW}Up to date:${NC} $HOOKS_FILENAME"
      else
        echo -e "  ${YELLOW}Custom config:${NC} $HOOKS_FILENAME differs from template (preserved)"
        echo -e "  ${YELLOW}  Template at:${NC} $HOOKS_SOURCE"
      fi
    else
      cp "$HOOKS_SOURCE" "$HOOKS_TARGET"
      echo -e "  ${GREEN}Created:${NC} $HOOKS_FILENAME (${STACK_PROFILE} enforcement hooks config)"
    fi
  else
    echo -e "  ${YELLOW}Skipped:${NC} No hooks template found for profile '$STACK_PROFILE'"
  fi
else
  echo -e "  ${YELLOW}Skipped:${NC} No stack_profile configured in project.yml"
fi
echo ""

# --- 6. .mcp.json (project-scope MCP server) ---
echo -e "${BLUE}[6/7] MCP configuration (.mcp.json)${NC}"
MCP_JSON="$PROJECT_DIR/.mcp.json"
MCP_TEMPLATE="$PATTERNS_REPO/templates/mcp.json.template"

if [[ -f "$MCP_JSON" ]]; then
  echo -e "  ${YELLOW}Already exists:${NC} .mcp.json (preserved)"
elif [[ -f "$MCP_TEMPLATE" ]]; then
  # Expand ${HOME} in template
  sed "s|%%PATTERNS_REPO%%|$PATTERNS_REPO|g" "$MCP_TEMPLATE" > "$MCP_JSON"
  echo -e "  ${GREEN}Created:${NC} .mcp.json (claude-patterns MCP server)"
else
  echo -e "  ${YELLOW}Skipped:${NC} MCP template not found"
fi
echo ""

# --- 7. Regenerate CLAUDE.md ---
echo -e "${BLUE}[7/7] CLAUDE.md generation${NC}"
if [[ -f "$PROJECT_YML" ]]; then
  bash "$SCRIPT_DIR/generate-claude-md.sh" "$PROJECT_DIR"
else
  echo -e "${YELLOW}Skipped:${NC} No project.yml found (CLAUDE.md not regenerated)"
fi
echo ""

# --- Verification ---
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Verification${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Count patterns
if [ -L "$KNOWLEDGE_DIR/patterns" ]; then
  PATTERN_COUNT=$(find "$KNOWLEDGE_DIR/patterns" -name "*.md" -not -name "README.md" -not -name "METADATA.yml" 2>/dev/null | wc -l)
  echo -e "${GREEN}Patterns:${NC} $PATTERN_COUNT"
fi

# Count rules
RULE_COUNT=0
for dir in "$RULES_DIR"/*/; do
  [[ -d "$dir" ]] || continue
  count=$(find "$dir" -name "*.md" 2>/dev/null | wc -l)
  RULE_COUNT=$((RULE_COUNT + count))
done
echo -e "${GREEN}Rules:${NC} $RULE_COUNT (language: ${PROJECT_LANGUAGE:-none})"

# Count skills
SKILL_COUNT=0
for dir in "$SKILLS_DIR"/*/; do
  [[ -d "$dir" ]] || continue
  count=$(find "$dir" -name "SKILL.md" 2>/dev/null | wc -l)
  SKILL_COUNT=$((SKILL_COUNT + count))
done
echo -e "${GREEN}Skills:${NC} $SKILL_COUNT (categories: ${#CONFIGURED_SKILLS[@]})"

# Check stack profile configs (generic: find any *-hooks.json)
for hooks_file in "$PROJECT_DIR"/*-hooks.json; do
  [[ -f "$hooks_file" ]] || continue
  hooks_name=$(basename "$hooks_file")
  echo -e "${GREEN}Hooks:${NC} configured ($hooks_name)"
done

echo ""

echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}Project setup complete!${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

exit 0
