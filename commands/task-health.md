---
name: task-health
description: |
  Deep task audit: broken dependencies, stuck in-progress, missing fields, orphaned tasks.
  Uses @state-reader (extraction) + @tech-lead (analysis). Run weekly or before sprint planning.

  Usage: /task-health
tools: Read, Edit, Glob, Grep, Bash, Agent, Skill
---

# /task-health — Task Audit

Thin wrapper. The whole procedure lives in `skills/orchestration/task-health/SKILL.md`
— that file is the canon; this one only routes to it.

Run it weekly, or right before sprint planning: it finds the structural rot that
builds up silently — dependencies pointing at task IDs that no longer exist, work
stuck in-progress for weeks, tasks with no story behind them.

---

Invoke skill: `task-health` with arguments `$ARGUMENTS`
