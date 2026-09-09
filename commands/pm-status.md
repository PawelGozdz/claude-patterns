---
name: pm-status
description: |
  Quick PM briefing — reads TEAM-STATE.md only, no agents spawned, instant (~$0).
  Shows: critical items, last pulse date, tech + business pulse summary.

  Usage: /pm-status
tools: Read, Skill
model: haiku
---

# /pm-status — Quick Status

Thin wrapper. The whole procedure lives in `skills/orchestration/pm-status/SKILL.md`
— that file is the canon; this one only routes to it.

Use it any time you want the current state without paying for a full `/pulse`:
morning check, before picking up a task, mid-session sanity check.

---

Invoke skill: `pm-status` with arguments `$ARGUMENTS`
