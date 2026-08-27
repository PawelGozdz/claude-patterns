#!/bin/bash
# migrate-all.sh - Batch migrate all projects in /opt/projects/ to v2
#
# Usage: ./migrate-all.sh [projects-root]
# Default: /opt/projects

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECTS_ROOT="${1:-/opt/projects}"

source "$SCRIPT_DIR/lib/common.sh"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Batch Migration to v2${NC}"
echo -e "${BLUE}Projects root: ${PROJECTS_ROOT}${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

MIGRATED=0
SKIPPED=0
FAILED=0

for project_dir in "$PROJECTS_ROOT"/*/; do
  [[ -d "$project_dir" ]] || continue
  project_name=$(basename "$project_dir")

  # Skip claude-patterns itself
  if [[ "$project_name" == "claude-patterns" ]]; then
    echo -e "${YELLOW}Skipped:${NC} $project_name (patterns repo itself)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Skip projects without .claude/config/project.yml
  if [[ ! -f "$project_dir/.claude/config/project.yml" ]]; then
    echo -e "${YELLOW}Skipped:${NC} $project_name (no project.yml)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo -e "${BLUE}Migrating:${NC} $project_name"
  # pipefail: `if` już był odporny na set -e (warunek if jest wyłączony spod niego), ale
  # BEZ pipefail status if-a to status sed'a (prawie zawsze 0) — realna awaria migrate-v2.sh
  # była dotąd cicho liczona jako "Migrated". Z pipefail if poprawnie widzi awarię migracji.
  if bash "$SCRIPT_DIR/migrate-v2.sh" "$project_dir" 2>&1 | sed 's/^/  /'; then
    MIGRATED=$((MIGRATED + 1))
  else
    echo -e "  ${RED}Failed!${NC}"
    FAILED=$((FAILED + 1))
  fi
  echo ""
done

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Migrated:${NC} $MIGRATED"
echo -e "${YELLOW}Skipped:${NC} $SKIPPED"
if [[ $FAILED -gt 0 ]]; then
  echo -e "${RED}Failed:${NC} $FAILED"
fi
echo -e "${BLUE}========================================${NC}"
