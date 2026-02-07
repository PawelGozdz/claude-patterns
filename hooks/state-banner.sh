#!/bin/bash

# State Banner - Display STATE.md info at session start
# Version: 1.0.0
# Purpose: Show "Kontynuuję state XXXX z dnia..." automatically

set -euo pipefail

STATE_FILE=".claude/STATE.md"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Check if STATE.md exists
if [ ! -f "$STATE_FILE" ]; then
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║              🆕 NEW SESSION - Starting Fresh                   ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${YELLOW}No active state found. STATE.md will be created when you start a task.${NC}"
    echo ""
    exit 0
fi

# Extract info from STATE.md
TASK=$(grep "^\*\*Active Task\*\*:" "$STATE_FILE" | sed 's/\*\*Active Task\*\*: //' | sed 's/\*//g' || echo "UNKNOWN")
PHASE=$(grep "^\*\*Phase\*\*:" "$STATE_FILE" | sed 's/\*\*Phase\*\*: //' | sed 's/\*//g' || echo "Unknown Phase")
CONTEXT=$(grep "^\*\*Context\*\*:" "$STATE_FILE" | sed 's/\*\*Context\*\*: //' | sed 's/\*//g' || echo "unknown")
PROGRESS=$(grep "^\*\*Progress\*\*:" "$STATE_FILE" | sed 's/\*\*Progress\*\*: //' | sed 's/\*//g' || echo "[░░░░░░░░░░░░░░░░░░░░] 0%")
LAST_UPDATED=$(grep "^\*\*Last Updated\*\*:" "$STATE_FILE" | sed 's/> \*\*Last Updated\*\*: //' | sed 's/\*//g' || echo "Unknown")
LAST_ACTION=$(grep -A1 "^\*\*Last Action\*\*:" "$STATE_FILE" | tail -1 | sed 's/^- //' | sed 's/\*//g' || echo "Unknown")
NEXT_ACTION=$(grep -A1 "^\*\*Next Action\*\*:" "$STATE_FILE" | tail -1 | sed 's/^- //' | sed 's/\*//g' || echo "Continue work")

# Extract date from LAST_UPDATED (format: YYYY-MM-DD HH:MM:SS)
STATE_DATE=$(echo "$LAST_UPDATED" | cut -d' ' -f1)
STATE_TIME=$(echo "$LAST_UPDATED" | cut -d' ' -f2)

# Display banner
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          🔄 KONTYNUUJĘ STATE Z DNIA ${STATE_DATE}           ║${NC}"
echo -e "${GREEN}║                     Godzina: ${STATE_TIME}                         ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}${BLUE}📋 Aktywne zadanie:${NC} ${TASK}"
echo -e "${BOLD}${BLUE}🎯 Faza:${NC} ${PHASE}"
echo -e "${BOLD}${BLUE}📁 Kontekst:${NC} ${CONTEXT}"
echo ""
echo -e "${BOLD}${BLUE}📊 Postęp:${NC}"
echo -e "   ${PROGRESS}"
echo ""
echo -e "${BOLD}${CYAN}✅ Ostatnia akcja:${NC}"
echo -e "   ${LAST_ACTION}"
echo ""
echo -e "${BOLD}${YELLOW}➜  Następny krok:${NC}"
echo -e "   ${NEXT_ACTION}"
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${CYAN}💡 Tip: Użyj ${BOLD}/hero-progress${NC}${CYAN} aby zobaczyć pełny raport${NC}"
echo ""
