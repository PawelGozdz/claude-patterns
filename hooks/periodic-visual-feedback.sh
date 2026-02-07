#!/bin/bash
# periodic-visual-feedback.sh
# PostToolUse hook - shows model usage feedback every 10 actions

# CRITICAL: Always read stdin first to avoid broken pipe
INPUT=$(cat)

# Use /tmp for counter (survives session but not reboot)
COUNTER_FILE="/tmp/claude_action_count_$USER"

# Initialize counter if doesn't exist
if [[ ! -f "$COUNTER_FILE" ]]; then
  echo "0" > "$COUNTER_FILE"
fi

# Increment counter
COUNT=$(cat "$COUNTER_FILE")
COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNTER_FILE"

# Show feedback every 10 actions
if (( COUNT % 10 == 0 )); then
  SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
  
  # Extract agent type from session_id
  AGENT_TYPE="main"
  if [[ "$SESSION_ID" =~ ^([a-z-]+)_ ]]; then
    AGENT_TYPE="${BASH_REMATCH[1]}"
  fi
  
  # Determine model from agent type (approximate)
  MODEL="Unknown"
  COLOR="\033[0m"
  case "$AGENT_TYPE" in
    *explorer|*schema-testing*|*scaffolder*|*documentation*|*migration*)
      MODEL="Haiku"
      COLOR="\033[36m"  # Cyan
      ;;
    *orchestrator|*implementer|*verifier*|*expert*)
      MODEL="Sonnet"
      COLOR="\033[33m"  # Yellow
      ;;
    *security*|*technical-architecture*)
      MODEL="Opus"
      COLOR="\033[31m"  # Red
      ;;
  esac
  
  echo -e "\n${COLOR}📊 [Action #$COUNT] Model: $MODEL | Agent: $AGENT_TYPE\033[0m" >&2
  echo -e "${COLOR}💡 Cost Tip: Route searches to @codebase-explorer (Haiku - 60x cheaper!)\033[0m" >&2
fi

exit 0
