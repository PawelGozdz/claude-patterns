---
name: token-bump
description: |
  Change a design token in the design-system repo: edit tokens/*.json, rebuild every
  output (CSS/Tailwind/antd/Dart), validate, preview, prepare a PR with screenshots,
  and pick the semver bump from the patch/minor/major decision table.

  Examples:
    /token-bump patch
    /token-bump major

  Usage: /token-bump <patch|minor|major>
argument-hint: "<patch|minor|major>"
tools: Read, Write, Edit, Bash, Glob, Grep, Agent, Skill
disallowedTools: NotebookEdit, WebSearch
---

# /token-bump — change a design token

Thin wrapper over the `token-change` skill from `skills/design-system/token-change/`
(`disable-model-invocation: true` — this command is its public entry point).

Arguments: `$ARGUMENTS` — the declared semver degree (`patch`/`minor`/`major`). The skill
re-verifies it against the decision table before acting; a wrong declaration gets
corrected and explained, not silently followed.

1. Confirm the working directory is the `design-system` repo (`tokens/*.json` exists).
   Wrong repo → stop and say so.
2. Read `skills/design-system/token-change/SKILL.md` from claude-patterns (resolve the
   repo path via `readlink -f .claude/skills/design-tokens`, three levels up — if this
   repo doesn't consume the block that way, ask the user for the `claude-patterns` path)
   and follow it with the arguments above.
