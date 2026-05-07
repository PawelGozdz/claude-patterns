#!/bin/bash
# sync-marketing-skills.sh - Sync upstream marketingskills into skills/marketing/ + tools/marketing/
#
# Pulls latest from coreyhaines31/marketingskills (MIT, by Corey Haines)
# and shows a diff before overwriting our vendored copy.
#
# Strategy: vendoring (full copy, not submodule). We only sync skills/ and
# tools/. Local additions (e.g. our README headers, agent file, pattern doc,
# templates/) are NEVER touched.
#
# Usage:
#   ./scripts/sync-marketing-skills.sh             # interactive — diff, confirm, sync
#   ./scripts/sync-marketing-skills.sh --apply     # sync without prompt (CI use)
#   ./scripts/sync-marketing-skills.sh --diff      # only show diff, do not change anything
#   ./scripts/sync-marketing-skills.sh --ref v1.10.0  # pin to a specific tag
#
# Requirements: git, rsync, diff

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_REPO="https://github.com/coreyhaines31/marketingskills.git"
WORK_DIR="${TMPDIR:-/tmp}/marketingskills-sync-$$"
REF="main"
MODE="interactive"

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
echo -e "${BLUE}Marketing Skills Sync${NC}"
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Upstream:${NC} $UPSTREAM_REPO"
echo -e "${BLUE}Ref:${NC}      $REF"
echo -e "${BLUE}Local:${NC}    $REPO_DIR/skills/marketing"
echo -e "${BLUE}           ${NC} $REPO_DIR/tools/marketing"
echo ""

# 1. Clone upstream into a temp dir
echo -e "${BLUE}[1/4]${NC} Cloning upstream at $REF..."
trap 'rm -rf "$WORK_DIR"' EXIT
git clone --depth 1 --branch "$REF" "$UPSTREAM_REPO" "$WORK_DIR" 2>&1 | tail -3

# 2. Capture upstream version for atrribution
UPSTREAM_VERSION=$(grep '"version"' "$WORK_DIR/.claude-plugin/plugin.json" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
echo -e "${BLUE}[2/4]${NC} Upstream version: ${GREEN}$UPSTREAM_VERSION${NC}"

# 3. Compute diff against local
echo -e "${BLUE}[3/4]${NC} Computing diff..."
DIFF_OUT=$(mktemp)
{
  diff -r --brief "$REPO_DIR/skills/marketing" "$WORK_DIR/skills" 2>&1 || true
  echo "---"
  diff -r --brief "$REPO_DIR/tools/marketing"  "$WORK_DIR/tools"  2>&1 || true
} > "$DIFF_OUT"

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
  read -p "Apply these changes to skills/marketing/ and tools/marketing/? [y/N] " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Aborted.${NC} No files changed."
    exit 1
  fi
fi

echo -e "${BLUE}[4/4]${NC} Applying with rsync..."
# Preserve our local meta files (README.md, UPSTREAM_VERSION, anything marked
# local-only). --delete removes everything else not present upstream.
rsync -a --delete \
  --exclude='README.md' \
  --exclude='UPSTREAM_VERSION' \
  --exclude='LOCAL-*' \
  "$WORK_DIR/skills/" "$REPO_DIR/skills/marketing/"

rsync -a --delete \
  --exclude='README.md' \
  --exclude='LOCAL-*' \
  "$WORK_DIR/tools/"  "$REPO_DIR/tools/marketing/"

# Drop a NOTICE so the version is auditable
cat > "$REPO_DIR/skills/marketing/UPSTREAM_VERSION" <<EOF
upstream: $UPSTREAM_REPO
ref: $REF
commit: $(cd "$WORK_DIR" && git rev-parse HEAD)
plugin_version: $UPSTREAM_VERSION
synced_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
synced_by: scripts/sync-marketing-skills.sh
license: MIT
EOF

echo ""
echo -e "${GREEN}✓ Sync complete.${NC} Upstream version: $UPSTREAM_VERSION"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff -- skills/marketing/ tools/marketing/"
echo "  2. Run any tests / validation you have"
echo "  3. Commit: git add skills/marketing tools/marketing && git commit"
