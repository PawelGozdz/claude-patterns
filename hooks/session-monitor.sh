#!/bin/bash
# session-monitor.sh - Unified session monitoring hook
# Merges: session-summary.sh + periodic-visual-feedback.sh + post-tool-use-feedback.sh
#
# PostToolUse hook: shows model usage after Task tool invocations
# SessionEnd hook: logs session statistics

# CRITICAL: Always read stdin first to avoid broken pipe
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)

# --- Action counter (periodic feedback) ---
COUNTER_FILE="/tmp/claude_action_count_${USER}"
if [[ ! -f "$COUNTER_FILE" ]]; then
  echo "0" > "$COUNTER_FILE"
fi
COUNT=$(cat "$COUNTER_FILE")
COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNTER_FILE"

# --- After Task tool: show running model totals ---
if [[ "$TOOL_NAME" == "Task" && -f "$TRANSCRIPT_PATH" ]]; then
  HAIKU_COUNT=$(grep -c '"model":"[^"]*haiku[^"]*"' "$TRANSCRIPT_PATH" 2>/dev/null || echo 0)
  SONNET_COUNT=$(grep -c '"model":"[^"]*sonnet[^"]*"' "$TRANSCRIPT_PATH" 2>/dev/null || echo 0)
  OPUS_COUNT=$(grep -c '"model":"[^"]*opus[^"]*"' "$TRANSCRIPT_PATH" 2>/dev/null || echo 0)

  TOTAL=$((HAIKU_COUNT + SONNET_COUNT + OPUS_COUNT))

  if (( TOTAL > 0 )); then
    HAIKU_PCT=$(awk "BEGIN {printf \"%.0f\", ($HAIKU_COUNT / $TOTAL) * 100}")
    SONNET_PCT=$(awk "BEGIN {printf \"%.0f\", ($SONNET_COUNT / $TOTAL) * 100}")
    OPUS_PCT=$(awk "BEGIN {printf \"%.0f\", ($OPUS_COUNT / $TOTAL) * 100}")

    # Color: green if meeting target, yellow if not
    HC="\033[33m"; [[ $HAIKU_PCT -ge 15 ]] && HC="\033[32m"
    OC="\033[32m"; [[ $OPUS_PCT -gt 30 ]] && OC="\033[33m"

    echo -e "\033[1mModels:\033[0m ${HC}Haiku x${HAIKU_COUNT} (${HAIKU_PCT}%)\033[0m | Sonnet x${SONNET_COUNT} (${SONNET_PCT}%) | ${OC}Opus x${OPUS_COUNT} (${OPUS_PCT}%)\033[0m" >&2
  fi
fi

# --- Periodic tip (every 10 actions) ---
if (( COUNT % 10 == 0 )) && [[ "$TOOL_NAME" != "Task" ]]; then
  echo -e "\033[36m[Action #$COUNT] Tip: Route searches to @codebase-explorer (Haiku - 60x cheaper)\033[0m" >&2
fi

# --- Session end: log to CSV ---
if [[ "$TOOL_NAME" == "_SessionEnd" && -f "$TRANSCRIPT_PATH" ]]; then
  SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
  ANALYTICS_DIR=".claude/analytics"
  mkdir -p "$ANALYTICS_DIR"
  LOG_FILE="$ANALYTICS_DIR/session-distribution.csv"

  if [[ ! -f "$LOG_FILE" ]]; then
    echo "timestamp,session_id,model,count" > "$LOG_FILE"
  fi

  TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
  HAIKU_COUNT=$(grep -c '"model":"[^"]*haiku[^"]*"' "$TRANSCRIPT_PATH" 2>/dev/null || echo 0)
  SONNET_COUNT=$(grep -c '"model":"[^"]*sonnet[^"]*"' "$TRANSCRIPT_PATH" 2>/dev/null || echo 0)
  OPUS_COUNT=$(grep -c '"model":"[^"]*opus[^"]*"' "$TRANSCRIPT_PATH" 2>/dev/null || echo 0)

  echo "$TIMESTAMP,$SESSION_ID,haiku,$HAIKU_COUNT" >> "$LOG_FILE"
  echo "$TIMESTAMP,$SESSION_ID,sonnet,$SONNET_COUNT" >> "$LOG_FILE"
  echo "$TIMESTAMP,$SESSION_ID,opus,$OPUS_COUNT" >> "$LOG_FILE"
fi

exit 0
