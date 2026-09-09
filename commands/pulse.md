---
name: pulse
description: |
  Full team standup: run @tech-lead + @product-owner, update TEAM-STATE.md and KANBAN.md.
  Use at start of each working day or before sprint planning.

  Usage: /pulse
tools: Read, Write, Edit, Glob, Grep, Agent, Bash, Skill
---

# /pulse — Team Standup

Thin wrapper. The whole procedure lives in `skills/orchestration/pulse/SKILL.md`
— that file is the canon; this one only routes to it.

Run it at the start of a working day, or before sprint planning: it is the only
step that refreshes both pulse sections of the shared brain and regenerates
KANBAN.md. For a read without cost, use `/pm-status` instead.

---

Invoke skill: `pulse` with arguments `$ARGUMENTS`
