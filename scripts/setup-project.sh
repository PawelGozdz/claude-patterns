#!/bin/bash
# setup-project.sh - Setup per-project symlinks (patterns, rules, skills, PM)
#
# Usage: ./setup-project.sh /path/to/project
# Run from: anywhere

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATTERNS_REPO="$(dirname "$SCRIPT_DIR")"

source "$SCRIPT_DIR/lib/common.sh"

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Project Setup v3.0${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Parse arguments
#
# Positional: project directory (default: current directory).
# Flags (all optional, all additive — bez nich skrypt zachowuje się dokładnie jak dotąd):
#   --interactive      zapytaj o dodatki; nigdy nie dotyczy rdzenia
PROJECT_DIR=""
INTERACTIVE=false

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      cat <<'EOF'
Usage: setup-project.sh [PROJECT_DIR] [--interactive]

  PROJECT_DIR         Project to set up (default: current directory)
  --interactive        Prompt for optional add-ons; never affects core setup
EOF
      exit 0
      ;;
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

# --- YAML helpers (jeden parser: scripts/lib/project-yml.mjs) ---
#
# Do 2026-09-07 każdy z trzech skryptów (ten, generate-claude-md.sh, migrate-v2.sh)
# miał własną kopię grep/sed — i kopie zdążyły się rozjechać: tamta ucinała komentarz
# inline (`stack_profile: nestjs-ddd  # szablon`), ta wciągała go do wartości. Jeden
# plik dawał więc dwie różne odpowiedzi zależnie od tego, który skrypt pytał (K65).

PROJECT_YML="$PROJECT_DIR/.claude/config/project.yml"

# `|| true` — parser kończy się kodem 1, gdy klucza po prostu nie ma (pole opcjonalne).
# Pod `set -e` nonzero zabiłby VAR=$(yml_get ...); błędy realne (zły YAML) i tak lecą
# na stderr i są widoczne.
yml_get() {
  [[ -f "$PROJECT_YML" ]] || return 0
  node "$SCRIPT_DIR/lib/project-yml.mjs" "$PROJECT_YML" get "$1" || true
}

yml_list() {
  [[ -f "$PROJECT_YML" ]] || return 0
  node "$SCRIPT_DIR/lib/project-yml.mjs" "$PROJECT_YML" list "$1" || true
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

# Remove dangling symlinks — those whose target no longer exists in claude-patterns.
# `ensure_symlink` only ever CREATES links; nothing removed one when its target was
# deleted or renamed centrally, so every removal left a broken link behind in every
# project that had been set up before it. The 2026-08-12 audit found 18 of them across
# 18 repos: `patterns/_stack-defaults` (dropped in ADR 0008) in 16 projects, and
# `agents/infrastructure-testing-implementer.md` (split into infrastructure-implementer
# + test-implementer on 2026-07-09) in 2 more. A broken link is worse than a missing
# one: agents in fast-path read `patterns/README.md` to discover categories and see a
# directory that isn't there.
#
# `find` runs WITHOUT `-L` on purpose. Some projects (vytches-ddd) symlink the whole
# `knowledge/patterns` directory at claude-patterns instead of linking each category,
# so following symlinks would walk this function straight into the central repo and
# delete from there. Verified: pruning inside such a project is a no-op centrally.
prune_dangling_links() {
  local pruned=0
  for sub in .claude/knowledge/patterns .claude/knowledge/rules .claude/knowledge/skills .claude/agents; do
    [ -d "$PROJECT_DIR/$sub" ] || continue
    while IFS= read -r link; do
      [ -z "$link" ] && continue
      echo -e "  ${YELLOW}Pruned:${NC} ${link#$PROJECT_DIR/} (target gone: $(readlink "$link"))"
      rm "$link"; pruned=$((pruned + 1))
    done < <(find "$PROJECT_DIR/$sub" -xtype l 2>/dev/null)
  done
  [ "$pruned" -eq 0 ] || echo -e "  ${GREEN}Pruned $pruned dangling symlink(s)${NC}"
}

# --- Create .claude/knowledge structure ---
KNOWLEDGE_DIR="$PROJECT_DIR/.claude/knowledge"
mkdir -p "$KNOWLEDGE_DIR"
prune_dangling_links

# --- 1. Patterns symlink (stack-aware) ---
echo -e "${BLUE}[1/8] Patterns${NC}"
PROJECT_LANGUAGE=$(yml_get "project.language")
STACK_PROFILE=$(yml_get "project.stack_profile")

# Core pattern directories shared across all stacks (stack-agnostic).
# `_stack-defaults` used to be here — dropped with ADR 0008, since the always-include
# list now comes from `patterns.always` in runtime.yml, not from a per-profile file.
# It stayed on this list after the directory was deleted, so every setup run recreated
# the dangling link this script now prunes; 16 projects carried one.
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

  # Extra pattern categories declared by the composition (`overlay.patterns` in
  # runtime.yml). The case above keys off `stack_profile`, which ADR 0008 demoted to a
  # template selector — so a block bringing its own category (ml-pipeline → ai-ml/) had
  # no way to get it linked, and `/analyze` announced patterns the project couldn't open.
  # Additive on purpose: the profile still decides the base set, blocks only widen it.
  RUNTIME_YML="$PROJECT_DIR/.claude/config/runtime.yml"
  if [[ -f "$RUNTIME_YML" ]]; then
    # `|| true` — większość runtime.yml nie ma `overlay: patterns:`; brak dopasowania
    # w grep to oczekiwany pusty wynik, nie błąd (pod pipefail zabiłby to przypisanie).
    OVERLAY_DIRS=$(sed -n '/^overlay:/,/^[a-z]/p' "$RUNTIME_YML" \
      | grep -E '^\s+patterns:' | sed 's/.*\[//; s/\].*//' | tr -d ' ' | tr ',' '\n' | sed 's|/$||') || true
    for subdir in $OVERLAY_DIRS; do
      [[ -z "$subdir" ]] && continue
      [[ -L "$KNOWLEDGE_DIR/patterns/$subdir" ]] && continue
      if [[ -d "$GLOBAL_PATTERNS/$subdir" ]]; then
        mkdir -p "$KNOWLEDGE_DIR/patterns"
        ensure_symlink "$KNOWLEDGE_DIR/patterns/$subdir" "$GLOBAL_PATTERNS/$subdir" "patterns/$subdir (z overlay)"
      else
        echo -e "  ${YELLOW}Warning:${NC} overlay declares patterns/$subdir — brak takiego katalogu w claude-patterns"
      fi
    done
  fi
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

# Agent directories declared by the composition (`overlay.agents` in runtime.yml) —
# same reasoning as overlay.patterns above. A block naming an agent in one of its slots
# has to be able to deliver that agent; `stack_profile` alone can't reach a second
# directory (ml-pipeline → agents/stacks/python-ml/), so the slot resolved to nothing.
# Katalogi zadeklarowane przez kompozycję w `overlay.<klucz>` runtime.yml.
# Jeden odczyt dla agentów i dla reguł: dwie kopie tego samego seda rozjechałyby się
# tak samo, jak rozjechały się trzy kopie parsera project.yml (K65). Czyta ten sam
# moduł co reszta skryptów — `list` zwraca elementy po jednej linii, `sed 's|/$||'`
# zdejmuje końcowy ukośnik z zapisu `stacks/python/`.
overlay_dirs() {
  local rt="$PROJECT_DIR/.claude/config/runtime.yml"
  [[ -f "$rt" ]] || return 0
  # `|| true` — brak `overlay.<klucz>` w tym runtime.yml to kod 1 i normalny pusty wynik.
  node "$SCRIPT_DIR/lib/project-yml.mjs" "$rt" list "overlay.$1" | sed 's|/$||' || true
}

link_overlay_agents() {
  local dirs
  dirs=$(overlay_dirs agents)
  for d in $dirs; do
    [[ -z "$d" ]] && continue
    local src="$PATTERNS_REPO/agents/$d"
    if [[ ! -d "$src" ]]; then
      echo -e "  ${YELLOW}Warning:${NC} overlay declares agents/$d — brak takiego katalogu"
      continue
    fi
    mkdir -p "$PROJECT_AGENTS_DIR"
    for f in "$src"/*.md; do
      [[ -f "$f" ]] || continue
      local t="$PROJECT_AGENTS_DIR/$(basename "$f")"
      [[ -L "$t" ]] && continue
      ln -sf "$f" "$t"
      echo -e "  ${GREEN}Linked:${NC} $(basename "$f") (overlay: $d)"
    done
  done
}

# Reguły z kompozycji (`overlay.rules` w runtime.yml) — ta sama logika co przy agentach.
# Do 2026-09-07 `overlay.rules` deklarowały cztery bloki (`python`, `ts-library`,
# `clean-arch`, `ddd/core`), materializowało się do runtime.yml i NIE MIAŁO KONSUMENTA:
# reguły szły wyłącznie po `$STACK_PROFILE`, choć `templates/project.yml.example`
# mówi wprost, że stack_profile jest tylko selektorem szablonu CLAUDE.md. Projekt
# na blokach `[clean-arch]` bez profilu `flutter-clean-arch` nie dostawał `rules/dart/`
# wcale (audyt 2026-09-07, A4).
#
# Zwraca (przez OVERLAY_RULE_NAMES) nazwy dowiązań, żeby sprzątanie „stale" niżej
# wiedziało, czego NIE usuwać.
OVERLAY_RULE_NAMES=()
link_overlay_rules() {
  local dirs
  dirs=$(overlay_dirs rules)
  for d in $dirs; do
    [[ -z "$d" ]] && continue
    local src="$PATTERNS_REPO/rules/$d"
    local name
    name=$(basename "$d")
    if [[ ! -d "$src" ]]; then
      echo -e "  ${YELLOW}Warning:${NC} overlay declares rules/$d — brak takiego katalogu"
      continue
    fi
    mkdir -p "$NATIVE_RULES_DIR"
    # `rules/dart/` bywa wnoszone i przez `project.language`, i przez overlay — bez tego
    # warunku log pokazywałby dwa razy ten sam katalog („Created", potem „Already exists").
    if [[ -L "$NATIVE_RULES_DIR/$name" && "$(readlink "$NATIVE_RULES_DIR/$name")" == "$src" ]]; then
      OVERLAY_RULE_NAMES+=("$name")
      continue
    fi
    ensure_symlink "$NATIVE_RULES_DIR/$name" "$src" ".claude/rules/$name" || true
    OVERLAY_RULE_NAMES+=("$name")
  done
}

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

link_overlay_agents

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

  # Reguły stackowe: z KOMPOZYCJI (overlay.rules), nie z $STACK_PROFILE.
  #
  # `stack_profile` jest selektorem szablonu CLAUDE.md (tak mówi
  # templates/project.yml.example) — o doborze reguł decyduje skład bloków. Ścieżka po
  # $STACK_PROFILE zostaje wyłącznie dla projektów BEZ `stack_blocks`, czyli bez
  # runtime.yml: legacy, do usunięcia razem z ostatnim takim repo.
  KEEP_RULE_LINKS=("common" "$PROJECT_LANGUAGE")
  if [[ -f "$PROJECT_DIR/.claude/config/runtime.yml" ]]; then
    link_overlay_rules
    KEEP_RULE_LINKS+=("${OVERLAY_RULE_NAMES[@]:+${OVERLAY_RULE_NAMES[@]}}")
  else
    # ŚCIEŻKA LEGACY (projekt bez kompozycji bloków): reguły po stack_profile.
    STACK_RULES_SOURCE="$PATTERNS_REPO/rules/$STACK_PROFILE"
    if [[ -n "$STACK_PROFILE" && -d "$STACK_RULES_SOURCE" ]]; then
      ensure_symlink "$NATIVE_RULES_DIR/$STACK_PROFILE" "$STACK_RULES_SOURCE" ".claude/rules/$STACK_PROFILE" || true
      KEEP_RULE_LINKS+=("$STACK_PROFILE")
    fi
  fi

  # Sprzątanie dowiązań, których bieżąca konfiguracja już nie przewiduje. Lista „do
  # zachowania" powstaje wyżej — inaczej przełączenie bloków zostawiałoby reguły po
  # poprzednim składzie, cicho podpięte do promptów.
  for link in "$NATIVE_RULES_DIR"/*/; do
    [[ -L "${link%/}" ]] || continue
    link_name=$(basename "${link%/}")
    keep=false
    for k in "${KEEP_RULE_LINKS[@]}"; do [[ "$link_name" == "$k" ]] && keep=true && break; done
    if [[ "$keep" == false ]]; then
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

# K45 (TASK-KAIZEN-001, 2026-08-27): `disable-model-invocation: true` means "the model
# shouldn't pick this skill on its own from the listing" — it does NOT mean "no project
# ever needs this skill available." An agent that explicitly names the skill in its own
# `skills:` frontmatter (e.g. security-e2e-verifier.md -> security/security-review) has a
# real dependency on it; the flag alone was silently dropping the symlink, leaving that
# reference dangling for every project. Collect required skill names from agents already
# linked to THIS project (.claude/agents/*.md) before filtering by the flag.
REQUIRED_BY_AGENTS=()
if [[ -d "$PROJECT_AGENTS_DIR" ]]; then
  for agent_file in "$PROJECT_AGENTS_DIR"/*.md; do
    [[ -f "$agent_file" ]] || continue
    while IFS= read -r skill_ref; do
      [[ -z "$skill_ref" ]] && continue
      REQUIRED_BY_AGENTS+=("$(basename "$skill_ref")")
    done < <(sed -n '/^skills:/,/^[a-z]/p' "$agent_file" | grep '^\s*-\s' | sed 's/^\s*-\s*//')
  done
fi

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

    # Skip skills that explicitly opt-out of auto-discovery (have command counterpart) —
    # UNLESS an agent linked to this project explicitly depends on it (K45).
    if grep -q "^disable-model-invocation:\s*true" "$skill_dir/SKILL.md" 2>/dev/null; then
      required=false
      for req in "${REQUIRED_BY_AGENTS[@]:-}"; do
        [[ "$req" == "$skill_name" ]] && { required=true; break; }
      done
      [[ "$required" == "false" ]] && continue
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
  # Presety usunięte 2026-08-12 — cała konfiguracja idzie przez bloki → runtime.yml.
  # `stack_profile` zostaje wyłącznie jako selektor szablonu CLAUDE.md.

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

  # Analysis-artifact template — /analyze writes {TASK-ID}.analysis.md and /orchestrate
  # gates on its frontmatter, so the shape is a contract, not a preference. Without the
  # template in the project, a run copies the format from whatever sibling analysis it
  # finds; a field that drifted once then propagates by imitation. Same COPY + opt-out
  # convention as the TM template above.
  ANALYSIS_TEMPLATE_SRC="$PATTERNS_REPO/templates/task-analysis-template.md"
  ANALYSIS_TEMPLATE_DST="$PROJECT_DIR/project-orchestration/analysis/TEMPLATE.md"
  if [[ -f "$ANALYSIS_TEMPLATE_SRC" ]]; then
    mkdir -p "$PROJECT_DIR/project-orchestration/analysis"
    if [[ -f "$ANALYSIS_TEMPLATE_DST" ]] && grep -q "LOCAL-CUSTOMIZED" "$ANALYSIS_TEMPLATE_DST"; then
      echo -e "  ${YELLOW}Preserved:${NC} project-orchestration/analysis/TEMPLATE.md (LOCAL-CUSTOMIZED)"
    elif [[ -f "$ANALYSIS_TEMPLATE_DST" ]] && diff -q "$ANALYSIS_TEMPLATE_SRC" "$ANALYSIS_TEMPLATE_DST" >/dev/null 2>&1; then
      echo -e "  ${YELLOW}Up to date:${NC} project-orchestration/analysis/TEMPLATE.md"
    else
      cp "$ANALYSIS_TEMPLATE_SRC" "$ANALYSIS_TEMPLATE_DST"
      echo -e "  ${GREEN}Synced:${NC} project-orchestration/analysis/TEMPLATE.md (canonical)"
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

  # Projekt skonfigurowany przez stack_blocks z profilem spoza mapy (K110, 2026-09-07):
  # do tej pory krok [5] był bramkowany wyłącznie na stack_profile, więc projekt na
  # ścieżce ADR 0008 z nietypowym profilem nie dostawał configu hooków wcale.
  if [[ -z "$HOOKS_FILENAME" && -f "$PROJECT_DIR/.claude/config/runtime.yml" ]]; then
    BLOCKS=$(node "$SCRIPT_DIR/lib/project-yml.mjs" "$PROJECT_DIR/.claude/config/runtime.yml" list stack_blocks 2>/dev/null || true)
    grep -qx 'ddd/core'    <<<"$BLOCKS" && HOOKS_FILENAME="ddd-hooks.json"
    grep -qx 'flutter'     <<<"$BLOCKS" && HOOKS_FILENAME="flutter-hooks.json"
    grep -qx 'ml-pipeline' <<<"$BLOCKS" && { HOOKS_FILENAME="python-hooks.json"; STACK_PROFILE="${STACK_PROFILE:-python-ml}"; }
    grep -qx 'python'      <<<"$BLOCKS" && HOOKS_FILENAME="${HOOKS_FILENAME:-python-hooks.json}"
  fi

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

# --- 5a. Stack blocks → runtime.yml (ADR 0008, pilot TASK-BLOCKS-001) ---
# Obecność `project.stack_blocks` (lista INLINE) włącza materializację. Sklejanie
# robi deterministyczny node (nie bash) — patrz scripts/materialize-runtime.mjs.
if grep -qE '^  stack_blocks:' "$PROJECT_YML" 2>/dev/null; then
  echo -e "${BLUE}[5a] Stack blocks → runtime.yml (ADR 0008)${NC}"
  if node "$PATTERNS_REPO/scripts/materialize-runtime.mjs" "$PROJECT_DIR" "$PATTERNS_REPO"; then
    echo -e "  ${GREEN}Materialized:${NC} .claude/config/runtime.yml"
  else
    echo -e "  ${YELLOW}FAILED:${NC} materializacja runtime.yml — popraw project.yml/bloki i uruchom ponownie"
  fi

  # BUSINESS_RULES.yaml — CLAUDE.md wymaga trzymania go w zgodzie z kodem domeny,
  # ale nic go nigdy nie zakładało (K110, 2026-09-07). Kopiujemy TYLKO gdy kompozycja
  # ma ddd/core i pliku jeszcze nie ma — to dokument projektu, nie plik zarządzany.
  if node "$SCRIPT_DIR/lib/project-yml.mjs" "$PROJECT_DIR/.claude/config/runtime.yml" list stack_blocks 2>/dev/null | grep -qx 'ddd/core'; then
    BR_DST="$PROJECT_DIR/docs/BUSINESS_RULES.yaml"
    if [[ ! -f "$BR_DST" ]]; then
      mkdir -p "$PROJECT_DIR/docs"
      cp "$PATTERNS_REPO/templates/BUSINESS_RULES.yaml.template" "$BR_DST"
      echo -e "  ${GREEN}Created:${NC} docs/BUSINESS_RULES.yaml (ze wzorca — wypełnij regułami domeny)"
    fi
  fi
  echo ""
fi

# --- 5a2. Punkty rozszerzeń projektu: bloki lokalne + taksonomia ---
# Oba pliki są WŁASNOŚCIĄ PROJEKTU (nie generowane, nie symlinkowane) — setup tworzy
# szkielet raz i nigdy go nie nadpisuje. Powód: bez szkieletu nikt nie wie, że te
# punkty rozszerzeń w ogóle istnieją; z nadpisywaniem straciłby lokalne treści.
if grep -qE '^  stack_blocks:' "$PROJECT_YML" 2>/dev/null; then
  echo -e "${BLUE}[5a2] Punkty rozszerzeń projektu${NC} (bloki lokalne, taksonomia)"
  mkdir -p "$PROJECT_DIR/.claude/blocks" "$PROJECT_DIR/.claude/config"

  LOCAL_TAXONOMY="$PROJECT_DIR/.claude/config/taxonomy.yml"
  if [[ -f "$LOCAL_TAXONOMY" ]]; then
    echo -e "  ${YELLOW}Istnieje:${NC} .claude/config/taxonomy.yml (zostawiam bez zmian)"
  else
    cat > "$LOCAL_TAXONOMY" <<'TAXEOF'
# Tag taxonomy extension for THIS project.
# Core vocabulary (stacks + shared areas): claude-patterns/blocks/_taxonomy.yml
#
# Add only domain areas the core does not cover — e.g. a shop: catalog, cart,
# fulfillment. Never repeat or redefine a core entry (auth, geo, tests …):
# a shared language is the only reason the core exists.
#
# An area is promoted to the core once a SECOND project starts using it —
# the same rule that governs pattern promotion.
#
# Anything added here reaches runtime.yml on the next setup run, and only then
# becomes a legal tag for ADRs, patterns and layers.
#
# Validate the merged vocabulary:
#   node <claude-patterns>/scripts/lint-patterns.mjs --project .

areas: []
  # - catalog
  # - fulfillment

variants_seen: {}
  # auth: [magic-link]
TAXEOF
    echo -e "  ${GREEN}Utworzono:${NC} .claude/config/taxonomy.yml (szkielet — uzupełnij obszary domenowe)"
  fi
  echo -e "  ${GREEN}Gotowe:${NC} .claude/blocks/ (bloki lokalne — referencja \`./nazwa\` w stack_blocks)"
  echo ""
fi

# --- 5a3. Hooki z runtime.yml → settings.json ---
# Bloki deklarują, których hooków wymaga stack; szablony per stack_profile znały tylko
# swój własny zestaw. Dopinamy BRAKUJĄCE, nie ruszając tego, co projekt już ma —
# istniejące wpisy, ich kolejność i ręczne dostrojenie (timeouty, statusMessage)
# zostają nietknięte, a przed zapisem powstaje kopia settings.json.bak.
#
# Do 2026-09-07 ten krok tylko OSTRZEGAŁ, a `sync-runtime-hooks.mjs` (napisany
# 2026-08-12 dokładnie po to) nie był wołany z żadnego miejsca w repo. Bramka
# deklarowana w runtime.yml i nieobecna w settings.json to bramka, która nie działa —
# a wygląda w konfiguracji na włączoną (audyt 2026-09-07, A3).
if [[ -f "$PROJECT_DIR/.claude/config/runtime.yml" ]]; then
  echo -e "${BLUE}[5a3] Hooki z runtime.yml → settings.json${NC}"

  # Świeży projekt nie ma jeszcze settings.json, a `sync-runtime-hooks.mjs` wymaga
  # istniejącego pliku (celowo — nie zgaduje, gdzie mają trafić wpisy). Do 2026-09-07
  # plik zakładała wyłącznie ścieżka `migrate-v2.sh` z templates/settings/<profil>.json,
  # czyli ta wycofywana w K64. Zakładamy go tutaj z BAZOWEGO szablonu (permissions.deny
  # z K21), a hooki dokłada kompozycja — jedna ścieżka provisioningu zamiast dwóch.
  if [[ ! -f "$PROJECT_DIR/.claude/settings.json" ]]; then
    if [[ -f "$PATTERNS_REPO/templates/settings/base.json" ]]; then
      cp "$PATTERNS_REPO/templates/settings/base.json" "$PROJECT_DIR/.claude/settings.json"
      echo -e "  ${GREEN}Utworzono:${NC} .claude/settings.json (baza: templates/settings/base.json)"
    else
      printf '{\n  "$schema": "https://json.schemastore.org/claude-code-settings.json"\n}\n' \
        > "$PROJECT_DIR/.claude/settings.json"
      echo -e "  ${YELLOW}Utworzono:${NC} .claude/settings.json (pusty — brak templates/settings/base.json)"
    fi
  fi

  if command -v node >/dev/null 2>&1; then
    if node "$SCRIPT_DIR/sync-runtime-hooks.mjs" "$PROJECT_DIR" --apply 2>&1 | sed 's/^/  /'; then
      :
    else
      echo -e "  ${YELLOW}Warning:${NC} sync-runtime-hooks zwrócił błąd — sprawdź .claude/settings.json ręcznie"
    fi
  else
    echo -e "  ${YELLOW}Skipped:${NC} node not in PATH — hooki z runtime.yml nie zostały wpięte"
  fi
  echo ""
fi

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
# One server is ensured (merge, not clobber — preserves any project-local entries).
# The old python `claude-patterns` stdio server was retired 2026-09-07 (K100) — patterns
# reach agents through `retrieve_patterns` on the same knowledge-retriever daemon.
#   • knowledge-retriever  — code retrieval, SHARED HTTP daemon (docker-compose, :6403) — same URL
#     for every project. Per-project isolation = Qdrant collection, NOT a separate process anymore;
#     the daemon has no way to know which project is calling, so collection must be passed explicitly
#     on every retrieve_code call. We write it to .claude/config/knowledge.json for commands to read.
#   • project.mcp_servers (project.yml, OPTIONAL) — a project's OWN local MCP server(s), e.g. a
#     repo-local tool wrapping that project's own API (grant-flow's `tools/mcp-server/`,
#     TS-MCP-001). Empty/absent for every project that doesn't declare it — this branch changes
#     nothing for projects with no such key. "args" entries that look like a relative path get
#     resolved against THIS checkout's PROJECT_DIR, so whoever runs this script gets the right
#     absolute path in their own .mcp.json without hand-editing it (see
#     TASK-MCP-SERVER-GUIDANCE-001).
echo -e "${BLUE}[6/8] MCP configuration (.mcp.json — merge)${NC}"
MCP_JSON="$PROJECT_DIR/.mcp.json"

MCP_SERVERS_JSON='[]'
MCP_SERVER_ITEMS=()
while IFS= read -r item; do
  [[ -z "$item" ]] && continue
  MCP_SERVER_ITEMS+=("$item")
done < <(yml_list "project.mcp_servers")
if [[ ${#MCP_SERVER_ITEMS[@]} -gt 0 ]]; then
  JOINED=$(IFS=,; echo "${MCP_SERVER_ITEMS[*]}")
  MCP_SERVERS_JSON="[${JOINED}]"
fi

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
# Record the collection name where /analyze, /orchestrate, and implementers read it
# (the HTTP daemon is shared — every retrieve_code call must pass `collection` explicitly).
mkdir -p "$PROJECT_DIR/.claude/config"
KNOWLEDGE_CFG="$PROJECT_DIR/.claude/config/knowledge.json"
printf '{\n  "collection": "%s"\n}\n' "$KR_COLLECTION" > "$KNOWLEDGE_CFG"
echo -e "  ${GREEN}Wrote:${NC} .claude/config/knowledge.json (collection: $KR_COLLECTION)"

if command -v node >/dev/null 2>&1; then
  MCP_JSON="$MCP_JSON" \
  PROJECT_DIR="$PROJECT_DIR" \
  MCP_SERVERS_JSON="$MCP_SERVERS_JSON" \
  node -e '
    const fs = require("fs");
    const path = require("path");
    const p = process.env.MCP_JSON;
    const projectDir = process.env.PROJECT_DIR;
    let cfg = { mcpServers: {} };
    if (fs.existsSync(p)) { try { cfg = JSON.parse(fs.readFileSync(p, "utf8")); } catch {} }
    cfg.mcpServers ??= {};
    let changed = false;
    // claude-patterns (python stdio server) — retired 2026-09-07 (K100); drop a stale entry
    if (cfg.mcpServers["claude-patterns"]) { delete cfg.mcpServers["claude-patterns"]; changed = true; }
    // knowledge-retriever (code retrieval) — shared HTTP daemon, same URL for every project
    const want = { type: "http", url: "http://localhost:6403/mcp" };
    const cur = cfg.mcpServers["knowledge-retriever"];
    const krChanged = JSON.stringify(cur) !== JSON.stringify(want);
    if (krChanged) { cfg.mcpServers["knowledge-retriever"] = want; changed = true; }

    // project.mcp_servers (project.yml, optional) — see comment above this block.
    let declared = [];
    try { declared = JSON.parse(process.env.MCP_SERVERS_JSON || "[]"); } catch {}
    for (const server of declared) {
      if (!server || typeof server.name !== "string" || !server.name) continue;
      const args = (server.args ?? []).map((a) =>
        typeof a === "string" && a.includes("/") && !path.isAbsolute(a) ? path.join(projectDir, a) : a
      );
      const entry = { command: server.command, args };
      if (server.env && typeof server.env === "object") entry.env = server.env;
      const curEntry = cfg.mcpServers[server.name];
      if (JSON.stringify(curEntry) !== JSON.stringify(entry)) {
        cfg.mcpServers[server.name] = entry;
        changed = true;
        console.log(`  \x1b[0;32mMerged:\x1b[0m ${server.name} (local, project.yml -> mcp_servers)`);
      }
    }

    if (changed || !fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
    if (krChanged) console.log("  \x1b[0;32mMerged:\x1b[0m knowledge-retriever (http daemon)");
    if (!changed) console.log("  \x1b[1;33mUp to date:\x1b[0m .mcp.json");
  '
else
  echo -e "  ${YELLOW}Skipped:${NC} node not found — cannot merge .mcp.json"
fi
echo ""

# --- 7. Project Management System (optional) ---
echo -e "${BLUE}[7/9] Project Management System${NC}"
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
echo -e "${BLUE}[8/9] CLAUDE.md generation${NC}"
if [[ -f "$PROJECT_YML" ]]; then
  bash "$SCRIPT_DIR/generate-claude-md.sh" "$PROJECT_DIR"
else
  echo -e "${YELLOW}Skipped:${NC} No project.yml found (CLAUDE.md not regenerated)"
fi
echo ""

# --- 9. Git pre-commit satelity (ADR 0007 D4, K63b) ---
# Rematerializuje runtime.yml, gdy commit rusza .claude/config/project.yml
# albo .claude/blocks/*.yml. Bez tego lokalna edycja kompozycji zostawia
# runtime.yml z poprzedniego świata, a rozjazd wychodzi dopiero przy audycie centrali.
echo -e "${BLUE}[9/9] Git pre-commit (rematerializacja runtime.yml)${NC}"
HOOK_SRC="$PATTERNS_REPO/templates/git-hooks/pre-commit-satellite.sh"
HOOK_DST="$PROJECT_DIR/.git/hooks/pre-commit"

if [ ! -d "$PROJECT_DIR/.git" ]; then
  echo -e "  ${YELLOW}Skipped:${NC} $PROJECT_DIR nie jest repozytorium gita"
elif [ -f "$HOOK_DST" ] && ! grep -q 'pre-commit-satellite' "$HOOK_DST"; then
  # Cudzy hook (lefthook/husky/własny) — nie nadpisujemy, bo skasowalibyśmy czyjąś bramkę.
  echo -e "  ${YELLOW}Warning:${NC} .git/hooks/pre-commit już istnieje i nie jest nasz"
  echo -e "           Dodaj do niego krok:  \"$HOOK_SRC\" || exit 1"
else
  install -m 0755 "$HOOK_SRC" "$HOOK_DST"
  echo -e "  ${GREEN}Installed:${NC} .git/hooks/pre-commit"
fi
echo ""

# --- Verification ---
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Verification${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Count patterns (patterns/ is now a directory with per-subdir symlinks, not a single symlink)
if [ -d "$KNOWLEDGE_DIR/patterns" ]; then
  PATTERN_COUNT=$(find -L "$KNOWLEDGE_DIR/patterns" -name "*.md" -not -name "README.md" -not -name "METADATA.yml" 2>/dev/null | wc -l) || true
  PATTERN_DIRS=$(find "$KNOWLEDGE_DIR/patterns" -mindepth 1 -maxdepth 1 -type l 2>/dev/null | wc -l) || true
  echo -e "${GREEN}Patterns:${NC} $PATTERN_COUNT (${PATTERN_DIRS} categories)"
fi

# Count rules
RULE_COUNT=0
for dir in "$NATIVE_RULES_DIR"/*/; do
  [[ -d "$dir" ]] || continue
  count=$(find "$dir" -name "*.md" 2>/dev/null | wc -l) || true
  RULE_COUNT=$((RULE_COUNT + count))
done
echo -e "${GREEN}Rules:${NC} $RULE_COUNT (language: ${PROJECT_LANGUAGE:-none})"

# Count skills
# `SKILLS_DIR` (bez prefiksu) nie istnieje w tym skrypcie — zmienna faktycznie
# wypełniana wyżej to `NATIVE_SKILLS_DIR` (linia 533). Pod set -u to natychmiastowy,
# głośny błąd "unbound variable"; bez -u `$SKILLS_DIR` cicho rozwijał się do pustego
# stringa, więc `for dir in ""/*/` globował `/*/ ` — CAŁY root systemu plików — i ta
# pętla liczyła SKILL.md ze wszystkich katalogów na dysku, nie z projektu (odkryte
# przy K12, TASK-KAIZEN-001, dzięki `-u`; bez niej fałszywy wynik nigdy się nie ujawnił).
SKILL_COUNT=0
for dir in "$NATIVE_SKILLS_DIR"/*/; do
  [[ -d "$dir" ]] || continue
  count=$(find "$dir" -name "SKILL.md" 2>/dev/null | wc -l) || true
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
  TASK_COUNT=$(find "$PROJECT_DIR/project-orchestration/tasks" -name "*.md" 2>/dev/null | wc -l) || true
  echo -e "${GREEN}PM System:${NC} active ($TASK_COUNT tasks)"
fi

echo ""

echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}Project setup complete!${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

exit 0
