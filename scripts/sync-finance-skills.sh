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
# Requirements: git, diff (rsync used when available, otherwise a cp fallback)

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_REPO="https://github.com/JoelLewis/finance_skills.git"
WORK_DIR="${TMPDIR:-/tmp}/finance-skills-sync-$$"
REF="main"
MODE="interactive"

PLUGINS=(core wealth-management compliance advisory-practice trading-operations client-operations data-integration)

source "$REPO_DIR/scripts/lib/common.sh"

# --- rsync-free mirroring --------------------------------------------------
# These scripts assumed rsync. It is not installed everywhere (this repo's own
# dev box has none, and no root to add it), and the failure mode was the bad
# one: the script died at the *apply* step, after already copying part of the
# tree. `sync_tree` uses rsync when present and falls back to a find+cp mirror
# with the same semantics: drop what upstream no longer has, copy the rest,
# honour excludes. Exclude patterns follow rsync's rule — a bare pattern
# matches a basename at any depth, a leading `/` anchors it to the tree root.
_sync_excluded() {
  local rel="$1"; shift
  local base="${rel##*/}" p
  for p in "$@"; do
    if [[ "$p" == /* ]]; then
      [[ "$rel" == "${p#/}" || "$rel" == "${p#/}"/* ]] && return 0
    else
      [[ "$base" == $p ]] && return 0
    fi
  done
  return 1
}

_mirror_dir() {
  local src="${1%/}" dst="${2%/}"; shift 2
  local -a excl=(); local a rel
  for a in "$@"; do excl+=("${a#--exclude=}"); done
  mkdir -p "$dst"

  # 1. drop entries upstream no longer has
  while IFS= read -r rel; do
    [[ -z "$rel" ]] && continue
    _sync_excluded "$rel" "${excl[@]}" && continue
    [[ -e "$src/$rel" ]] || rm -rf "${dst:?}/$rel"
  done < <(cd "$dst" && find . -mindepth 1 -depth -printf '%P\n' 2>/dev/null)

  # 2. copy in everything upstream does have
  while IFS= read -r rel; do
    [[ -z "$rel" ]] && continue
    _sync_excluded "$rel" "${excl[@]}" && continue
    if [[ -d "$src/$rel" ]]; then
      mkdir -p "$dst/$rel"
    else
      mkdir -p "$dst/$(dirname "$rel")"
      rm -rf "${dst:?}/$rel"
      cp -a "$src/$rel" "$dst/$rel"
    fi
  done < <(cd "$src" && find . -mindepth 1 -printf '%P\n' 2>/dev/null)
}

sync_tree() {  # sync_tree SRC/ DST/ [--exclude=PATTERN]...
  local src="$1" dst="$2"; shift 2
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$@" "$src" "$dst"
  else
    _mirror_dir "$src" "$dst" "$@"
  fi
}

# --- LOCAL-file protection -------------------------------------------------
# `--exclude=LOCAL-*` only covers the filename convention. CLAUDE.md actually
# teaches a *marker* convention — a skill we wrote ourselves carries
# `<!-- LOCAL — not synced from upstream -->` right under its frontmatter.
# Without this, `rsync --delete` silently wipes those skills on the next sync.
# Emits one `--exclude=/<top-level-entry>` per marked file, so the whole
# skill folder survives, not just the marked file.
local_excludes() {
  local root="$1"
  [[ -d "$root" ]] || return 0
  grep -rlZ --include='*.md' -e 'LOCAL — not synced from upstream' \
       -e 'LOCAL - not synced from upstream' "$root" 2>/dev/null \
    | while IFS= read -r -d '' f; do
        local rel="${f#"$root"/}"
        printf -- '--exclude=/%s\n' "${rel%%/*}"
      done | sort -u
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) MODE="apply"; shift ;;
    --diff)  MODE="diff";  shift ;;
    --ref)   REF="${2:?--ref wymaga wartości}"; shift 2 ;;
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
# Upstream moved marketplace.json under .claude-plugin/ (2026-06); keep the old
# root path as fallback so pinning to an older --ref still resolves a version.
MARKETPLACE=""
for cand in "$WORK_DIR/.claude-plugin/marketplace.json" "$WORK_DIR/marketplace.json"; do
  [[ -f "$cand" ]] && { MARKETPLACE="$cand"; break; }
done
if [[ -z "$MARKETPLACE" ]]; then
  echo -e "${RED}No marketplace.json found upstream${NC} (looked in .claude-plugin/ and repo root)." >&2
  echo "Upstream layout changed — update this script before syncing." >&2
  exit 4
fi
UPSTREAM_VERSION=$(grep '"version"' "$MARKETPLACE" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
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

echo -e "${BLUE}[4/4]${NC} Applying..."

# Sync each plugin's skills/ subfolder, preserving local meta files
for plugin in "${PLUGINS[@]}"; do
  if [[ -d "$WORK_DIR/plugins/$plugin/skills" ]]; then
    mkdir -p "$REPO_DIR/skills/finance/$plugin"
    mapfile -t PLUGIN_LOCAL < <(local_excludes "$REPO_DIR/skills/finance/$plugin")
    sync_tree "$WORK_DIR/plugins/$plugin/skills/" "$REPO_DIR/skills/finance/$plugin/" \
      --exclude='LOCAL-*' \
      "${PLUGIN_LOCAL[@]}"
    echo "  ✓ $plugin"
  fi
done

# Sync eval framework — preserve our README.md
mapfile -t EVALS_LOCAL < <(local_excludes "$REPO_DIR/tests/finance-evals")
sync_tree "$WORK_DIR/finance-skills-workspace/" "$REPO_DIR/tests/finance-evals/" \
  --exclude='/README.md' \
  --exclude='/evals.json' \
  --exclude='LOCAL-*' \
  "${EVALS_LOCAL[@]}"

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
