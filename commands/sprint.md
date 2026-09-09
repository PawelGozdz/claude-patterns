---
name: sprint
description: |
  Sprint planning: both @tech-lead + @product-owner review backlog, propose scope,
  align technical feasibility with business priority. Interactive, writes sprint plan.

  Usage: /sprint
tools: Read, Glob, Grep, Write, Edit, Agent, Skill
---

# /sprint — Sprint Planning

Thin wrapper. The whole procedure lives in `skills/orchestration/sprint/SKILL.md`
— that file is the canon; this one only routes to it.

Run it at the start of a 1–2 week sprint. It asks for your constraints first,
then proposes a scope that both agents have signed off on, and writes the plan
to `project-orchestration/sprints/`.

---

Invoke skill: `sprint` with arguments `$ARGUMENTS`
