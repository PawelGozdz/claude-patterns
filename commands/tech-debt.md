---
name: tech-debt
description: |
  Technical debt report: aggregate tech_debt fields, trend, prioritize, update TECH-DEBT.md.
  Uses @tech-lead. Run monthly or when debt feels like it's slowing you down.
tools: Read, Glob, Grep, Write, Agent
---

# /tech-debt — Technical Debt Report

Focused debt analysis. Aggregates all `tech_debt` fields from active tasks,
identifies debt without resolution tasks, tracks trend, updates TECH-DEBT.md.

**Cost**: ~$0.05 | **When**: Monthly, or when work feels slow

## Workflow

### 1. Run @tech-lead with debt focus

Invoke @tech-lead:
> "Analyze technical debt across project-orchestration/tasks/ and project-orchestration/TECH-DEBT.md.
>
> 1. List all tasks where tech_debt: major or minor (include task ID and title)
> 2. Calculate debt score: major items × 1.0 + minor × 0.5
>    Thresholds: >5 = 🔴 HIGH, 2-5 = 🟡 MEDIUM, <2 = 🟢 LOW
> 3. Compare to last score in TECH-DEBT.md (trend: growing/stable/shrinking)
> 4. Flag major debt items with NO corresponding resolution task in tasks/
> 5. Identify which debt items are blocking other tasks (via `blocks:` field)
> 6. Quick wins: debt items with low effort that unblock high-value work
> 7. Debt growing silently: new major items vs last TECH-DEBT.md entry
>
> Provide:
> a) Updated debt score table row (for TECH-DEBT.md)
> b) Updated Major Debt and Minor Debt tables
> c) Prioritized resolution order with effort estimates"

### 2. Update TECH-DEBT.md

With @tech-lead output:
- Add new row to Debt Score table (date, counts, score, trend)
- Update Major Debt table
- Update Minor Debt table
- Add note to Notes section

### 3. Output summary

```
[TECH DEBT] {date}

Score: {icon} {level} ({major} major × 1pt + {minor} minor × 0.5pt = {score})
Trend: {growing ↑ / stable → / shrinking ↓}

Top debt (by blocking impact):
  1. {DEBT-ID}: {description} ({effort}h) → blocks {what}
  2. ...

Without resolution task (create these):
  • {description} — assign to @{agent}

Quick win: {ID} — {effort}h, unblocks {what}

→ TECH-DEBT.md updated
```
