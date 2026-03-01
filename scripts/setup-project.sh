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
echo -e "${BLUE}Project Setup v2.0${NC}"
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
echo -e "${BLUE}[1/5] Patterns${NC}"
ensure_symlink "$KNOWLEDGE_DIR/patterns" "$GLOBAL_PATTERNS" "patterns -> global patterns"
echo ""

# --- 2. Patterns-local directory ---
echo -e "${BLUE}[2/5] Patterns-local${NC}"
PATTERNS_LOCAL_DIR="$KNOWLEDGE_DIR/patterns-local"
if [ ! -d "$PATTERNS_LOCAL_DIR" ]; then
  mkdir -p "$PATTERNS_LOCAL_DIR"
  echo -e "  ${GREEN}Created:${NC} patterns-local/"
else
  echo -e "  ${YELLOW}Already exists:${NC} patterns-local/"
fi
echo ""

# --- 3. Rules symlinks (based on project.language) ---
echo -e "${BLUE}[3/5] Rules${NC}"
PROJECT_LANGUAGE=$(yml_get "project.language")

RULES_DIR="$KNOWLEDGE_DIR/rules"
mkdir -p "$RULES_DIR"

if [[ -n "$PROJECT_LANGUAGE" ]]; then
  # Always link common rules
  COMMON_RULES_SOURCE="$PATTERNS_REPO/rules/common"
  if [[ -d "$COMMON_RULES_SOURCE" ]]; then
    ensure_symlink "$RULES_DIR/common" "$COMMON_RULES_SOURCE" "rules/common"
  fi

  # Link language-specific rules
  LANG_RULES_SOURCE="$PATTERNS_REPO/rules/$PROJECT_LANGUAGE"
  if [[ -d "$LANG_RULES_SOURCE" ]]; then
    ensure_symlink "$RULES_DIR/$PROJECT_LANGUAGE" "$LANG_RULES_SOURCE" "rules/$PROJECT_LANGUAGE"
  else
    echo -e "  ${YELLOW}Warning:${NC} No rules found for language '$PROJECT_LANGUAGE'"
  fi

  # Clean up stale language rule symlinks (languages removed from config)
  for link in "$RULES_DIR"/*/; do
    [[ -L "${link%/}" ]] || continue
    link_name=$(basename "${link%/}")
    if [[ "$link_name" != "common" && "$link_name" != "$PROJECT_LANGUAGE" ]]; then
      echo -e "  ${YELLOW}Removing stale:${NC} rules/$link_name"
      rm "${link%/}"
    fi
  done
else
  echo -e "  ${YELLOW}Skipped:${NC} No project.language configured in project.yml"
fi
echo ""

# --- 4. Skills symlinks (based on skills list) ---
echo -e "${BLUE}[4/5] Skills${NC}"
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
echo -e "${BLUE}[5/5] Stack profile configs${NC}"
STACK_PROFILE=$(yml_get "project.stack_profile")

if [[ -n "$STACK_PROFILE" ]]; then
  # Generic hook config discovery: look for exact {profile}-hooks.json first, then base stack name
  # e.g. flutter-clean-arch → try flutter-clean-arch-hooks.json, then flutter-hooks.json
  PROFILE_HOOKS="$PATTERNS_REPO/templates/${STACK_PROFILE}-hooks.json"
  BASE_STACK="${STACK_PROFILE%%-*}"  # "nestjs-ddd" → "nestjs", "flutter-clean-arch" → "flutter"
  BASE_HOOKS="$PATTERNS_REPO/templates/${BASE_STACK}-hooks.json"

  # Special case: nestjs-ddd → ddd-hooks.json (legacy naming)
  LEGACY_HOOKS="$PATTERNS_REPO/templates/ddd-hooks.json"

  HOOKS_SOURCE=""
  if [[ -f "$PROFILE_HOOKS" ]]; then
    HOOKS_SOURCE="$PROFILE_HOOKS"
  elif [[ -f "$BASE_HOOKS" ]]; then
    HOOKS_SOURCE="$BASE_HOOKS"
  elif [[ "$STACK_PROFILE" == "nestjs-ddd" && -f "$LEGACY_HOOKS" ]]; then
    HOOKS_SOURCE="$LEGACY_HOOKS"
  fi

  if [[ -n "$HOOKS_SOURCE" ]]; then
    HOOKS_FILENAME=$(basename "$HOOKS_SOURCE")
    HOOKS_TARGET="$PROJECT_DIR/$HOOKS_FILENAME"

    if [[ -f "$HOOKS_TARGET" ]]; then
      if diff -q "$HOOKS_SOURCE" "$HOOKS_TARGET" > /dev/null 2>&1; then
        echo -e "  ${YELLOW}Up to date:${NC} $HOOKS_FILENAME"
      else
        cp "$HOOKS_SOURCE" "$HOOKS_TARGET"
        echo -e "  ${GREEN}Updated:${NC} $HOOKS_FILENAME (synced from template)"
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

# --- Auto-run generate-claude-md.sh ---
echo -e "${BLUE}Regenerating CLAUDE.md...${NC}"
if [[ -f "$PROJECT_YML" ]]; then
  bash "$SCRIPT_DIR/generate-claude-md.sh" "$PROJECT_DIR"
else
  echo -e "${YELLOW}Skipped:${NC} No project.yml found (CLAUDE.md not regenerated)"
fi

echo ""
echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}Project setup complete!${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

exit 0
