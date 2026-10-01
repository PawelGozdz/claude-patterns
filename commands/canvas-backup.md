---
name: canvas-backup
description: |
  Back up a Claude Design canvas: source files (project/canvas.json + .dc.html
  artboards) to design-archive/<date>/, plus a rendered PNG per artboard at its own
  frame size.

  Examples:
    /canvas-backup https://claude.ai/artifact/XXXXXXXXXXXXXXXXXXXXXXXX

  Usage: /canvas-backup <url-canvasu>
argument-hint: "<url-canvasu>"
tools: Read, Write, Bash, Glob, Agent, Skill, Artifact
disallowedTools: Edit, NotebookEdit, WebSearch
---

# /canvas-backup — back up a Claude Design canvas

Thin wrapper over the `canvas-backup` skill from `skills/design-system/canvas-backup/`
(`disable-model-invocation: true` — this command is its public entry point).

Arguments: `$ARGUMENTS` — the canvas URL. Missing → check the app's
CLAUDE.md/CLAUDE-LOCAL.md for a `design_canvas_*` link before asking the user.

1. Check that `.claude/config/runtime.yml` lists `design-system` in `stack_blocks`.
   If not, stop and explain how to enable the block.
2. Read `skills/design-system/canvas-backup/SKILL.md` from claude-patterns (resolve the
   repo path via `readlink -f .claude/skills/design-tokens`, three levels up) and follow
   it with the arguments above.
