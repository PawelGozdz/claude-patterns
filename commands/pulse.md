---
name: pulse
description: |
  Full team standup: run @tech-lead + @product-owner, update TEAM-STATE.md and KANBAN.md.
  Use at start of each working day or before sprint planning.
tools: Read, Write, Edit, Glob, Grep, Agent
---

# /pulse — Team Standup

Full project sync. Runs both advisory agents and updates the shared brain.

**Cost**: ~$0.10–0.20 | **When**: Daily, or before planning

## Workflow

### 1. Read current state
Read `project-orchestration/TEAM-STATE.md`. Note last sync date and Team Notes.
If file doesn't exist, create it from the template in `claude-patterns/templates/project-orchestration/TEAM-STATE.md`.

### 2. Run @tech-lead

Invoke @tech-lead agent with:
> "Analyze project-orchestration/tasks/ — all YAML files. Report:
> 1. Blocked tasks (status: blocked) with cause
> 2. Overdue tasks (due_date in the past) with days overdue
> 3. Stale tasks (updated_date >14 days ago)
> 4. Tech debt score (count tech_debt: major/minor fields)
> 5. Critical path: which tasks, when unblocked, unblock the most others
> 6. Mobile impact (mobile_impact: high) tasks not yet done
> Provide the Technical Pulse block for TEAM-STATE.md."

Collect Technical Pulse output.

### 3. Run @product-owner

Invoke @product-owner agent with:
> "Analyze project-orchestration/tasks/ and any business docs (LOCALHERO_PRODUCT.md,
> LOCALHERO_BUSINESS.md, or equivalent). Report:
> 1. Next milestone and estimated gap (weeks remaining)
> 2. Tasks without validated business need (flag 'assumed' value)
> 3. Mobile UX risks (mobile_impact: high tasks with no UX companion)
> 4. Customer segment coverage (which segments are underserved)
> 5. One task to cut from MVP if capacity is tight
> 6. One task to validate with a real user this week
> Provide the Business Pulse block for TEAM-STATE.md."

Collect Business Pulse output.

### 4. Update TEAM-STATE.md

Replace sections in TEAM-STATE.md:
- Update `Last sync` timestamp at top
- Replace `## ⚙️ Technical Pulse` with @tech-lead output
- Replace `## 💼 Business Pulse` with @product-owner output
- Update `## 🔴 Critical Now` with top 3 items from @tech-lead
- Add new Team Notes (one line per key insight, newest first)

### 5. Regenerate KANBAN.md

Read all `.md` files in `project-orchestration/tasks/`. Group by priority (P0/P1/P2/P3).
Write a table per priority group: `ID | Title | Status | Assignee | Age`.
Age = days since `updated_date`.

### 6. Output briefing

Print 10–15 line summary:
```
[PULSE] {date}

CRITICAL: {top blocked/overdue item}
TECH: Debt {level} | Blocked: N | Stale: N
BUSINESS: {milestone} ~{weeks}w | Unvalidated: N | Mobile risks: N

→ Today's focus: {one recommended action}
→ TEAM-STATE.md and KANBAN.md updated
```
