#!/bin/bash
# post-tool-use-feedback-debug.sh
# Debug version - logs actual INPUT structure for investigation

INPUT=$(cat)

# Log to file for analysis
DEBUG_LOG="/tmp/claude-hook-debug.log"
echo "=== POST TOOL USE DEBUG ===" >> "$DEBUG_LOG"
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')" >> "$DEBUG_LOG"
echo "$INPUT" | jq '.' >> "$DEBUG_LOG" 2>&1
echo "=========================" >> "$DEBUG_LOG"

# Also show in stderr (visible to user)
echo "Debug: Hook input logged to $DEBUG_LOG" >&2

exit 0
