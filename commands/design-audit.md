---
name: design-audit
description: |
  Audit design-system consistency across connected juz-ide repos: dispatches
  pattern-auditor + token-drift per repo, synthesizes a severity-graded report,
  and decides when a mechanical migration PR is safe to prepare.

  Examples:
    /design-audit
    /design-audit marketing-hub grant-flow

  Usage: /design-audit [repo…]
argument-hint: "[repo…]"
tools: Read, Glob, Grep, Bash, Agent, Skill
disallowedTools: Write, Edit, NotebookEdit, WebSearch
---

# /design-audit — design-system consistency audit

Thin wrapper over the `design-audit` skill from `skills/design-system/design-audit/`
(`disable-model-invocation: true`, so `setup-project.sh` does not link it into
`.claude/skills/` — this command is its public entry point).

Arguments: `$ARGUMENTS`

1. Check that `.claude/config/runtime.yml` lists `design-system` in `stack_blocks`.
   If not, stop and explain how to enable the block.
2. Read `skills/design-system/design-audit/SKILL.md` from claude-patterns (resolve the
   repo path via `readlink -f .claude/skills/design-tokens`, three levels up) and follow
   it with the arguments above.
