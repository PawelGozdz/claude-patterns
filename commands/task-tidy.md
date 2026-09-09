---
name: task-tidy
description: |
  Automated task housekeeping: move done tasks, fix missing fields, validate YAML,
  standardize format. Non-destructive — previews changes before applying.

  Usage: /task-tidy
tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill
---

# /task-tidy — Task Housekeeping

Thin wrapper. The whole procedure lives in `skills/orchestration/task-tidy/SKILL.md`
— that file is the canon; this one only routes to it.

Run it weekly, after a sprint, or right before `/pulse` — it is what keeps
`project-orchestration/` in the shape the other PM commands assume. Nothing moves
or changes until you approve the preview, and no file is ever deleted.

---

Invoke skill: `task-tidy` with arguments `$ARGUMENTS`
