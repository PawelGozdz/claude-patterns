#!/bin/bash
# session-summary.sh
# SessionEnd hook - logs session statistics and shows model distribution

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')

# Ensure analytics directory exists (PROJECT, not user home)
ANALYTICS_DIR=".claude/analytics"
mkdir -p "$ANALYTICS_DIR"

LOG_FILE="$ANALYTICS_DIR/session-distribution.csv"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

# Initialize CSV if doesn't exist
if [[ ! -f "$LOG_FILE" ]]; then
  echo "timestamp,session_id,model,count" > "$LOG_FILE"
fi

# Extract model usage from transcript
if [[ -f "$TRANSCRIPT_PATH" ]]; then
  # Parse transcript for model invocations
  # Claude Code uses full model names like "claude-sonnet-4-5-20250929"
  HAIKU_COUNT=$(grep -c '"model":"[^"]*haiku[^"]*"' "$TRANSCRIPT_PATH")
  SONNET_COUNT=$(grep -c '"model":"[^"]*sonnet[^"]*"' "$TRANSCRIPT_PATH")
  OPUS_COUNT=$(grep -c '"model":"[^"]*opus[^"]*"' "$TRANSCRIPT_PATH")
  
  TOTAL=$((HAIKU_COUNT + SONNET_COUNT + OPUS_COUNT))
  
  # Log to CSV
  echo "$TIMESTAMP,$SESSION_ID,haiku,$HAIKU_COUNT" >> "$LOG_FILE"
  echo "$TIMESTAMP,$SESSION_ID,sonnet,$SONNET_COUNT" >> "$LOG_FILE"
  echo "$TIMESTAMP,$SESSION_ID,opus,$OPUS_COUNT" >> "$LOG_FILE"
  
  # Calculate percentages
  if (( TOTAL > 0 )); then
    HAIKU_PCT=$(awk "BEGIN {printf \"%.1f\", ($HAIKU_COUNT / $TOTAL) * 100}")
    SONNET_PCT=$(awk "BEGIN {printf \"%.1f\", ($SONNET_COUNT / $TOTAL) * 100}")
    OPUS_PCT=$(awk "BEGIN {printf \"%.1f\", ($OPUS_COUNT / $TOTAL) * 100}")
    
    echo -e "\n\033[1m📊 Session Summary ($SESSION_ID)\033[0m" >&2
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
    echo -e "\033[36mHaiku:\033[0m  $HAIKU_COUNT calls ($HAIKU_PCT%)  [Target: >15%]" >&2
    echo -e "\033[33mSonnet:\033[0m $SONNET_COUNT calls ($SONNET_PCT%)  [Target: ~55%]" >&2
    echo -e "\033[31mOpus:\033[0m   $OPUS_COUNT calls ($OPUS_PCT%)  [Target: <30%]" >&2
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >&2
    echo -e "Total: $TOTAL model invocations" >&2
    echo -e "Logged to: $LOG_FILE" >&2
    
    # Show warnings if targets not met
    if (( $(echo "$HAIKU_PCT < 15.0" | bc -l) )); then
      echo -e "\033[33m⚠️ Haiku usage below target! Consider delegating searches to @codebase-explorer\033[0m" >&2
    fi
    
    if (( $(echo "$OPUS_PCT > 30.0" | bc -l) )); then
      echo -e "\033[33m⚠️ Opus usage above target! Review if tasks could use Sonnet/Haiku instead\033[0m" >&2
    fi
  else
    echo "No model invocations detected in transcript" >&2
  fi
else
  echo "Transcript not found: $TRANSCRIPT_PATH" >&2
fi

exit 0
