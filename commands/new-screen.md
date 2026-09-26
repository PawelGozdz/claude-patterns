---
name: new-screen
description: |
  Build a new UI screen following the juz-ide design system: picks the pattern from
  ui-patterns, assembles it from existing components and tokens, takes the
  light/dark × desktop/mobile screenshots and has ui-reviewer assess them.
  Works only in projects with the `design-system` block (ADR 0010).

  Examples:
    /new-screen konta lista
    /new-screen konto-edycja formularz

  Usage: /new-screen <name> <lista|formularz|szczegóły|inny>
argument-hint: "<name> <lista|formularz|szczegóły|inny>"
tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill
disallowedTools: NotebookEdit, WebSearch
---

# /new-screen — new screen from a pattern

Thin wrapper over the `new-screen` skill from `skills/design-system/new-screen/`
(`disable-model-invocation: true`, so `setup-project.sh` does not link it into
`.claude/skills/` — this command is its public entry point).

Arguments: `$ARGUMENTS`

1. Check that `.claude/config/runtime.yml` lists `design-system` in `stack_blocks`.
   If not, stop and explain how to enable the block — the procedure depends on the
   `design-tokens`, `ui-patterns`, `screen-build` and `visual-check` skills the block links.
2. Read `skills/design-system/new-screen/SKILL.md` from claude-patterns (resolve the
   repo path via `readlink -f .claude/skills/ui-patterns`, three levels up) and follow it
   with the arguments above.
