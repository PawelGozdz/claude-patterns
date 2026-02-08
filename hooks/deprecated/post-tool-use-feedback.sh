#!/bin/bash
# post-tool-use-feedback.sh
# PostToolUse hook - shows running model totals after each tool use

# CRITICAL: Always read stdin first (even if we exit early)
INPUT=$(cat)

# Extract tool info
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)

# Only show after Task tool (subagent invocations) to reduce noise
if [[ "$TOOL_NAME" != "Task" ]]; then
  exit 0
fi

# Count models in current session
if [[ -f "$TRANSCRIPT_PATH" ]]; then
  HAIKU_COUNT=$(grep -c '"model":"[^"]*haiku[^"]*"' "$TRANSCRIPT_PATH" 2>/dev/null)
  SONNET_COUNT=$(grep -c '"model":"[^"]*sonnet[^"]*"' "$TRANSCRIPT_PATH" 2>/dev/null)
  OPUS_COUNT=$(grep -c '"model":"[^"]*opus[^"]*"' "$TRANSCRIPT_PATH" 2>/dev/null)

  TOTAL=$((HAIKU_COUNT + SONNET_COUNT + OPUS_COUNT))

  if (( TOTAL > 0 )); then
    # Calculate percentages
    HAIKU_PCT=$(awk "BEGIN {printf \"%.0f\", ($HAIKU_COUNT / $TOTAL) * 100}")
    SONNET_PCT=$(awk "BEGIN {printf \"%.0f\", ($SONNET_COUNT / $TOTAL) * 100}")
    OPUS_PCT=$(awk "BEGIN {printf \"%.0f\", ($OPUS_COUNT / $TOTAL) * 100}")

    # Color coding: green if meeting targets, yellow if not
    HAIKU_COLOR="\033[33m"   # Yellow (target: >15%)
    if (( HAIKU_PCT >= 15 )); then
      HAIKU_COLOR="\033[32m"  # Green
    fi

    OPUS_COLOR="\033[32m"    # Green (target: <30%)
    if (( OPUS_PCT > 30 )); then
      OPUS_COLOR="\033[33m"  # Yellow
    fi

    echo -e "\n\033[1m📊 Session Models:\033[0m ${HAIKU_COLOR}Haiku x${HAIKU_COUNT} (${HAIKU_PCT}%)\033[0m | Sonnet x${SONNET_COUNT} (${SONNET_PCT}%) | ${OPUS_COLOR}Opus x${OPUS_COUNT} (${OPUS_PCT}%)\033[0m" >&2
  fi
fi

exit 0
