#!/bin/bash
# setup-project.sh - Setup per-project symlinks (patterns, rules, skills, PM)
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

# --- 1. Patterns symlink (stack-aware) ---
echo -e "${BLUE}[1/8] Patterns${NC}"
PROJECT_LANGUAGE=$(yml_get "project.language")
STACK_PROFILE=$(yml_get "project.stack_profile")

# Core pattern directories shared across all stacks (stack-agnostic)
CORE_PATTERN_DIRS=(architecture testing cross-layer orchestration)

# DDD-specific pattern directories (nestjs-ddd only)
DDD_PATTERN_DIRS=(domain application infrastructure)

# Helper: migrate old single symlink to directory with per-subdir symlinks
# Usage: link_pattern_dirs <dir1> <dir2> ...
link_pattern_dirs() {
  local target_dir="$KNOWLEDGE_DIR/patterns"

  # Migration: remove old single symlink pointing to entire patterns/
  if [[ -L "$target_dir" ]]; then
    echo -e "  ${YELLOW}Migrating:${NC} removing old single symlink (was: $(readlink "$target_dir"))"
    rm "$target_dir"
  fi

  mkdir -p "$target_dir"

  # Link requested subdirectories
  local requested_dirs=("$@")
  for subdir in "${requested_dirs[@]}"; do
    local source="$GLOBAL_PATTERNS/$subdir"
    if [[ -d "$source" ]]; then
      ensure_symlink "$target_dir/$subdir" "$source" "patterns/$subdir"
    else
      echo -e "  ${YELLOW}Warning:${NC} Pattern dir '$subdir' not found"
    fi
  done

  # Clean up stale subdirectory symlinks (removed from this stack's list)
  for link in "$target_dir"/*/; do
    [[ -L "${link%/}" ]] || continue
    local link_name
    link_name=$(basename "${link%/}")
    local found=false
    for req in "${requested_dirs[@]}"; do
      if [[ "$req" == "$link_name" ]]; then
        found=true
        break
      fi
    done
    if [[ "$found" == "false" ]]; then
      echo -e "  ${YELLOW}Removing stale:${NC} patterns/$link_name (not in stack profile)"
      rm "${link%/}"
    fi
  done
}

# Determine which patterns to link based on stack_profile
case "$STACK_PROFILE" in
  nestjs-ddd)
    # DDD core + shared core patterns (NO flutter/python/nextjs/sveltekit/ts-library)
    link_pattern_dirs "${DDD_PATTERN_DIRS[@]}" "${CORE_PATTERN_DIRS[@]}"
    ;;
  flutter*)
    # Flutter + shared core patterns
    link_pattern_dirs flutter "${CORE_PATTERN_DIRS[@]}"
    ;;
  sveltekit*)
    # SvelteKit + shared core patterns
    link_pattern_dirs sveltekit "${CORE_PATTERN_DIRS[@]}"
    ;;
  nextjs*)
    # Next.js + shared core patterns
    link_pattern_dirs nextjs "${CORE_PATTERN_DIRS[@]}"
    ;;
  python*)
    # Python + shared core patterns
    link_pattern_dirs python "${CORE_PATTERN_DIRS[@]}"
    ;;
  typescript-library)
    # TypeScript library + shared core patterns
    link_pattern_dirs typescript-library "${CORE_PATTERN_DIRS[@]}"
    ;;
  *)
    # Unknown stack — link all patterns
    if [[ "$PROJECT_LANGUAGE" == "typescript" ]]; then
      link_pattern_dirs "${DDD_PATTERN_DIRS[@]}" "${CORE_PATTERN_DIRS[@]}" flutter sveltekit nextjs typescript-library
    else
      echo -e "  ${YELLOW}Skipped:${NC} No patterns for stack '$STACK_PROFILE' (use patterns-local/)"
    fi
    ;;
esac
echo ""

# --- 2. Patterns-local directory ---
echo -e "${BLUE}[2/8] Patterns-local${NC}"
PATTERNS_LOCAL_DIR="$KNOWLEDGE_DIR/patterns-local"
if [ ! -d "$PATTERNS_LOCAL_DIR" ]; then
  mkdir -p "$PATTERNS_LOCAL_DIR"
  echo -e "  ${GREEN}Created:${NC} patterns-local/"
else
  echo -e "  ${YELLOW}Already exists:${NC} patterns-local/"
fi
echo ""

# --- 2b. Stack-specific agents ---
echo -e "${BLUE}[2b/8] Stack agents${NC}"
PROJECT_AGENTS_DIR="$PROJECT_DIR/.claude/agents"

# Try exact match first, then base stack (e.g., python-pipeline → python)
STACK_AGENTS_DIR="$PATTERNS_REPO/agents/stacks/$STACK_PROFILE"
if [[ ! -d "$STACK_AGENTS_DIR" ]]; then
  BASE_STACK="${STACK_PROFILE%%-*}"
  STACK_AGENTS_DIR="$PATTERNS_REPO/agents/stacks/$BASE_STACK"
fi

if [[ -d "$STACK_AGENTS_DIR" ]]; then
  mkdir -p "$PROJECT_AGENTS_DIR"
  for agent_file in "$STACK_AGENTS_DIR"/*.md; do
    [[ -f "$agent_file" ]] || continue
    agent_name=$(basename "$agent_file")
    target="$PROJECT_AGENTS_DIR/$agent_name"
    if [[ -L "$target" ]]; then
      echo -e "  ${YELLOW}Already linked:${NC} $agent_name"
    else
      ln -sf "$agent_file" "$target"
      echo -e "  ${GREEN}Linked:${NC} $agent_name (${STACK_PROFILE})"
    fi
  done
else
  echo -e "  ${YELLOW}Skipped:${NC} No stack agents for '$STACK_PROFILE'"
fi
echo ""

# --- 3. Rules: migrate from knowledge/rules/ to native .claude/rules/ ---
echo -e "${BLUE}[3/8] Rules (.claude/rules/ — native auto-discovery)${NC}"
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
    ensure_symlink "$NATIVE_RULES_DIR/common" "$COMMON_RULES_SOURCE" ".claude/rules/common" || true
  fi

  LANG_RULES_SOURCE="$PATTERNS_REPO/rules/$PROJECT_LANGUAGE"
  if [[ -d "$LANG_RULES_SOURCE" ]]; then
    ensure_symlink "$NATIVE_RULES_DIR/$PROJECT_LANGUAGE" "$LANG_RULES_SOURCE" ".claude/rules/$PROJECT_LANGUAGE" || true
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
echo -e "${BLUE}[4/8] Skills${NC}"
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
echo -e "${BLUE}[5/8] Stack profile configs${NC}"
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
echo -e "${BLUE}[6/8] MCP configuration (.mcp.json)${NC}"
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

# --- 7. Project Management System (optional) ---
echo -e "${BLUE}[7/8] Project Management System${NC}"
PM_DIR="$PROJECT_DIR/project-orchestration"
PM_TEMPLATE="$PATTERNS_REPO/templates/project-orchestration"

if [[ -d "$PM_DIR" ]]; then
  echo -e "  ${YELLOW}Already exists:${NC} project-orchestration/ (preserved)"

  # Check if pm-task-check hook is configured in project settings
  PROJECT_SETTINGS="$PROJECT_DIR/.claude/settings.json"
  if [[ -f "$PROJECT_SETTINGS" ]] && grep -q "pm-task-check" "$PROJECT_SETTINGS" 2>/dev/null; then
    echo -e "  ${YELLOW}Hook configured:${NC} pm-task-check.js in settings.json"
  else
    echo -e "  ${YELLOW}Hint:${NC} Add pm-task-check hook to .claude/settings.json for auto-briefing"
    echo -e "  ${YELLOW}  See:${NC} patterns/orchestration/project-management-system.md (Setup step 3)"
  fi
elif [[ -d "$PM_TEMPLATE" ]]; then
  # Check if project.yml has pm_system enabled
  PM_ENABLED=$(yml_get "project.pm_system")
  if [[ "$PM_ENABLED" == "true" ]]; then
    cp -r "$PM_TEMPLATE" "$PM_DIR"
    echo -e "  ${GREEN}Created:${NC} project-orchestration/ (from template)"
    echo -e "  ${GREEN}  Next:${NC} Edit TEAM-STATE.md with project name, then run /pulse"

    # Add pm-task-check hook to project settings if not present
    PROJECT_SETTINGS="$PROJECT_DIR/.claude/settings.json"
    if [[ -f "$PROJECT_SETTINGS" ]]; then
      if ! grep -q "pm-task-check" "$PROJECT_SETTINGS" 2>/dev/null; then
        echo -e "  ${YELLOW}Hint:${NC} Add pm-task-check hook to .claude/settings.json:"
        echo -e "  ${YELLOW}  See:${NC} patterns/orchestration/project-management-system.md (Setup step 3)"
      fi
    fi
  else
    echo -e "  ${YELLOW}Skipped:${NC} pm_system not enabled in project.yml (set project.pm_system: true to enable)"
  fi
else
  echo -e "  ${YELLOW}Skipped:${NC} PM template not found"
fi
echo ""

# --- 8. Regenerate CLAUDE.md ---
echo -e "${BLUE}[8/8] CLAUDE.md generation${NC}"
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

# Count patterns (patterns/ is now a directory with per-subdir symlinks, not a single symlink)
if [ -d "$KNOWLEDGE_DIR/patterns" ]; then
  PATTERN_COUNT=$(find -L "$KNOWLEDGE_DIR/patterns" -name "*.md" -not -name "README.md" -not -name "METADATA.yml" 2>/dev/null | wc -l)
  PATTERN_DIRS=$(find "$KNOWLEDGE_DIR/patterns" -mindepth 1 -maxdepth 1 -type l 2>/dev/null | wc -l)
  echo -e "${GREEN}Patterns:${NC} $PATTERN_COUNT (${PATTERN_DIRS} categories)"
fi

# Count rules
RULE_COUNT=0
for dir in "$NATIVE_RULES_DIR"/*/; do
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

# Check PM system
if [[ -d "$PROJECT_DIR/project-orchestration" ]]; then
  TASK_COUNT=$(find "$PROJECT_DIR/project-orchestration/tasks" -name "*.md" 2>/dev/null | wc -l)
  echo -e "${GREEN}PM System:${NC} active ($TASK_COUNT tasks)"
fi

echo ""

echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}Project setup complete!${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

exit 0
