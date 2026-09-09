---
name: reprioritize
description: |
  Priority advisor: analyze backlog, suggest what to promote, demote, or cut.
  Runs @tech-lead + @product-owner for dual perspective (the skill also asks
  @product-owner to consult the marketing/finance/legal strategists where relevant).
  Interactive — confirms before changes.

  Usage: /reprioritize
tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill
---

# /reprioritize — Priority Advisor

Thin wrapper. The whole procedure lives in `skills/orchestration/reprioritize/SKILL.md`
— that file is the canon; this one only routes to it.

Reach for it when the board stops matching reality: after a scope or deadline
change, when a new blocker lands, or mid-sprint when the top of the list no
longer looks like the most useful work. Nothing is written until you confirm.

---

Invoke skill: `reprioritize` with arguments `$ARGUMENTS`
