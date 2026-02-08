#!/bin/bash
# state-manager.sh - Unified state management hook
# Merges: auto-state-manager.sh + ensure-state-saved.sh + state-banner.sh
#
# Usage:
#   state-manager.sh show       - Display state banner (SessionStart)
#   state-manager.sh check      - Warn if STATE.md stale (pre-clear)
#   state-manager.sh init <id> <title> <context>  - Initialize STATE.md
#   state-manager.sh update <phase> <total> <name> <last> <next>
#   state-manager.sh decide <title> <why> <what> <impact> [ref]
#   state-manager.sh block <title> <issue> <impact> <resolution>
#   state-manager.sh complete <task_id>

set -euo pipefail

STATE_FILE=".claude/STATE.md"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

# ============================================================================
# SHOW: Display state banner at session start
# ============================================================================
cmd_show() {
  if [ ! -f "$STATE_FILE" ]; then
    echo -e "${CYAN}NEW SESSION - No active state found.${NC}" >&2
    return 0
  fi

  TASK=$(grep "^\*\*Active Task\*\*:" "$STATE_FILE" | sed 's/\*\*Active Task\*\*: //' | sed 's/\*//g' || echo "UNKNOWN")
  PHASE=$(grep "^\*\*Phase\*\*:" "$STATE_FILE" | sed 's/\*\*Phase\*\*: //' | sed 's/\*//g' || echo "Unknown")
  PROGRESS=$(grep "^\*\*Progress\*\*:" "$STATE_FILE" | sed 's/\*\*Progress\*\*: //' | sed 's/\*//g' || echo "0%")
  LAST_UPDATED=$(grep "^\*\*Last Updated\*\*:" "$STATE_FILE" | sed 's/> \*\*Last Updated\*\*: //' | sed 's/\*//g' || echo "Unknown")
  NEXT_ACTION=$(grep -A1 "^\*\*Next Action\*\*:" "$STATE_FILE" | tail -1 | sed 's/^- //' | sed 's/\*//g' || echo "Continue work")

  STATE_DATE=$(echo "$LAST_UPDATED" | cut -d' ' -f1)

  echo "" >&2
  echo -e "${GREEN}CONTINUING STATE from ${STATE_DATE}${NC}" >&2
  echo -e "${BLUE}Task:${NC} ${TASK}" >&2
  echo -e "${BLUE}Phase:${NC} ${PHASE}" >&2
  echo -e "${BLUE}Progress:${NC} ${PROGRESS}" >&2
  echo -e "${YELLOW}Next:${NC} ${NEXT_ACTION}" >&2
  echo "" >&2
}

# ============================================================================
# CHECK: Warn if STATE.md is stale (before /clear)
# ============================================================================
cmd_check() {
  if [ ! -f "$STATE_FILE" ]; then
    echo -e "${GREEN}No STATE.md - /clear is safe${NC}" >&2
    return 0
  fi

  LAST_UPDATED=$(grep "^\*\*Last Updated\*\*:" "$STATE_FILE" | sed 's/> \*\*Last Updated\*\*: //' | sed 's/\*//g' || echo "Unknown")

  if [ "$LAST_UPDATED" != "Unknown" ]; then
    LAST_TS=$(date -d "$LAST_UPDATED" +%s 2>/dev/null || echo "0")
    NOW_TS=$(date +%s)
    DIFF=$((NOW_TS - LAST_TS))

    if [ $DIFF -lt 300 ]; then
      echo -e "${GREEN}STATE.md updated recently - /clear is safe${NC}" >&2
      return 0
    fi
  fi

  echo -e "${YELLOW}STATE.md last updated: ${LAST_UPDATED} - consider updating before /clear${NC}" >&2
  exit 0  # Don't block, just warn
}

# ============================================================================
# INIT: Initialize STATE.md for a new task
# ============================================================================
cmd_init() {
  local task_id="${1:-UNKNOWN}"
  local task_title="${2:-New Task}"
  local context="${3:-unknown}"

  if [ -f "$STATE_FILE" ]; then
    echo "STATE.md already exists - skipping init" >&2
    return 0
  fi

  cat > "$STATE_FILE" <<EOF
# LocalHero - Current State

> **Last Updated**: $(date '+%Y-%m-%d %H:%M:%S')

## Current Position

**Active Task**: ${task_id} - ${task_title}
**Phase**: Starting
**Context**: ${context}
**Progress**: [░░░░░░░░░░░░░░░░░░░░] 0% (Phase 0 of 11)

**Last Action**:
- Task initialized

**Next Action**:
- Begin implementation

---

## Recent Decisions (Last 3-5)

1. **Task Started** ($(date '+%Y-%m-%d'))
   - ${task_title}

### Active Blockers

**None**

---

## Task Checklist

- [ ] Domain Layer
- [ ] Application Layer
- [ ] Infrastructure Layer
- [ ] Verification
EOF

  echo -e "${GREEN}STATE.md initialized for ${task_id}${NC}" >&2
}

# ============================================================================
# UPDATE: Update progress in STATE.md
# ============================================================================
cmd_update() {
  local phase="${1:-0}"
  local total_phases="${2:-11}"
  local phase_name="${3:-Unknown Phase}"
  local last_action="${4:-Action taken}"
  local next_action="${5:-Continue work}"

  if [ ! -f "$STATE_FILE" ]; then
    echo "STATE.md doesn't exist - run init first" >&2
    return 1
  fi

  local percent=$((phase * 100 / total_phases))
  local filled=$((percent / 5))
  local empty=$((20 - filled))
  local bar=$(printf '▓%.0s' $(seq 1 $filled))$(printf '░%.0s' $(seq 1 $empty))

  sed -i "s/\*\*Last Updated\*\*:.*/\*\*Last Updated\*\*: $(date '+%Y-%m-%d %H:%M:%S')/" "$STATE_FILE"
  sed -i "s/\*\*Phase\*\*:.*/\*\*Phase\*\*: ${phase_name}/" "$STATE_FILE"
  sed -i "s/\*\*Progress\*\*:.*/\*\*Progress\*\*: [${bar}] ${percent}% (Phase ${phase} of ${total_phases})/" "$STATE_FILE"

  sed -i "/\*\*Last Action\*\*:/,/^$/ { /\*\*Last Action\*\*:/n; s/.*/- ${last_action}/; }" "$STATE_FILE"
  sed -i "/\*\*Next Action\*\*:/,/^$/ { /\*\*Next Action\*\*:/n; s/.*/- ${next_action}/; }" "$STATE_FILE"

  echo -e "${BLUE}Progress: ${percent}% - ${phase_name}${NC}" >&2
}

# ============================================================================
# DECIDE: Log a decision
# ============================================================================
cmd_decide() {
  local title="$1" why="$2" what="$3" impact="$4" reference="${5:-N/A}"

  if [ ! -f "$STATE_FILE" ]; then
    echo "STATE.md doesn't exist" >&2
    return 1
  fi

  local entry="$(date '+%Y-%m-%d %H:%M:%S') - **${title}**: ${what} (${why})"

  awk -v e="$entry" '/### Recent Decisions/ { print; print ""; print e; next } {print}' \
    "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"

  echo -e "${GREEN}Decision logged: ${title}${NC}" >&2
}

# ============================================================================
# BLOCK: Add a blocker
# ============================================================================
cmd_block() {
  local title="$1" issue="$2" impact="$3" resolution="$4"

  if [ ! -f "$STATE_FILE" ]; then
    echo "STATE.md doesn't exist" >&2
    return 1
  fi

  local entry="- [ ] **${title}**: ${issue} (Impact: ${impact}, Path: ${resolution})"

  if grep -q "### Active Blockers" "$STATE_FILE" && grep -A1 "### Active Blockers" "$STATE_FILE" | grep -q "^\*\*None\*\*"; then
    sed -i "/### Active Blockers/,/^$/ s/\*\*None\*\*/${entry}/" "$STATE_FILE"
  else
    awk -v e="$entry" '/### Active Blockers/ { print; print e; next } {print}' \
      "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
  fi

  echo -e "${YELLOW}Blocker added: ${title}${NC}" >&2
}

# ============================================================================
# COMPLETE: Mark task done, optionally archive
# ============================================================================
cmd_complete() {
  local task_id="${1:-UNKNOWN}"

  if [ ! -f "$STATE_FILE" ]; then
    return 0
  fi

  if [ -d "project-orchestration/completed-tasks" ]; then
    local archive="project-orchestration/completed-tasks/${task_id}-STATE-$(date +%Y%m%d-%H%M%S).md"
    cp "$STATE_FILE" "$archive"
    echo -e "${GREEN}Archived to ${archive}${NC}" >&2
  fi

  rm "$STATE_FILE"
  echo -e "${GREEN}Task ${task_id} completed, STATE.md cleared${NC}" >&2
}

# ============================================================================
# DISPATCHER
# ============================================================================
case "${1:-show}" in
  show)     cmd_show ;;
  check)    cmd_check ;;
  init)     shift; cmd_init "$@" ;;
  update)   shift; cmd_update "$@" ;;
  decide)   shift; cmd_decide "$@" ;;
  block)    shift; cmd_block "$@" ;;
  complete) shift; cmd_complete "$@" ;;
  *)
    echo "Usage: state-manager.sh {show|check|init|update|decide|block|complete}" >&2
    exit 1
    ;;
esac
