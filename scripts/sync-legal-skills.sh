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
# Requirements: git (rsync used when available, otherwise a cp fallback)

set -euo pipefail

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
EVOLSB_LIC=$(grep -E "^License|^MIT License" "$WORK_EVOLSB/LICENSE" 2>/dev/null | head -1 | head -c 40) || true
echo "evolsb/contract-review: ${EVOLSB_LIC}" > "$LICENSE_REPORT"

# Resolve which upstream folder holds each vendored skill.
#
# lawvable renames folders (2026-06: `nda-triage-anthropic` → `nda-reviewer-anthropic`)
# while the `name:` field inside SKILL.md stays stable. Matching on folder name alone
# reported all 11 skills as "NO LICENSE METADATA" — a rename read as license drift.
# Match on `name:` instead, and fall back to the folder name.
declare -A LAWVABLE_SRC=()
if [[ -d "$WORK_LAWVABLE/skills" ]]; then
  for d in "$WORK_LAWVABLE"/skills/*/; do
    [[ -f "$d/SKILL.md" ]] || continue
    # `|| true` — a SKILL.md without a `name:` field is a skipped entry, not a
    # fatal error; under `set -e` + pipefail grep's exit 1 would abort the scan.
    n=$(grep -m1 '^name:' "$d/SKILL.md" | sed 's/^name: *//' | tr -d '"'"'" | tr -d '[:space:]') || true
    [[ -n "$n" ]] && LAWVABLE_SRC["$n"]="$(basename "$d")"
  done
fi
resolve_upstream() {  # our skill name -> upstream folder name
  local want="$1"
  if [[ -n "${LAWVABLE_SRC[$want]:-}" ]]; then echo "${LAWVABLE_SRC[$want]}"; else echo "$want"; fi
}

# lawvable per-skill
LAWVABLE_DRIFT=()
for s in "${LAWVABLE_VENDORED[@]}"; do
  src=$(resolve_upstream "$s")
  # `|| true` — brak metadanych licencji jest OBSŁUGIWANĄ gałęzią niżej (NO LICENSE
  # METADATA), nie błędem; pod pipefail nonzero z grep zabiłby to przypisanie
  # przez set -e, zanim gałąź "brak metadanych" w ogóle by się wykonała.
  meta=$(grep -E "^\s*license:" "$WORK_LAWVABLE/skills/$src/SKILL.md" 2>/dev/null | head -1 | sed 's/.*license: *//' | tr -d '"' | head -c 40) || true
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
  src=$(resolve_upstream "$s")
  if [[ -d "$REPO_DIR/skills/legal/$s" && -d "$WORK_LAWVABLE/skills/$src" ]]; then
    diff -r --brief "$REPO_DIR/skills/legal/$s" "$WORK_LAWVABLE/skills/$src" 2>&1 >> "$DIFF_OUT" || true
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

echo -e "${BLUE}[4/5]${NC} Applying..."

# evolsb: copy SKILL.md (renamed from skill.md) + examples + LICENSE
mkdir -p "$REPO_DIR/skills/legal/contract-review"
cp "$WORK_EVOLSB/skill.md" "$REPO_DIR/skills/legal/contract-review/SKILL.md"
sync_tree "$WORK_EVOLSB/examples/" "$REPO_DIR/skills/legal/contract-review/examples/"
cp "$WORK_EVOLSB/LICENSE" "$REPO_DIR/skills/legal/contract-review/LICENSE.upstream"
echo "  ✓ contract-review (evolsb)"

# lawvable: copy each vendored skill folder
for s in "${LAWVABLE_VENDORED[@]}"; do
  src=$(resolve_upstream "$s")
  if [[ -d "$WORK_LAWVABLE/skills/$src" ]]; then
    mapfile -t SKILL_LOCAL < <(local_excludes "$REPO_DIR/skills/legal/$s")
    sync_tree "$WORK_LAWVABLE/skills/$src/" "$REPO_DIR/skills/legal/$s/" \
      --exclude='LOCAL-*' \
      "${SKILL_LOCAL[@]}"
    [[ "$src" != "$s" ]] && echo "  ✓ $s (lawvable, upstream folder: $src)" || echo "  ✓ $s (lawvable)"
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
