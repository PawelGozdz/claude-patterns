---
name: tech-debt
description: "Technical debt report: aggregate, trend, prioritize, link to resolution tasks"
origin: LocalHero
allowed-tools: Read, Glob, Grep, Write, Edit, Agent
model: opus
effort: high
disable-model-invocation: true
---

# /tech-debt — Technical Debt Report

> ultrathink — tech debt prioritization balances current velocity drag,
> compounding risk, dependency unlock value, and effort. Apply extended
> thinking to identify which item, if resolved first, unblocks the most
> downstream work — often counter-intuitive (high-effort items with high
> leverage beat low-effort items with no dependencies).

Focused debt analysis. Aggregates `tech_debt` fields across all tasks,
checks for debt without resolution tasks, shows trend, and updates TECH-DEBT.md.

**Cost**: ~$0.05 (one @tech-lead call)
**When**: Monthly, or when debt feels like it's slowing you down

## Pre-loaded context (auto-injected, no subagent calls)

Tasks with tech_debt: major:
!`grep -l "^tech_debt:\s*major" project-orchestration/tasks/*.md 2>/dev/null | head -20`

Tasks with tech_debt: minor:
!`grep -l "^tech_debt:\s*minor" project-orchestration/tasks/*.md 2>/dev/null | wc -l`

TECH-DEBT.md size + last update:
!`wc -l project-orchestration/TECH-DEBT.md 2>/dev/null && stat -c '%y' project-orchestration/TECH-DEBT.md 2>/dev/null || echo "(TECH-DEBT.md missing)"`

Recent debt-tagged commits (last 30 days):
!`git log --oneline --since="30 days ago" --grep="debt\|refactor" 2>/dev/null | head -15`

@tech-lead agent below receives this preprocessed view.

## Steps

1. Run @tech-lead with focused prompt:
   "Analyze technical debt across project-orchestration/tasks/ and
   project-orchestration/TECH-DEBT.md. Report:
   1. All tasks where tech_debt: major or minor (task ID and title)
   2. Debt score: major items x 1.0 + minor items x 0.5.
      Thresholds: >5 = HIGH, 2-5 = MEDIUM, <2 = LOW
   3. Debt trend vs the last score recorded in TECH-DEBT.md
      (growing / stable / shrinking)
   4. Major debt items without a corresponding resolution task
   5. Which debt items are blocking other tasks (via the `blocks:` field)
   6. Quick wins (low effort debt that unblocks high-value work)
   7. Debt that's growing silently (new major items vs last month)
   Provide: (a) the new Debt Score table row, (b) updated Major Debt and
   Minor Debt tables, (c) prioritized resolution order with effort estimates."

2. Update `project-orchestration/TECH-DEBT.md`:
   - append a row to the Debt Score table (date, counts, score, trend)
   - replace the Major Debt table
   - replace the Minor Debt table
   - add one line to the Notes section

3. Display summary with recommended next action

## Output Example

Illustration of the *shape* only — never copy these IDs, hours or scores into a real report.

```
[TECH DEBT REPORT] 2026-04-03

SCORE: 🔴 HIGH (3 major × 1pt + 7 minor × 0.5pt = 6.5)
TREND: Growing ↑ (was 4.0 in March)

MAJOR DEBT (address this sprint):
  1. TS-INFRA-003: BullMQ console.logs + dead config (6h) → blocks TS-PERF-001
  2. TS-SEC-DB-001: Missing DB indexes on user lookups (4h) → blocks TS-PERF-002
  3. [no resolution task]: Auth context test fragility — 40% flaky rate

MINOR DEBT:
  • 5 tasks with console.log in production code
  • 2 deprecated AtomicCreators still in use (should be HybridFixture)

DEBT WITHOUT RESOLUTION TASK:
  ⚠️ Auth test fragility has no TS-XXX assigned — create one now?

QUICK WINS (fix today, unblock tomorrow):
  → TS-INFRA-003: 6h effort, unblocks 3 perf tasks

→ TECH-DEBT.md updated
```
