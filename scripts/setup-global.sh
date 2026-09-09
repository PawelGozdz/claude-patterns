#!/bin/bash
# setup-global.sh v3.0 - Setup global Claude Code resources (one-time per machine)
#
# Creates symlinks in ~/.claude/ pointing to claude-patterns repo:
#   agents/  → universal specialists + verifiers (with permissionMode, memory, isolation)
#   commands/ → global slash commands (/analyze, /orchestrate, /scaffold, etc.)
#   hooks/   → the hook FILES (universal ones; stack-specific hooks are per-project)
#
# Symlinking hooks/ only makes the files reachable — it does NOT register a single
# hook. Registration lives in ~/.claude/settings.json, and step [3/4] does it by
# running scripts/sync-global-hooks.mjs --apply (adds only what is missing, never
# touches existing entries or their order). Until 2026-09-07 nothing ran that step,
# so hooks.json declared 22 hooks while settings.json carried two.
#
# Stack-specific hooks (DDD, Flutter, Python) are NOT global. They reach a project's
# .claude/settings.json through setup-project.sh (scripts/sync-runtime-hooks.mjs,
# driven by the blocks the project composes).
#
# Usage: ./scripts/setup-global.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_CLAUDE_DIR="$HOME/.claude"

source "$REPO_DIR/scripts/lib/common.sh"

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
echo -e "${BLUE}[1/4] Agents${NC} (universal specialists — stack agents are per-project)"

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

echo -e "${BLUE}[2/4] Commands${NC} (slash commands: /plan, /tdd, /scaffold, etc.)"
setup_symlink "commands" "$REPO_DIR/commands"
echo ""

echo -e "${BLUE}[3/4] Hooks${NC} (universal only — stack hooks are per-project)"
setup_symlink "hooks" "$REPO_DIR/hooks"

# Symlink = pliki są osiągalne. Rejestracja = wpis w ~/.claude/settings.json.
# Bez tego kroku hooks.json był rejestrem, którego nikt nie stosował.
if command -v node >/dev/null 2>&1; then
  node "$REPO_DIR/scripts/sync-global-hooks.mjs" --apply 2>&1 | sed 's/^/  /'
else
  echo -e "  ${YELLOW}Skipped:${NC} node not in PATH — hooks.json not applied to settings.json"
fi
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
    # `|| count=0` — pod pipefail błąd `find` (np. odmowa dostępu do podkatalogu) zabiłby
    # to przypisanie przez set -e, mimo że `wc -l` policzył to, co find zdążył wypisać.
    count=$(find "$target" -maxdepth 3 \( -name "*.md" -o -name "*.json" -o -name "*.js" \) ! -name "README.md" 2>/dev/null | wc -l) || count=0
    echo -e "${GREEN}$resource${NC} → $target ($count files)"
  fi
done

echo ""
echo -e "${BLUE}Hook architecture:${NC}"
echo -e "  Global:       hooks/hooks.json → ~/.claude/settings.json (sync-global-hooks.mjs, step [3/4])"
echo -e "                session lifecycle, formatting, console.log, git push, subagent monitoring"
echo -e "  Per-project:  blocks → runtime.yml → <project>/.claude/settings.json (sync-runtime-hooks.mjs)"
echo -e "                DDD patterns, Flutter clean arch, Python layers/typing"
echo -e "  Audit:        node scripts/sync-global-hooks.mjs --check"
echo ""
echo -e "${GREEN}Global setup complete!${NC}"
echo ""
echo -e "Next steps:"
# migrate-v2.sh / migrate-all.sh to ścieżka LEGACY sprzed ADR 0008 (settings.json po
# stack_profile) — od 2026-09-07 obie są zabramkowane. Jedna ścieżka: setup-project.sh.
echo -e "  New or existing project:  ${BLUE}./scripts/setup-project.sh /path/to/project${NC}"
echo -e "  Fleet status:             ${BLUE}node scripts/audit-projects.mjs${NC}"
echo ""
