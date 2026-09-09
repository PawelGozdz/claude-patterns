#!/bin/bash
# migrate-all.sh - Batch migrate all projects in /opt/projects/ to v2
#
# Usage: ./migrate-all.sh [projects-root]
# Default: /opt/projects

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# LEGACY (sprzed ADR 0008, 2026-08-12) — NIE UŻYWAJ.
#
# Wsadowe uruchomienie `migrate-v2.sh`, czyli wycofanej ścieżki provisioningu
# settings.json po `stack_profile`. Powód wycofania i zamiennik: patrz baner
# w scripts/migrate-v2.sh.
#
# Zamiast tego (dla całej floty):
#   for p in /opt/projects/*/; do ./scripts/setup-project.sh "$p"; done
#   node scripts/audit-projects.mjs        # co jeszcze wymaga uwagi
#
# Świadome uruchomienie mimo wszystko: --i-know-legacy
# ─────────────────────────────────────────────────────────────────────────────
if [[ " $* " != *" --i-know-legacy "* ]]; then
  echo "migrate-all.sh: LEGACY (sprzed ADR 0008) — nie używać." >&2
  echo "  Użyj: ./scripts/setup-project.sh <projekt> dla każdego repo, potem node scripts/audit-projects.mjs" >&2
  echo "  Świadome uruchomienie: $0 [root] --i-know-legacy" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Flaga bramki nie jest ścieżką — filtrujemy ją z argumentów pozycyjnych.
POSITIONAL=()
for arg in "$@"; do [[ "$arg" == "--i-know-legacy" ]] || POSITIONAL+=("$arg"); done
PROJECTS_ROOT="${POSITIONAL[0]:-/opt/projects}"

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
  # Świadomość „to legacy" potwierdzona już przy wejściu do migrate-all.sh — przekazujemy
  # ją dalej, żeby bramka w migrate-v2.sh nie zatrzymywała każdego repo z osobna.
  if bash "$SCRIPT_DIR/migrate-v2.sh" "$project_dir" --i-know-legacy 2>&1 | sed 's/^/  /'; then
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
