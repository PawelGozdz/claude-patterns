#!/bin/bash
# sync-finance-skills.sh - Sync upstream finance_skills into skills/finance/
#
# Pulls latest from JoelLewis/finance_skills (MIT, by Joel Lewis).
# Maps upstream `plugins/<plugin>/skills/<skill>/` → our
# `skills/finance/<plugin>/<skill>/` (preserves plugin grouping).
#
# Also refreshes:
#   - tests/finance-evals/ (from finance-skills-workspace/ + evals/evals.json)
#
# Strategy: vendoring. Local additions (README.md, PLUGINS.md,
# UPSTREAM_VERSION) are NEVER touched.
#
# Usage:
#   ./scripts/sync-finance-skills.sh             # interactive — diff, confirm, sync
#   ./scripts/sync-finance-skills.sh --apply     # sync without prompt (CI use)
#   ./scripts/sync-finance-skills.sh --diff      # only show diff, do not change anything
#   ./scripts/sync-finance-skills.sh --ref v1.0.0  # pin to a specific tag
#
# Requirements: git, rsync, diff

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_REPO="https://github.com/JoelLewis/finance_skills.git"
WORK_DIR="${TMPDIR:-/tmp}/finance-skills-sync-$$"
REF="main"
MODE="interactive"

PLUGINS=(core wealth-management compliance advisory-practice trading-operations client-operations data-integration)

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) MODE="apply"; shift ;;
    --diff)  MODE="diff";  shift ;;
    --ref)   REF="$2";     shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2
      ;;
  esac
done

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Finance Skills Sync${NC}"
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Upstream:${NC} $UPSTREAM_REPO"
echo -e "${BLUE}Ref:${NC}      $REF"
echo -e "${BLUE}Local:${NC}    $REPO_DIR/skills/finance"
echo -e "${BLUE}           ${NC} $REPO_DIR/tests/finance-evals"
echo ""

# 1. Clone upstream
echo -e "${BLUE}[1/4]${NC} Cloning upstream at $REF..."
trap 'rm -rf "$WORK_DIR"' EXIT
git clone --depth 1 --branch "$REF" "$UPSTREAM_REPO" "$WORK_DIR" 2>&1 | tail -3

# 2. Capture upstream version
UPSTREAM_VERSION=$(grep '"version"' "$WORK_DIR/marketplace.json" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
UPSTREAM_COMMIT=$(cd "$WORK_DIR" && git rev-parse HEAD)
echo -e "${BLUE}[2/4]${NC} Upstream version: ${GREEN}$UPSTREAM_VERSION${NC} (commit $UPSTREAM_COMMIT)"

# 3. Compute diff per plugin
echo -e "${BLUE}[3/4]${NC} Computing diff per plugin..."
DIFF_OUT=$(mktemp)
for plugin in "${PLUGINS[@]}"; do
  if [[ -d "$REPO_DIR/skills/finance/$plugin" && -d "$WORK_DIR/plugins/$plugin/skills" ]]; then
    diff -r --brief "$REPO_DIR/skills/finance/$plugin" "$WORK_DIR/plugins/$plugin/skills" 2>&1 || true
  fi
done > "$DIFF_OUT"

# Eval framework diff
if [[ -d "$WORK_DIR/finance-skills-workspace" ]]; then
  diff -r --brief "$REPO_DIR/tests/finance-evals" "$WORK_DIR/finance-skills-workspace" 2>&1 \
    | grep -v "Only in $REPO_DIR/tests/finance-evals: README.md\|Only in $REPO_DIR/tests/finance-evals: evals.json" \
    >> "$DIFF_OUT" || true
fi

CHANGES=$(grep -cE '^(Only in|Files .* differ)' "$DIFF_OUT" || true)
if [[ "$CHANGES" == "0" ]]; then
  echo -e "${GREEN}No changes.${NC} Local is already in sync with upstream $REF."
  exit 0
fi

echo -e "${YELLOW}$CHANGES change(s) detected:${NC}"
head -50 "$DIFF_OUT"
[[ $(wc -l < "$DIFF_OUT") -gt 50 ]] && echo "... (truncated; full diff in $DIFF_OUT)"

if [[ "$MODE" == "diff" ]]; then
  echo ""
  echo -e "${BLUE}Diff-only mode.${NC} No files changed."
  echo "Full diff: $DIFF_OUT"
  exit 0
fi

# 4. Confirm and apply
if [[ "$MODE" == "interactive" ]]; then
  echo ""
  read -p "Apply these changes to skills/finance/ and tests/finance-evals/? [y/N] " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Aborted.${NC} No files changed."
    exit 1
  fi
fi

echo -e "${BLUE}[4/4]${NC} Applying with rsync..."

# Sync each plugin's skills/ subfolder, preserving local meta files
for plugin in "${PLUGINS[@]}"; do
  if [[ -d "$WORK_DIR/plugins/$plugin/skills" ]]; then
    mkdir -p "$REPO_DIR/skills/finance/$plugin"
    rsync -a --delete \
      --exclude='LOCAL-*' \
      "$WORK_DIR/plugins/$plugin/skills/" "$REPO_DIR/skills/finance/$plugin/"
    echo "  ✓ $plugin"
  fi
done

# Sync eval framework — preserve our README.md
rsync -a --delete \
  --exclude='README.md' \
  --exclude='LOCAL-*' \
  "$WORK_DIR/finance-skills-workspace/" "$REPO_DIR/tests/finance-evals/"

# Refresh evals.json (root-level)
if [[ -f "$WORK_DIR/evals/evals.json" ]]; then
  cp "$WORK_DIR/evals/evals.json" "$REPO_DIR/tests/finance-evals/evals.json"
fi
echo "  ✓ tests/finance-evals/"

# Drop a NOTICE
cat > "$REPO_DIR/skills/finance/UPSTREAM_VERSION" <<EOF
upstream: $UPSTREAM_REPO
ref: $REF
commit: $UPSTREAM_COMMIT
plugin_version: $UPSTREAM_VERSION
synced_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
synced_by: scripts/sync-finance-skills.sh
license: MIT
author: Joel Lewis (joel@eleazar.dev)
EOF

echo ""
echo -e "${GREEN}✓ Sync complete.${NC} Upstream version: $UPSTREAM_VERSION"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff -- skills/finance/ tests/finance-evals/"
echo "  2. Run any tests / validation you have"
echo "  3. Commit: git add skills/finance tests/finance-evals && git commit"
