---
name: tech-debt
description: |
  Technical debt report: aggregate tech_debt fields, trend, prioritize, update TECH-DEBT.md.
  Uses @tech-lead. Run monthly or when debt feels like it's slowing you down.

  Usage: /tech-debt
tools: Read, Glob, Grep, Write, Edit, Agent, Skill
---

# /tech-debt — Technical Debt Report

Thin wrapper. The whole procedure lives in `skills/orchestration/tech-debt/SKILL.md`
— that file is the canon; this one only routes to it.

Run it monthly, or the moment routine work starts feeling slower than it should.
It scores the debt, shows whether the score is moving the wrong way, and names
the items that have no resolution task behind them.

---

Invoke skill: `tech-debt` with arguments `$ARGUMENTS`
