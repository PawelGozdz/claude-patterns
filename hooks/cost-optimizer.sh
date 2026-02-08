#!/bin/bash
# cost-optimizer.sh - PreToolUse hook for cost optimization suggestions
# Renamed from: enforce-tool-restrictions.sh
# Primary enforcement: disallowedTools in agent/skill frontmatter (physical layer)
# This hook: advisory suggestions only

# CRITICAL: Always read stdin first
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
SUBAGENT=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty' 2>/dev/null)

# Orchestrator delegation is correct pattern
if [[ "$TOOL_NAME" == "Task" ]] && [[ "$SUBAGENT" == "localhero-project-orchestrator" ]]; then
  echo "Delegating to orchestrator" >&2
fi

# Suggest cost optimization for direct tool usage (main session only)
if [[ -z "$SUBAGENT" ]]; then
  case "$TOOL_NAME" in
    Grep|Glob)
      echo "TIP: Consider @codebase-explorer for searches (Haiku - 60x cheaper)" >&2
      ;;
  esac
fi

exit 0
