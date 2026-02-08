#!/bin/bash
# Post-Agent-Update Hook
#
# Trigger: After YAML modification in .claude/agents/registry/
# Action: Auto-recompile affected agents from YAML to MD
#
# Usage: Called automatically by file watcher or manually after YAML edits
#
# @module Hooks
# @since TS-KNOWLEDGE-001 Phase 5

# Check if the modified file is an agent registry YAML
if [[ $1 =~ \.claude/agents/registry/.*\.yml$ ]]; then
  echo "🔄 Agent YAML modified, recompiling..."

  # Run the compilation script
  /home/node/projects/local-hero-4/.claude/commands/hero-compile-agents.sh

  # Stage the generated MD files for commit
  git add .claude/agents/implementers/
  git add .claude/agents/verifiers/
  git add .claude/agents/*.md  # For specialists and utilities

  echo "✅ Agents recompiled and staged for commit"
else
  echo "ℹ️  Non-YAML file modified, skipping agent compilation"
fi
