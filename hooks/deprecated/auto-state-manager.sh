#!/bin/bash

# Auto State Manager - Automatic STATE.md management
# Version: 1.0.0
# Purpose: Zero-manual-effort state tracking

set -euo pipefail

STATE_FILE=".claude/STATE.md"
DEBUG_DIR=".claude/debug"

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# CORE FUNCTIONS
# ============================================================================

# Initialize STATE.md if doesn't exist
init_state() {
    local task_id="${1:-UNKNOWN}"
    local task_title="${2:-New Task}"
    local context="${3:-unknown}"

    if [ -f "$STATE_FILE" ]; then
        echo "STATE.md already exists - skipping init"
        return 0
    fi

    cat > "$STATE_FILE" <<EOF
# LocalHero - Current State

> **Cross-Session Memory File** - Maintains continuity between Claude Code sessions
> **Last Updated**: $(date '+%Y-%m-%d %H:%M:%S')
> **Auto-Managed**: By .claude/hooks/auto-state-manager.sh

---

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

## Accumulated Context

### Recent Decisions (Last 3-5)

1. **Task Started** ($(date '+%Y-%m-%d'))
   - **Why**: User request
   - **What**: ${task_title}
   - **Impact**: ${context} context
   - **Reference**: Auto-generated

### Active Blockers

**None**

### Open Questions

**None**

---

## Session Continuity

### Last Session Summary

**Session ID**: $(date '+%Y-%m-%d-%H%M%S')
**Duration**: Starting
**Completed**:
- Task initialization

**Token Usage**:
- **Opus**: 0%
- **Sonnet**: 0%
- **Haiku**: 0%
- **Total Cost**: ~\$0.00

**Context Efficiency**: N/A (starting)

### Continue From Here

\`\`\`
Task: ${task_id}
Status: STARTING
Next: Begin implementation based on task requirements
\`\`\`

---

## Quick Reference

### Active Patterns Being Used

(Will be populated as implementation progresses)

### Key Files in Focus

\`\`\`
${context}/
├── domain/ (PENDING)
├── application/ (PENDING)
└── infrastructure/ (PENDING)
\`\`\`

### Task Checklist (Current Task Only)

- [ ] Domain Layer (L1)
- [ ] Application Layer (L2)
- [ ] Infrastructure Layer
- [ ] Verification

---

**Auto-managed by**: .claude/hooks/auto-state-manager.sh v1.0.0
EOF

    echo -e "${GREEN}✅ STATE.md initialized for ${task_id}${NC}"
}

# Update progress in STATE.md
update_progress() {
    local phase="${1:-0}"
    local total_phases="${2:-11}"
    local phase_name="${3:-Unknown Phase}"
    local last_action="${4:-Action taken}"
    local next_action="${5:-Continue work}"

    if [ ! -f "$STATE_FILE" ]; then
        echo "STATE.md doesn't exist - run init_state first"
        return 1
    fi

    # Calculate progress percentage
    local percent=$((phase * 100 / total_phases))

    # Generate progress bar (20 blocks)
    local filled=$((percent / 5))
    local empty=$((20 - filled))
    local bar=$(printf '▓%.0s' $(seq 1 $filled))$(printf '░%.0s' $(seq 1 $empty))

    # Update Last Updated timestamp
    sed -i "s/\*\*Last Updated\*\*:.*/\*\*Last Updated\*\*: $(date '+%Y-%m-%d %H:%M:%S')/" "$STATE_FILE"

    # Update Phase
    sed -i "s/\*\*Phase\*\*:.*/\*\*Phase\*\*: ${phase_name}/" "$STATE_FILE"

    # Update Progress bar
    sed -i "s/\*\*Progress\*\*:.*/\*\*Progress\*\*: [${bar}] ${percent}% (Phase ${phase} of ${total_phases})/" "$STATE_FILE"

    # Update Last Action (find line after "**Last Action**:" and replace next line)
    sed -i "/\*\*Last Action\*\*:/,/^$/ {
        /\*\*Last Action\*\*:/n
        s/.*/- ${last_action}/
    }" "$STATE_FILE"

    # Update Next Action (find line after "**Next Action**:" and replace next line)
    sed -i "/\*\*Next Action\*\*:/,/^$/ {
        /\*\*Next Action\*\*:/n
        s/.*/- ${next_action}/
    }" "$STATE_FILE"

    echo -e "${BLUE}📊 Progress updated: ${percent}% - ${phase_name}${NC}"
}

# Log a decision to Recent Decisions
log_decision() {
    local title="$1"
    local why="$2"
    local what="$3"
    local impact="$4"
    local reference="${5:-N/A}"

    if [ ! -f "$STATE_FILE" ]; then
        echo "STATE.md doesn't exist - cannot log decision"
        return 1
    fi

    # Create decision entry
    local decision_entry="
$(date '+%Y-%m-%d %H:%M:%S') - **${title}**
   - **Why**: ${why}
   - **What**: ${what}
   - **Impact**: ${impact}
   - **Reference**: ${reference}
"

    # Insert after "### Recent Decisions (Last 3-5)" line
    # This is complex with sed, so we'll use a temp file
    awk -v entry="$decision_entry" '
        /### Recent Decisions \(Last 3-5\)/ {
            print
            print entry
            next
        }
        {print}
    ' "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"

    echo -e "${GREEN}📝 Decision logged: ${title}${NC}"
}

# Add a blocker
add_blocker() {
    local title="$1"
    local issue="$2"
    local impact="$3"
    local resolution="$4"
    local owner="${5:-Current session}"

    if [ ! -f "$STATE_FILE" ]; then
        echo "STATE.md doesn't exist - cannot add blocker"
        return 1
    fi

    # Create blocker entry
    local blocker_entry="
- [ ] **${title}**
  - **Issue**: ${issue}
  - **Impact**: ${impact}
  - **Resolution Path**: ${resolution}
  - **Owner**: ${owner}
"

    # Replace "**None**" under Active Blockers or append
    if grep -q "### Active Blockers" "$STATE_FILE" && grep -A1 "### Active Blockers" "$STATE_FILE" | grep -q "^\*\*None\*\*"; then
        # Replace "**None**" with blocker
        sed -i "/### Active Blockers/,/^$/ s/\*\*None\*\*/$blocker_entry/" "$STATE_FILE"
    else
        # Append to Active Blockers section
        awk -v entry="$blocker_entry" '
            /### Active Blockers/ {
                print
                print entry
                next
            }
            {print}
        ' "$STATE_FILE" > "${STATE_FILE}.tmp" && mv "${STATE_FILE}.tmp" "$STATE_FILE"
    fi

    echo -e "${YELLOW}⚠️  Blocker added: ${title}${NC}"
}

# Mark task complete and archive
complete_task() {
    local task_id="${1:-UNKNOWN}"

    if [ ! -f "$STATE_FILE" ]; then
        echo "STATE.md doesn't exist - nothing to complete"
        return 0
    fi

    # Extract task info
    local task_line=$(grep "^\*\*Active Task\*\*:" "$STATE_FILE" || echo "UNKNOWN")
    local progress=$(grep "^\*\*Progress\*\*:" "$STATE_FILE" || echo "0%")

    # Archive to completed-tasks if directory exists
    if [ -d "project-orchestration/completed-tasks" ]; then
        local archive_file="project-orchestration/completed-tasks/${task_id}-STATE-$(date +%Y%m%d-%H%M%S).md"
        cp "$STATE_FILE" "$archive_file"
        echo -e "${GREEN}📦 Archived to ${archive_file}${NC}"
    fi

    # Clear STATE.md (reset to template)
    rm "$STATE_FILE"
    echo -e "${GREEN}✅ Task ${task_id} completed and STATE.md cleared${NC}"
}

# Display current state summary (for terminal banner)
show_state_summary() {
    if [ ! -f "$STATE_FILE" ]; then
        echo -e "${YELLOW}No active state found - starting fresh session${NC}"
        return 0
    fi

    # Extract key info
    local task=$(grep "^\*\*Active Task\*\*:" "$STATE_FILE" | sed 's/\*\*Active Task\*\*: //' || echo "UNKNOWN")
    local phase=$(grep "^\*\*Phase\*\*:" "$STATE_FILE" | sed 's/\*\*Phase\*\*: //' || echo "Unknown")
    local progress=$(grep "^\*\*Progress\*\*:" "$STATE_FILE" | sed 's/\*\*Progress\*\*: //' || echo "0%")
    local last_updated=$(grep "^\*\*Last Updated\*\*:" "$STATE_FILE" | sed 's/\*\*Last Updated\*\*: //' || echo "Unknown")
    local next_action=$(grep -A1 "^\*\*Next Action\*\*:" "$STATE_FILE" | tail -1 | sed 's/^- //' || echo "Continue work")

    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  📍 CONTINUING PREVIOUS STATE                  ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Task:${NC} ${task}"
    echo -e "${BLUE}Phase:${NC} ${phase}"
    echo -e "${BLUE}Progress:${NC} ${progress}"
    echo -e "${BLUE}Last Updated:${NC} ${last_updated}"
    echo ""
    echo -e "${YELLOW}➜ Next Action:${NC} ${next_action}"
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# ============================================================================
# COMMAND DISPATCHER
# ============================================================================

case "${1:-help}" in
    init)
        init_state "${2:-UNKNOWN}" "${3:-New Task}" "${4:-unknown}"
        ;;
    update)
        update_progress "${2:-0}" "${3:-11}" "${4:-Phase}" "${5:-Action}" "${6:-Next}"
        ;;
    decide)
        log_decision "$2" "$3" "$4" "$5" "${6:-N/A}"
        ;;
    block)
        add_blocker "$2" "$3" "$4" "$5" "${6:-Current session}"
        ;;
    complete)
        complete_task "${2:-UNKNOWN}"
        ;;
    show)
        show_state_summary
        ;;
    *)
        echo "Usage: auto-state-manager.sh {init|update|decide|block|complete|show}"
        echo ""
        echo "Commands:"
        echo "  init <task_id> <title> <context>     - Initialize STATE.md"
        echo "  update <phase> <total> <name> <last> <next> - Update progress"
        echo "  decide <title> <why> <what> <impact> [ref] - Log decision"
        echo "  block <title> <issue> <impact> <resolution> - Add blocker"
        echo "  complete <task_id>                    - Complete and archive"
        echo "  show                                  - Show current state banner"
        exit 1
        ;;
esac
