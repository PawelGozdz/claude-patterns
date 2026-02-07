#!/bin/bash
# enforce-tool-restrictions.sh
# PreToolUse hook - provides helpful suggestions for cost optimization
# NOTE: Primary enforcement via disallowedTools in agent frontmatter (physical layer)

# CRITICAL: Always read stdin first
INPUT=$(cat)

# Extract tool info with error suppression
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
SUBAGENT=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty' 2>/dev/null)

# When Task tool is used to call orchestrator, suggest cost-optimized patterns
if [[ "$TOOL_NAME" == "Task" ]] && [[ "$SUBAGENT" == "localhero-project-orchestrator" ]]; then
  # Orchestrator is being invoked - this is correct delegation pattern
  # disallowedTools in frontmatter prevents orchestrator from using forbidden tools
  echo "✓ Delegating to orchestrator (enforcement via disallowedTools)" >&2
fi

# Suggest cost optimization for direct tool usage (main session, not subagent)
if [[ -z "$SUBAGENT" ]]; then
  case "$TOOL_NAME" in
    Grep|Glob)
      echo "💡 TIP: Consider using @codebase-explorer for searches (Haiku - 60x cheaper)" >&2
      ;;
  esac
fi

exit 0  # Allow (physical enforcement via disallowedTools)
