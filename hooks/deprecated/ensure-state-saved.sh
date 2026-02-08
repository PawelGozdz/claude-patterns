#!/bin/bash

# Ensure State Saved - Pre-clear hook
# Version: 1.0.0
# Purpose: Verify STATE.md is current before /clear

set -euo pipefail

STATE_FILE=".claude/STATE.md"

# Colors
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Check if STATE.md exists
if [ ! -f "$STATE_FILE" ]; then
    echo -e "${GREEN}✅ No STATE.md found - /clear is safe${NC}"
    exit 0
fi

# Get last update time from STATE.md
LAST_UPDATED=$(grep "^\*\*Last Updated\*\*:" "$STATE_FILE" | sed 's/> \*\*Last Updated\*\*: //' | sed 's/\*//g' || echo "Unknown")

# Check if STATE.md was updated recently (within last 5 minutes)
if [ "$LAST_UPDATED" != "Unknown" ]; then
    LAST_UPDATED_TIMESTAMP=$(date -d "$LAST_UPDATED" +%s 2>/dev/null || echo "0")
    CURRENT_TIMESTAMP=$(date +%s)
    DIFF=$((CURRENT_TIMESTAMP - LAST_UPDATED_TIMESTAMP))

    if [ $DIFF -lt 300 ]; then
        echo -e "${GREEN}✅ STATE.md updated recently ($((DIFF / 60)) minutes ago) - /clear is safe${NC}"
        exit 0
    fi
fi

# Warn if STATE.md is stale
echo ""
echo -e "${YELLOW}⚠️  WARNING: STATE.md last updated: ${LAST_UPDATED}${NC}"
echo -e "${YELLOW}This is more than 5 minutes ago.${NC}"
echo ""
echo -e "${YELLOW}Before running /clear, consider updating STATE.md with:${NC}"
echo -e "  - Last completed action"
echo -e "  - Next action to take"
echo -e "  - Any important decisions or blockers"
echo ""
echo -e "${GREEN}If STATE.md is current, /clear will proceed.${NC}"
echo ""

# Don't block - just warn
exit 0
