#!/bin/bash
# sync-legal-skills.sh - Sync upstream legal skills with per-skill license verification
#
# Vendors skills from two upstream sources:
#   1. evolsb/claude-legal-skill (single MIT skill: contract-review)
#   2. lawvable/awesome-legal-skills (filter to skills with metadata.license
#      matching VENDORABLE_LICENSES — never silently include AGPL/proprietary)
#
# Updates skills/legal/EXTERNAL.md with current catalog of NON-vendored skills
# (mostly AGPL-3.0 — copyleft, requires per-project install with license
# awareness).
#
# Usage:
#   ./scripts/sync-legal-skills.sh                    # interactive — diff, confirm, sync
#   ./scripts/sync-legal-skills.sh --apply            # sync without prompt
#   ./scripts/sync-legal-skills.sh --diff             # only show diff
#   ./scripts/sync-legal-skills.sh --verify-licenses  # re-check licenses, no copy
#
# Requirements: git, rsync

set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVOLSB_REPO="https://github.com/evolsb/claude-legal-skill.git"
LAWVABLE_REPO="https://github.com/lawvable/awesome-legal-skills.git"
WORK_EVOLSB="${TMPDIR:-/tmp}/legal-sync-evolsb-$$"
WORK_LAWVABLE="${TMPDIR:-/tmp}/legal-sync-lawvable-$$"
MODE="interactive"

# Licenses we vendor (claude-patterns is MIT — must stay compatible)
VENDORABLE_LICENSES="MIT Apache-2.0 BSD-3-Clause BSD-2-Clause ISC"

# Skills we vendor from lawvable (selected at vendor-time per their metadata.license)
LAWVABLE_VENDORED=(
  canned-responses-anthropic
  compliance-anthropic
  contract-review-anthropic
  legal-risk-assessment-anthropic
  meeting-briefing-anthropic
  nda-triage-anthropic
  skill-creator-openai
  docx-processing-openai
  pdf-processing-openai
  xlsx-processing-openai
  security-review-openai
)

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) MODE="apply"; shift ;;
    --diff)  MODE="diff";  shift ;;
    --verify-licenses) MODE="verify"; shift ;;
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

cleanup() { rm -rf "$WORK_EVOLSB" "$WORK_LAWVABLE"; }
trap cleanup EXIT

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Legal Skills Sync${NC}"
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Sources:${NC}"
echo "    $EVOLSB_REPO (1 skill, MIT)"
echo "    $LAWVABLE_REPO (filtered: only Apache-2.0 / MIT skills vendored)"
echo -e "${BLUE}Vendorable licenses:${NC} $VENDORABLE_LICENSES"
echo -e "${BLUE}Local:${NC} $REPO_DIR/skills/legal"
echo ""

# 1. Clone both upstreams
echo -e "${BLUE}[1/5]${NC} Cloning upstreams..."
git clone --depth 1 "$EVOLSB_REPO" "$WORK_EVOLSB" 2>&1 | tail -1
git clone --depth 1 "$LAWVABLE_REPO" "$WORK_LAWVABLE" 2>&1 | tail -1

EVOLSB_COMMIT=$(cd "$WORK_EVOLSB" && git rev-parse HEAD)
LAWVABLE_COMMIT=$(cd "$WORK_LAWVABLE" && git rev-parse HEAD)
echo "  evolsb:   $EVOLSB_COMMIT"
echo "  lawvable: $LAWVABLE_COMMIT"

# 2. Verify licenses of all upstream skills
echo -e "${BLUE}[2/5]${NC} Verifying licenses..."
LICENSE_REPORT=$(mktemp)

# evolsb single skill
EVOLSB_LIC=$(grep -E "^License|^MIT License" "$WORK_EVOLSB/LICENSE" 2>/dev/null | head -1 | head -c 40)
echo "evolsb/contract-review: ${EVOLSB_LIC}" > "$LICENSE_REPORT"

# lawvable per-skill
LAWVABLE_DRIFT=()
for s in "${LAWVABLE_VENDORED[@]}"; do
  meta=$(grep -E "^\s*license:" "$WORK_LAWVABLE/skills/$s/SKILL.md" 2>/dev/null | head -1 | sed 's/.*license: *//' | tr -d '"' | head -c 40)
  if [[ -z "$meta" ]]; then
    echo "lawvable/$s: ⚠️  NO LICENSE METADATA" >> "$LICENSE_REPORT"
    LAWVABLE_DRIFT+=("$s (missing metadata)")
    continue
  fi
  compatible=false
  for ok in $VENDORABLE_LICENSES; do
    [[ "$meta" == "$ok"* ]] && compatible=true
  done
  if $compatible; then
    echo "lawvable/$s: ✓ $meta" >> "$LICENSE_REPORT"
  else
    echo "lawvable/$s: ❌ $meta (was vendored — license drift!)" >> "$LICENSE_REPORT"
    LAWVABLE_DRIFT+=("$s ($meta)")
  fi
done

cat "$LICENSE_REPORT"

if [[ ${#LAWVABLE_DRIFT[@]} -gt 0 ]]; then
  echo ""
  echo -e "${RED}⚠️  License drift detected for ${#LAWVABLE_DRIFT[@]} skill(s):${NC}"
  printf '  - %s\n' "${LAWVABLE_DRIFT[@]}"
  echo "  Action: review whether to remove these from skills/legal/ or update VENDORABLE_LICENSES."
  if [[ "$MODE" != "verify" ]]; then
    echo -e "${RED}Aborting${NC} — fix drift before syncing."
    exit 3
  fi
fi

if [[ "$MODE" == "verify" ]]; then
  echo ""
  echo -e "${GREEN}✓ Verification complete.${NC}"
  exit 0
fi

# 3. Compute diff
echo -e "${BLUE}[3/5]${NC} Computing diff..."
DIFF_OUT=$(mktemp)

# evolsb
diff -r --brief "$REPO_DIR/skills/legal/contract-review" "$WORK_EVOLSB" 2>&1 \
  | grep -v "Only in $WORK_EVOLSB:\s*\(LICENSE\|README.md\|CHANGELOG.md\|.git\)" \
  | grep -v "Only in $REPO_DIR/skills/legal/contract-review:\s*\(UPSTREAM_VERSION\|LICENSE.upstream\)" >> "$DIFF_OUT" 2>&1 || true

# lawvable
for s in "${LAWVABLE_VENDORED[@]}"; do
  if [[ -d "$REPO_DIR/skills/legal/$s" && -d "$WORK_LAWVABLE/skills/$s" ]]; then
    diff -r --brief "$REPO_DIR/skills/legal/$s" "$WORK_LAWVABLE/skills/$s" 2>&1 >> "$DIFF_OUT" || true
  fi
done

CHANGES=$(grep -cE '^(Only in|Files .* differ)' "$DIFF_OUT" || true)
if [[ "$CHANGES" == "0" ]]; then
  echo -e "${GREEN}No changes.${NC} Local is in sync."
  if [[ "$MODE" != "diff" ]]; then exit 0; fi
fi

echo "$CHANGES change(s):"
head -50 "$DIFF_OUT"

if [[ "$MODE" == "diff" ]]; then
  echo ""
  echo -e "${BLUE}Diff-only mode.${NC} No files changed."
  exit 0
fi

# 4. Confirm and apply
if [[ "$MODE" == "interactive" ]]; then
  echo ""
  read -p "Apply changes? [y/N] " -n 1 -r
  echo ""
  [[ ! $REPLY =~ ^[Yy]$ ]] && { echo -e "${YELLOW}Aborted.${NC}"; exit 1; }
fi

echo -e "${BLUE}[4/5]${NC} Applying with rsync..."

# evolsb: copy SKILL.md (renamed from skill.md) + examples + LICENSE
mkdir -p "$REPO_DIR/skills/legal/contract-review"
cp "$WORK_EVOLSB/skill.md" "$REPO_DIR/skills/legal/contract-review/SKILL.md"
rsync -a --delete "$WORK_EVOLSB/examples/" "$REPO_DIR/skills/legal/contract-review/examples/"
cp "$WORK_EVOLSB/LICENSE" "$REPO_DIR/skills/legal/contract-review/LICENSE.upstream"
echo "  ✓ contract-review (evolsb)"

# lawvable: copy each vendored skill folder
for s in "${LAWVABLE_VENDORED[@]}"; do
  if [[ -d "$WORK_LAWVABLE/skills/$s" ]]; then
    rsync -a --delete \
      --exclude='LOCAL-*' \
      "$WORK_LAWVABLE/skills/$s/" "$REPO_DIR/skills/legal/$s/"
    echo "  ✓ $s (lawvable)"
  fi
done

# 5. Refresh UPSTREAM_VERSION
cat > "$REPO_DIR/skills/legal/UPSTREAM_VERSION" <<EOF
vendored_skills:
  - skill: contract-review
    upstream: $EVOLSB_REPO
    commit: $EVOLSB_COMMIT
    license: MIT
    author: Christopher Sheehan (evolsb)

  - skills:
$(printf '      - %s\n' "${LAWVABLE_VENDORED[@]}")
    upstream: $LAWVABLE_REPO
    commit: $LAWVABLE_COMMIT
    license: Apache-2.0  # per metadata.license in each SKILL.md
    note: Repo-level CC BY-NC-ND but individual skills retain their own licenses.

synced_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
synced_by: scripts/sync-legal-skills.sh
EOF

echo -e "${BLUE}[5/5]${NC} ${GREEN}✓ Sync complete.${NC}"
echo ""
echo "Notes:"
echo "  - skills/legal/EXTERNAL.md catalog is NOT auto-regenerated by this script;"
echo "    update manually when significant upstream changes happen."
echo "  - Run with --verify-licenses periodically to catch upstream license drift."
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff -- skills/legal/"
echo "  2. Commit: git add skills/legal && git commit"
