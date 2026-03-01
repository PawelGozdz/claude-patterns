#!/bin/bash
# Master setup script for claude-patterns
#
# Usage:
#   ./setup.sh                                    # Global only
#   ./setup.sh ~/projects/local-hero-3            # Global + one project
#   ./setup.sh ~/projects/local-hero-{1,2,3,4}   # Global + multiple projects

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Claude Patterns - Master Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# --- Step 1: Always run global setup ---
echo -e "${BLUE}[Global Setup]${NC}"
echo ""
bash "$SCRIPT_DIR/setup-global.sh"
echo ""

# --- Step 2: Run project setup for each argument ---
if [[ $# -eq 0 ]]; then
  echo -e "${YELLOW}No project paths provided. Global setup only.${NC}"
  echo ""
  echo "To also set up a project:"
  echo "  $0 ~/projects/my-project"
  echo ""
  exit 0
fi

PROJECT_COUNT=0
FAILED_COUNT=0

for project_path in "$@"; do
  PROJECT_COUNT=$((PROJECT_COUNT + 1))
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}[Project $PROJECT_COUNT] $project_path${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""

  if [[ ! -d "$project_path" ]]; then
    echo -e "${YELLOW}Warning: Directory not found: $project_path (skipping)${NC}"
    FAILED_COUNT=$((FAILED_COUNT + 1))
    echo ""
    continue
  fi

  bash "$SCRIPT_DIR/setup-project.sh" "$project_path"
  echo ""
done

# --- Summary ---
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Setup Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "  Global: agents, commands, hooks"
echo -e "  Projects configured: $PROJECT_COUNT"
if [[ $FAILED_COUNT -gt 0 ]]; then
  echo -e "  ${YELLOW}Skipped: $FAILED_COUNT (directory not found)${NC}"
fi
echo ""
