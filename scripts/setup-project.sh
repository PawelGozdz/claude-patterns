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
#
# Positional: project directory (default: current directory).
# Flags (all optional, all additive — bez nich skrypt zachowuje się dokładnie jak dotąd):
#   --with-broadcast   włącz sekcję broadcastu (ADR 0006) bez pytania
#   --interactive      zapytaj o dodatki (broadcast); nigdy nie dotyczy rdzenia
PROJECT_DIR=""
WITH_BROADCAST=false
INTERACTIVE=false

for arg in "$@"; do
  case "$arg" in
    --with-broadcast) WITH_BROADCAST=true ;;
    --interactive)    INTERACTIVE=true ;;
    --*)
      echo -e "${YELLOW}Unknown flag ignored:${NC} $arg"
      ;;
    *)
      [[ -z "$PROJECT_DIR" ]] && PROJECT_DIR="$arg"
      ;;
  esac
done

PROJECT_DIR="${PROJECT_DIR:-.}"  # Default to current directory if not provided
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
# Creates parent directory if needed (supports nested skill categories
# like "finance/core", "finance/compliance" → .claude/knowledge/skills/finance/<plugin>/).
ensure_symlink() {
  local link_path="$1"
  local target_path="$2"
  local display_name="$3"

  # Ensure parent dir exists (for nested categories like finance/core)
  mkdir -p "$(dirname "$link_path")"

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
# _stack-defaults is also shared — orchestrator reads it to discover
# always-include patterns per stack profile.
CORE_PATTERN_DIRS=(architecture testing cross-layer orchestration _stack-defaults)

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

# Check for explicit patterns list in project.yml (takes precedence over stack_profile)
EXPLICIT_PATTERNS=()
while IFS= read -r pat; do
  [[ -z "$pat" ]] && continue
  EXPLICIT_PATTERNS+=("$pat")
done < <(yml_list "patterns")

if [[ ${#EXPLICIT_PATTERNS[@]} -gt 0 ]]; then
  # Explicit patterns list — use exactly what the project declares
  link_pattern_dirs "${EXPLICIT_PATTERNS[@]}"
else
  # Fallback: determine which patterns to link based on stack_profile
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
    node-ts-claude-api)
      # Node.js + Anthropic SDK — core patterns only (no DDD/flutter/etc.)
      link_pattern_dirs "${CORE_PATTERN_DIRS[@]}"
      ;;
    astro-static)
      # Astro SSG — core patterns only (architecture + testing essentials)
      link_pattern_dirs "${CORE_PATTERN_DIRS[@]}"
      ;;
    docs-only)
      # Pure markdown/YAML repo — no code patterns needed
      echo -e "  ${YELLOW}Skipped:${NC} docs-only stack has no code patterns"
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
fi

# Patterns README — discovery hub read by orchestrator Phase 0.5a and
# direct-invoked implementers. Copy from template if absent; preserve
# project-edited version if present.
PATTERNS_README="$KNOWLEDGE_DIR/patterns/README.md"
PATTERNS_README_TEMPLATE="$PATTERNS_REPO/templates/knowledge-patterns-readme-template.md"
if [[ ! -d "$KNOWLEDGE_DIR/patterns" ]]; then
  echo -e "  ${YELLOW}Skipped:${NC} patterns/README.md (no patterns directory for this stack)"
elif [[ -f "$PATTERNS_README" ]]; then
  echo -e "  ${YELLOW}Already exists:${NC} patterns/README.md (preserved)"
elif [[ -f "$PATTERNS_README_TEMPLATE" ]]; then
  cp "$PATTERNS_README_TEMPLATE" "$PATTERNS_README"
  echo -e "  ${GREEN}Created:${NC} patterns/README.md (from template — discovery hub for agents)"
else
  echo -e "  ${YELLOW}Skipped:${NC} patterns/README.md template missing"
fi

# Decision cards (central framework for pattern selection) → .claude/knowledge/decisions/
DECISIONS_SOURCE="$PATTERNS_REPO/decisions"
if [[ -d "$DECISIONS_SOURCE" ]]; then
  ensure_symlink "$KNOWLEDGE_DIR/decisions" "$DECISIONS_SOURCE" ".claude/knowledge/decisions" || true
fi
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

  # Flatten implementers/ subdirectory to top-level .claude/agents/<name>.md
  # Claude Code natively reads .claude/agents/<name>.md (flat) — nested
  # subdirs like implementers/ are NOT discovered. We symlink each
  # implementer file directly to the top level.
  STACK_IMPL_DIR="$STACK_AGENTS_DIR/implementers"
  if [[ -d "$STACK_IMPL_DIR" ]]; then
    for impl_file in "$STACK_IMPL_DIR"/*.md; do
      [[ -f "$impl_file" ]] || continue
      impl_name=$(basename "$impl_file")
      impl_target="$PROJECT_AGENTS_DIR/$impl_name"
      if [[ -L "$impl_target" ]]; then
        echo -e "  ${YELLOW}Already linked:${NC} $impl_name (implementer)"
      elif [[ -f "$impl_target" ]]; then
        mv "$impl_target" "$impl_target.bak.$(date +%Y%m%d%H%M%S)"
        ln -sf "$impl_file" "$impl_target"
        echo -e "  ${GREEN}Replaced local copy:${NC} $impl_name (backed up)"
      else
        ln -sf "$impl_file" "$impl_target"
        echo -e "  ${GREEN}Linked:${NC} $impl_name (implementer, ${STACK_PROFILE})"
      fi
    done

    # Cleanup legacy implementers/ subdirectory if it has only symlinks
    LEGACY_IMPL_DIR="$PROJECT_AGENTS_DIR/implementers"
    if [[ -d "$LEGACY_IMPL_DIR" ]]; then
      # Remove symlinks inside (we just flattened them)
      for legacy_link in "$LEGACY_IMPL_DIR"/*.md; do
        [[ -L "$legacy_link" ]] && rm "$legacy_link"
      done
      # Remove dir if empty
      rmdir "$LEGACY_IMPL_DIR" 2>/dev/null && \
        echo -e "  ${YELLOW}Removed:${NC} legacy implementers/ subdir (flattened to top-level)" || true
    fi
  fi
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

  # Stack-specific rules (e.g., rules/nestjs-ddd/) — overlay for DDD/stack invariants
  STACK_RULES_SOURCE="$PATTERNS_REPO/rules/$STACK_PROFILE"
  if [[ -n "$STACK_PROFILE" && -d "$STACK_RULES_SOURCE" ]]; then
    ensure_symlink "$NATIVE_RULES_DIR/$STACK_PROFILE" "$STACK_RULES_SOURCE" ".claude/rules/$STACK_PROFILE" || true
  fi

  # Clean up stale language rule symlinks (preserve common, language, and stack rules)
  for link in "$NATIVE_RULES_DIR"/*/; do
    [[ -L "${link%/}" ]] || continue
    link_name=$(basename "${link%/}")
    if [[ "$link_name" != "common" && "$link_name" != "$PROJECT_LANGUAGE" && "$link_name" != "$STACK_PROFILE" ]]; then
      echo -e "  ${YELLOW}Removing stale:${NC} .claude/rules/$link_name"
      rm "${link%/}"
    fi
  done
else
  echo -e "  ${YELLOW}Skipped:${NC} No project.language configured"
fi
echo ""

# --- 4. Skills configuration (collect categories from project.yml) ---
echo -e "${BLUE}[4/8] Skills configuration${NC}"
# Note: skills are exposed natively in [4b/8] via flat .claude/skills/<name>/.
# We keep this step only to (a) collect the configured category list and (b)
# remove the legacy .claude/knowledge/skills/ directory if it still exists,
# since the nested layout was duplicating discovery (Claude Code recursively
# scanned both locations, listing each skill twice).

CONFIGURED_SKILLS=()
while IFS= read -r category; do
  [[ -z "$category" ]] && continue
  CONFIGURED_SKILLS+=("$category")
done < <(yml_list "skills")

if [[ ${#CONFIGURED_SKILLS[@]} -eq 0 ]]; then
  echo -e "  ${YELLOW}No skills configured in project.yml${NC}"
fi

# Cleanup: remove legacy .claude/knowledge/skills/ (replaced by flat .claude/skills/)
LEGACY_KNOWLEDGE_SKILLS="$KNOWLEDGE_DIR/skills"
if [[ -d "$LEGACY_KNOWLEDGE_SKILLS" ]]; then
  # Remove all symlinks inside (categories pointing to claude-patterns/skills/<cat>/)
  removed=0
  for link in "$LEGACY_KNOWLEDGE_SKILLS"/*/; do
    if [[ -L "${link%/}" ]]; then
      rm "${link%/}"
      removed=$((removed + 1))
    fi
  done
  # Remove dir if empty (it should be after symlink cleanup)
  if rmdir "$LEGACY_KNOWLEDGE_SKILLS" 2>/dev/null; then
    echo -e "  ${YELLOW}Removed:${NC} legacy knowledge/skills/ ($removed symlinks; replaced by flat .claude/skills/)"
  else
    echo -e "  ${YELLOW}Cleaned:${NC} $removed legacy knowledge/skills/ symlinks (dir kept — has non-symlink content)"
  fi
fi

echo ""

# --- 4b. Native skills discovery (.claude/skills/<name>/) ---
# Claude Code natively reads .claude/skills/<name>/SKILL.md (flat structure).
# Our knowledge/skills/<category>/<name>/SKILL.md layout is for organization;
# we need a per-skill symlink at the top level for Claude Code to pick them up.
#
# IMPORTANT: skip skills with `disable-model-invocation: true` in frontmatter.
# These skills have a slash command counterpart (in commands/<name>.md) that
# is the public entry point. Exposing them here would create a duplicate
# entry in Claude Code's tool registry (visible to the user as the same name
# appearing twice). The skill remains usable by agents via Skill tool /
# agent frontmatter — just not auto-discovered as a slash skill.
echo -e "${BLUE}[4b/8] Native skills discovery${NC} (flat .claude/skills/<name>/)"
NATIVE_SKILLS_DIR="$PROJECT_DIR/.claude/skills"
mkdir -p "$NATIVE_SKILLS_DIR"

# Collect every skill name we expose, for stale cleanup at the end
EXPOSED_SKILL_NAMES=()

# Always include integrations skills (grant-flow, etc.) — available in every project
CONFIGURED_SKILLS+=("integrations")

for category in "${CONFIGURED_SKILLS[@]}"; do
  CATEGORY_DIR="$PATTERNS_REPO/skills/$category"
  [[ -d "$CATEGORY_DIR" ]] || continue

  # Skip vendored multi-plugin layouts (e.g., skills/finance/<plugin>/<skill>/SKILL.md)
  # — we expose only direct <category>/<skill>/SKILL.md files.
  for skill_dir in "$CATEGORY_DIR"/*/; do
    [[ -d "$skill_dir" ]] || continue
    skill_name=$(basename "${skill_dir%/}")
    # Must contain SKILL.md to be exposable
    [[ -f "$skill_dir/SKILL.md" ]] || continue

    # Skip skills that explicitly opt-out of auto-discovery (have command counterpart)
    if grep -q "^disable-model-invocation:\s*true" "$skill_dir/SKILL.md" 2>/dev/null; then
      continue
    fi

    EXPOSED_SKILL_NAMES+=("$skill_name")
    ensure_symlink "$NATIVE_SKILLS_DIR/$skill_name" "${skill_dir%/}" ".claude/skills/$skill_name" || true
  done
done

# Clean up stale per-skill symlinks (skills no longer in any configured category)
for link in "$NATIVE_SKILLS_DIR"/*/; do
  [[ -L "${link%/}" ]] || continue
  link_name=$(basename "${link%/}")
  found=false
  for exposed in "${EXPOSED_SKILL_NAMES[@]}"; do
    if [[ "$exposed" == "$link_name" ]]; then
      found=true
      break
    fi
  done
  if [[ "$found" == "false" ]]; then
    echo -e "  ${YELLOW}Removing stale:${NC} .claude/skills/$link_name"
    rm "${link%/}"
  fi
done

if [[ ${#EXPOSED_SKILL_NAMES[@]} -eq 0 ]]; then
  echo -e "  ${YELLOW}Skipped:${NC} no skills exposed (no skills configured in project.yml)"
fi

echo ""

# --- 5. Stack profile configs (ddd-hooks.json, etc.) ---
echo -e "${BLUE}[5/8] Stack profile configs${NC}"
STACK_PROFILE=$(yml_get "project.stack_profile")

if [[ -n "$STACK_PROFILE" ]]; then
  # Materialize preset (presets/<stack>.yml → .claude/config/preset.yml) so
  # /analyze-ddd and /orchestrate-ddd can resolve the active preset in-project.
  PRESET_SOURCE="$PATTERNS_REPO/presets/$STACK_PROFILE.yml"
  if [[ -f "$PRESET_SOURCE" ]]; then
    mkdir -p "$PROJECT_DIR/.claude/config"
    ensure_symlink "$PROJECT_DIR/.claude/config/preset.yml" "$PRESET_SOURCE" ".claude/config/preset.yml" || true
  fi

  # Canonical threat-model template — SYNC from claude-patterns (SSoT) so enhancements
  # (Attack Trees, CVSS, MITRE ATT&CK, ...) propagate. COPY not symlink: docs/ is tracked,
  # portable project content. Opt out of auto-sync by adding "<!-- LOCAL-CUSTOMIZED -->" to it.
  TM_TEMPLATE_SRC="$PATTERNS_REPO/templates/THREAT_MODEL_TEMPLATE.md"
  TM_TEMPLATE_DST="$PROJECT_DIR/docs/security/THREAT_MODEL_TEMPLATE.md"
  if [[ -f "$TM_TEMPLATE_SRC" ]]; then
    mkdir -p "$PROJECT_DIR/docs/security"
    if [[ -f "$TM_TEMPLATE_DST" ]] && grep -q "LOCAL-CUSTOMIZED" "$TM_TEMPLATE_DST"; then
      echo -e "  ${YELLOW}Preserved:${NC} docs/security/THREAT_MODEL_TEMPLATE.md (LOCAL-CUSTOMIZED)"
    elif [[ -f "$TM_TEMPLATE_DST" ]] && diff -q "$TM_TEMPLATE_SRC" "$TM_TEMPLATE_DST" >/dev/null 2>&1; then
      echo -e "  ${YELLOW}Up to date:${NC} docs/security/THREAT_MODEL_TEMPLATE.md"
    else
      cp "$TM_TEMPLATE_SRC" "$TM_TEMPLATE_DST"
      echo -e "  ${GREEN}Synced:${NC} docs/security/THREAT_MODEL_TEMPLATE.md (canonical)"
    fi
  fi

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

# --- 5b. Universal SH hooks (symlinked from claude-patterns/hooks/) ---
echo -e "${BLUE}[5b/8] Universal SH hooks${NC} (symlinked, kept out of git)"
SH_HOOKS_DIR="$PROJECT_DIR/.claude/hooks"
mkdir -p "$SH_HOOKS_DIR"

UNIVERSAL_SH_HOOKS=(
  "cost-optimizer.sh"
  "state-manager.sh"
  "session-monitor.sh"
)

for hook in "${UNIVERSAL_SH_HOOKS[@]}"; do
  source_path="$PATTERNS_REPO/hooks/$hook"
  target_path="$SH_HOOKS_DIR/$hook"

  if [[ ! -f "$source_path" ]]; then
    echo -e "  ${YELLOW}Missing source:${NC} $hook (skipped)"
    continue
  fi

  if [[ -L "$target_path" ]]; then
    # Already a symlink — refresh to current target
    ln -sf "$source_path" "$target_path"
    echo -e "  ${YELLOW}Up to date:${NC} $hook (symlink)"
  elif [[ -f "$target_path" ]]; then
    # Local copy exists — back it up and replace with symlink
    mv "$target_path" "$target_path.bak.$(date +%Y%m%d%H%M%S)"
    ln -sf "$source_path" "$target_path"
    echo -e "  ${GREEN}Replaced local copy:${NC} $hook (backed up as .bak.*, now symlinked)"
  else
    ln -sf "$source_path" "$target_path"
    echo -e "  ${GREEN}Symlinked:${NC} $hook → claude-patterns/hooks/"
  fi
done
echo ""

# --- 5c. .gitignore — append claude-patterns entries ---
echo -e "${BLUE}[5c/8] .gitignore${NC}"
GITIGNORE="$PROJECT_DIR/.gitignore"
GITIGNORE_TEMPLATE="$PATTERNS_REPO/templates/gitignore-claude.template"

if [[ -f "$GITIGNORE" && -f "$GITIGNORE_TEMPLATE" ]]; then
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
  else
    echo -e "  ${YELLOW}Up to date:${NC} .gitignore"
  fi
elif [[ ! -f "$GITIGNORE" ]]; then
  echo -e "  ${YELLOW}Skipped:${NC} No .gitignore in project (not a git repo?)"
else
  echo -e "  ${YELLOW}Skipped:${NC} gitignore-claude.template not found"
fi
echo ""

# --- 6. .mcp.json (project-scope MCP servers — merged, idempotent) ---
# Two servers are ensured (merge, not clobber — preserves any project-local entries):
#   • claude-patterns      — pattern-delivery (python server.py)
#   • knowledge-retriever  — code retrieval, SHARED HTTP daemon (docker-compose, :6403) — same URL
#     for every project. Per-project isolation = Qdrant collection, NOT a separate process anymore;
#     the daemon has no way to know which project is calling, so collection must be passed explicitly
#     on every retrieve_code call. We write it to .claude/config/knowledge.json for commands to read.
echo -e "${BLUE}[6/8] MCP configuration (.mcp.json — merge)${NC}"
MCP_JSON="$PROJECT_DIR/.mcp.json"

# Qdrant collection: explicit override (project.yml::knowledge_collection) wins — for twin
# projects sharing one repo (e.g. juz-ide-api-1..4) that should share ONE collection, not be
# split per instance. Falls back to deriving from the dir basename: juz-ide-api-1 → code_juz_ide_api_1.
KR_COLLECTION_OVERRIDE=$(yml_get "project.knowledge_collection")
if [[ -n "$KR_COLLECTION_OVERRIDE" ]]; then
  KR_COLLECTION="$KR_COLLECTION_OVERRIDE"
else
  PROJ_BASENAME=$(basename "$PROJECT_DIR")
  KR_COLLECTION="code_$(echo "$PROJ_BASENAME" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]\+/_/g' | sed 's/^_//; s/_$//')"
fi
PATTERNS_SERVER="$PATTERNS_REPO/mcp-server/server.py"

# Record the collection name where /analyze-ddd, /orchestrate-ddd, and implementers read it
# (the HTTP daemon is shared — every retrieve_code call must pass `collection` explicitly).
mkdir -p "$PROJECT_DIR/.claude/config"
KNOWLEDGE_CFG="$PROJECT_DIR/.claude/config/knowledge.json"
printf '{\n  "collection": "%s"\n}\n' "$KR_COLLECTION" > "$KNOWLEDGE_CFG"
echo -e "  ${GREEN}Wrote:${NC} .claude/config/knowledge.json (collection: $KR_COLLECTION)"

if command -v node >/dev/null 2>&1; then
  MCP_JSON="$MCP_JSON" PATTERNS_SERVER="$PATTERNS_SERVER" \
  node -e '
    const fs = require("fs");
    const p = process.env.MCP_JSON;
    let cfg = { mcpServers: {} };
    if (fs.existsSync(p)) { try { cfg = JSON.parse(fs.readFileSync(p, "utf8")); } catch {} }
    cfg.mcpServers ??= {};
    let changed = false;
    // claude-patterns (pattern delivery) — ensure present, do not overwrite if customized
    if (!cfg.mcpServers["claude-patterns"]) {
      cfg.mcpServers["claude-patterns"] = { type: "stdio", command: "python3", args: [process.env.PATTERNS_SERVER] };
      changed = true;
    }
    // knowledge-retriever (code retrieval) — shared HTTP daemon, same URL for every project
    const want = { type: "http", url: "http://localhost:6403/mcp" };
    const cur = cfg.mcpServers["knowledge-retriever"];
    if (JSON.stringify(cur) !== JSON.stringify(want)) { cfg.mcpServers["knowledge-retriever"] = want; changed = true; }
    if (changed || !fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
    console.log(changed ? "  \x1b[0;32mMerged:\x1b[0m knowledge-retriever (http daemon) + claude-patterns" : "  \x1b[1;33mUp to date:\x1b[0m .mcp.json");
  '
else
  echo -e "  ${YELLOW}Skipped:${NC} node not found — cannot merge .mcp.json"
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

# --- 7b. Cross-instance broadcast (opt-in, ADR 0006) ---
#
# WARUNEK KONIECZNY: uruchomienie bez flag i bez bloku `broadcast:` w project.yml
# nie wypisuje ANI JEDNEJ linii i nie dotyka ani jednego pliku. Ta sekcja chodzi
# po istniejących projektach — cisza jest tu funkcją, nie oszczędnością.
#
# Trzy drogi włączenia (ADR 0006, sekcja Setup):
#   1. blok `broadcast:` w .claude/config/project.yml  (tryb nieinteraktywny, CI)
#   2. flaga --with-broadcast
#   3. --interactive → pytanie w menu dodatków
BROADCAST_ENABLED=$(yml_get "broadcast.enabled")
BROADCAST_WANTED=false

if [[ "$BROADCAST_ENABLED" == "true" ]] || [[ "$WITH_BROADCAST" == "true" ]]; then
  BROADCAST_WANTED=true
elif [[ "$INTERACTIVE" == "true" ]]; then
  echo -e "${BLUE}[7b/8] Optional add-ons${NC}"
  read -r -p "  Enable cross-instance broadcast (ADR 0006)? [y/N] " REPLY_BROADCAST
  [[ "$REPLY_BROADCAST" =~ ^[Yy]$ ]] && BROADCAST_WANTED=true
  echo ""
fi

if [[ "$BROADCAST_WANTED" == "true" ]]; then
  echo -e "${BLUE}[7b/8] Cross-instance broadcast${NC} (opt-in, ADR 0006)"

  BROADCAST_CLI="$PATTERNS_REPO/hooks/lib/broadcast/cli.js"

  if ! command -v node >/dev/null 2>&1; then
    echo -e "  ${RED}Skipped:${NC} node not found in PATH — broadcast runtime requires it"
  elif [[ ! -f "$BROADCAST_CLI" ]]; then
    echo -e "  ${RED}Skipped:${NC} broadcast CLI not found at $BROADCAST_CLI"
  else
    # Wartości z project.yml, gdy są; inaczej CLI wyprowadzi je z nazwy katalogu.
    BC_ARGS=()
    BC_REPO=$(yml_get "broadcast.repo")
    BC_INSTANCE=$(yml_get "broadcast.instance")
    BC_EMITS=$(yml_get "broadcast.emits")
    BC_SUBSCRIBES=$(yml_get "broadcast.subscribes")

    # Formy inline z project.yml: `emits: [geo, pricing]` albo `emits: geo,pricing`
    BC_EMITS=$(echo "$BC_EMITS" | tr -d '[] ' )
    BC_SUBSCRIBES=$(echo "$BC_SUBSCRIBES" | tr -d '[] ')

    [[ -n "$BC_REPO" ]]       && BC_ARGS+=(--repo "$BC_REPO")
    [[ -n "$BC_INSTANCE" ]]   && BC_ARGS+=(--instance "$BC_INSTANCE")
    [[ -n "$BC_EMITS" ]]      && BC_ARGS+=(--emits "$BC_EMITS")
    [[ -n "$BC_SUBSCRIBES" ]] && BC_ARGS+=(--subscribes "$BC_SUBSCRIBES")

    # 1) manifest + .git/info/exclude + katalog stanu (idempotentne, nigdy nie nadpisuje)
    if (cd "$PROJECT_DIR" && node "$BROADCAST_CLI" init "${BC_ARGS[@]:+${BC_ARGS[@]}}" 2>&1 | sed 's/^/  /'); then
      :
    else
      echo -e "  ${YELLOW}Warning:${NC} broadcast init returned non-zero (check the manifest by hand)"
    fi

    # 2) wpięcie hooków PER PROJEKT — nie globalnie. Wycofanie: install-hooks --remove
    if (cd "$PROJECT_DIR" && node "$BROADCAST_CLI" install-hooks 2>&1 | sed 's/^/  /'); then
      :
    else
      echo -e "  ${YELLOW}Warning:${NC} could not wire broadcast hooks into .claude/settings.json"
    fi

    echo -e "  ${YELLOW}Note:${NC} manifest is gitignored per clone — each instance needs its own"
    echo -e "  ${YELLOW}  Rollback:${NC} node $BROADCAST_CLI install-hooks --remove && rm .claude/config/broadcast.yml"
  fi
  echo ""
fi

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
