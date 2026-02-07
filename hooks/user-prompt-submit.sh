#!/bin/bash
# User Prompt Submit Hook - Automatic Delegation via JSON additionalContext
# FIXED VERSION: Uses JSON output format (not plain stdout modification)
#
# Based on Claude Code docs: stdout from UserPromptSubmit is added as CONTEXT
# NOT as prompt modification. We use additionalContext for delegation instructions.
#
# Version: 8.0 (2026-01-13) - Aggressive Task tool enforcement (no skills layer)
# Related: TS-KNOWLEDGE-001-claude-code-optimization

set -e

# Routing config path
ROUTING_CONFIG=".claude/routing-config.json"

# Check dependencies
if [ ! -f "$ROUTING_CONFIG" ]; then
  echo '{"error": "Routing config not found"}' >&2
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo '{"error": "jq is required"}' >&2
  exit 1
fi

# Get user prompt from stdin or argument
RAW_INPUT="${1:-$(cat)}"

# Check if input is empty
if [ -z "$RAW_INPUT" ]; then
  exit 0
fi

# Claude Code may pass JSON with metadata - extract the actual prompt
# Format: {"session_id":"...", "prompt":"actual user prompt", ...}
if echo "$RAW_INPUT" | jq -e '.prompt' > /dev/null 2>&1; then
  # Input is JSON with prompt field - extract it
  PROMPT=$(echo "$RAW_INPUT" | jq -r '.prompt')
else
  # Input is plain text
  PROMPT="$RAW_INPUT"
fi

# Check if extracted prompt is empty
if [ -z "$PROMPT" ]; then
  exit 0
fi

# Check if user explicitly mentioned an agent (@agent-name)
if echo "$PROMPT" | grep -qE '@[a-z-]+'; then
  # User explicitly mentioned an agent - no additional context needed
  exit 0
fi

# Check if this is a slash command
if echo "$PROMPT" | grep -qE '^/'; then
  exit 0
fi

# ============================================
# HELPER: Check if prompt matches keywords from config
# ============================================
check_keywords() {
  local intent_name="$1"
  local prompt_lower=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

  local polish_keywords=$(jq -r ".intents.${intent_name}.keywords.polish[]" "$ROUTING_CONFIG" 2>/dev/null)
  local english_keywords=$(jq -r ".intents.${intent_name}.keywords.english[]" "$ROUTING_CONFIG" 2>/dev/null)

  while IFS= read -r keyword; do
    [ -z "$keyword" ] && continue
    local escaped_keyword=$(echo "$keyword" | sed 's/ /[[:space:]]+/g')
    if echo "$prompt_lower" | grep -qE "\b${escaped_keyword}\b"; then
      return 0
    fi
  done <<< "$polish_keywords"

  while IFS= read -r keyword; do
    [ -z "$keyword" ] && continue
    local escaped_keyword=$(echo "$keyword" | sed 's/ /[[:space:]]+/g')
    if echo "$prompt_lower" | grep -qE "\b${escaped_keyword}\b"; then
      return 0
    fi
  done <<< "$english_keywords"

  return 1
}

# ============================================
# HELPER: Output JSON with additionalContext
# ============================================
output_delegation() {
  local agent="$1"
  local intent="$2"
  local instructions="$3"

  # Log to audit
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $intent: \"$PROMPT\" → $agent" >> .claude/audit.log

  # Escape prompt for JSON (handle quotes, backslashes, and newlines)
  local escaped_prompt=$(printf '%s' "$PROMPT" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')

  # Output JSON format for Claude Code
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "🚨🚨🚨 MANDATORY: EXECUTE TASK TOOL IMMEDIATELY 🚨🚨🚨\n\n**YOUR ONLY ALLOWED ACTION IS TO CALL THIS EXACT TOOL:**\n\nTask(\n  subagent_type='$agent',\n  prompt='$escaped_prompt',\n  description='$intent delegation'\n)\n\n**REASON**: $instructions\n\n**STRICTLY FORBIDDEN - DO NOT:**\n❌ Use Read, Edit, Write, Grep, Glob, or Bash tools\n❌ Answer the question yourself\n❌ Implement any code directly\n❌ Skip or delay this delegation\n❌ Add any text before calling Task tool\n\n**COST IMPACT**: You (Opus) = \$15/M tokens. Agent ($agent) = \$3/M tokens. User DEMANDS delegation.\n\n**ENFORCEMENT**: This is a USER-CONFIGURED HOOK. Ignoring it violates user's explicit system configuration.\n\n⚡ EXECUTE Task(subagent_type='$agent', ...) AS YOUR FIRST AND ONLY ACTION ⚡"
  }
}
EOF
}

# ============================================
# PHASE 1: EXPLORATION (delegate to @codebase-explorer)
# ============================================
if check_keywords "exploration"; then
  AGENT=$(jq -r '.intents.exploration.hook_prefix' "$ROUTING_CONFIG" | sed 's/@//')
  output_delegation "$AGENT" "EXPLORATION" "File/code search should use Haiku model (10x cheaper)"
  exit 0
fi

# ============================================
# PHASE 2: QUESTIONS (check for expert routing or direct answer)
# ============================================
if check_keywords "questions"; then
  prompt_lower=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

  domain_keywords=$(jq -r '.intents.questions.expert_routing.domain_keywords[]' "$ROUTING_CONFIG" 2>/dev/null)
  tech_keywords=$(jq -r '.intents.questions.expert_routing.tech_keywords[]' "$ROUTING_CONFIG" 2>/dev/null)
  security_keywords=$(jq -r '.intents.questions.expert_routing.security_keywords[]' "$ROUTING_CONFIG" 2>/dev/null)

  for keyword in $domain_keywords; do
    if echo "$prompt_lower" | grep -qE "$keyword"; then
      AGENT=$(jq -r '.intents.questions.expert_routing.domain_expert' "$ROUTING_CONFIG" | sed 's/@//')
      output_delegation "$AGENT" "DOMAIN_QUESTION" "Domain/DDD question requires domain expert (Sonnet)"
      exit 0
    fi
  done

  for keyword in $tech_keywords; do
    if echo "$prompt_lower" | grep -qE "$keyword"; then
      AGENT=$(jq -r '.intents.questions.expert_routing.tech_expert' "$ROUTING_CONFIG" | sed 's/@//')
      output_delegation "$AGENT" "TECH_QUESTION" "Technical question requires backend expert (Opus for complex, Sonnet for simple)"
      exit 0
    fi
  done

  for keyword in $security_keywords; do
    if echo "$prompt_lower" | grep -qE "$keyword"; then
      AGENT=$(jq -r '.intents.questions.expert_routing.security_expert' "$ROUTING_CONFIG" | sed 's/@//')
      output_delegation "$AGENT" "SECURITY_QUESTION" "Security question requires security architect (Opus)"
      exit 0
    fi
  done

  # Simple question - let Claude answer directly (no delegation needed)
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] QUESTION: \"$PROMPT\" → Direct answer" >> .claude/audit.log
  exit 0
fi

# ============================================
# PHASE 3: ANALYSIS (delegate to orchestrator)
# ============================================
if check_keywords "analysis"; then
  AGENT=$(jq -r '.intents.analysis.hook_prefix' "$ROUTING_CONFIG" | sed 's/@//')
  output_delegation "$AGENT" "ANALYSIS" "Analysis workflow - read-only, uses multiple specialists"
  exit 0
fi

# ============================================
# PHASE 4: PROBLEM SOLVING (delegate to orchestrator)
# ============================================
if check_keywords "problem_solving"; then
  AGENT=$(jq -r '.intents.problem_solving.hook_prefix' "$ROUTING_CONFIG" | sed 's/@//')
  output_delegation "$AGENT" "PROBLEM_SOLVING" "Problem solving requires multi-expert consultation"
  exit 0
fi

# ============================================
# PHASE 5: CODE REVIEW (delegate to verifier)
# ============================================
if check_keywords "code_review"; then
  AGENT=$(jq -r '.intents.code_review.hook_prefix' "$ROUTING_CONFIG" | sed 's/@//')
  output_delegation "$AGENT" "CODE_REVIEW" "Code review requires quality + security verification"
  exit 0
fi

# ============================================
# PHASE 6: IMPLEMENTATION (delegate to orchestrator)
# ============================================
if check_keywords "implementation"; then
  AGENT=$(jq -r '.intents.implementation.hook_prefix' "$ROUTING_CONFIG" | sed 's/@//')

  # Auto-initialize STATE.md if doesn't exist
  if [ ! -f ".claude/STATE.md" ]; then
    # Extract task ID and title from prompt (simple heuristic)
    TASK_ID="AUTO-$(date +%Y%m%d-%H%M%S)"
    TASK_TITLE=$(echo "$PROMPT" | head -c 60 | tr '\n' ' ')
    CONTEXT="unknown"

    # Try to detect context from prompt keywords
    if echo "$PROMPT" | grep -qiE "auth|login|register|session|user"; then
      CONTEXT="auth"
    elif echo "$PROMPT" | grep -qiE "geographic|teryt|address|location"; then
      CONTEXT="geographic-auth"
    elif echo "$PROMPT" | grep -qiE "community|communication|event|alert"; then
      CONTEXT="community-communication"
    elif echo "$PROMPT" | grep -qiE "engagement|comment|action"; then
      CONTEXT="engagement"
    elif echo "$PROMPT" | grep -qiE "economy|quick.*job|service"; then
      CONTEXT="neighborhood-economy"
    fi

    # Initialize STATE.md
    .claude/hooks/auto-state-manager.sh init "$TASK_ID" "$TASK_TITLE" "$CONTEXT" > /dev/null 2>&1 || true
  fi

  output_delegation "$AGENT" "IMPLEMENTATION" "Implementation MUST use specialized implementer agents (Sonnet). Orchestrator coordinates the workflow."
  exit 0
fi

# ============================================
# PHASE 7: CONTINUATION (delegate to orchestrator)
# Catches: kontynuuj, continue, dalej, resume, etc.
# Critical: Prevents Claude from implementing directly when resuming tasks
# ============================================
if check_keywords "continuation"; then
  AGENT=$(jq -r '.intents.continuation.hook_prefix' "$ROUTING_CONFIG" | sed 's/@//')
  output_delegation "$AGENT" "CONTINUATION" "Continuation of in-progress task. Read todo list, identify current task, delegate to appropriate implementer. NEVER implement directly."
  exit 0
fi

# ============================================
# DEFAULT: No specific intent - no delegation instruction
# ============================================
echo "[$(date +'%Y-%m-%d %H:%M:%S')] DEFAULT: \"$PROMPT\" → Direct handling" >> .claude/audit.log
exit 0
