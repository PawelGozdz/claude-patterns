---
name: reprioritize
description: "Priority advisor: suggest what to promote, demote, or cut from backlog"
origin: LocalHero
allowed-tools: Read, Edit, Glob, Grep, Agent
effort: medium
---

# /reprioritize — Priority Advisor

Analyze full backlog with dual agent perspective and recommend priority changes.
Interactive — confirms before modifying any task files.

**Cost**: ~$0.15–0.25 (two Sonnet agent calls)
**When**: Priorities feel stale, after scope/deadline change, mid-sprint rebalance

## Steps

1. **Read current state**
   - Read `project-orchestration/TEAM-STATE.md`
   - Read all task files in `project-orchestration/tasks/`
   - Read `project-orchestration/KANBAN.md`

2. **Ask user for trigger** (optional)
   - What changed? Scope, deadline, blocker, capacity?
   - Empty = routine priority check

3. **Run @tech-lead**
   - Analyze: unblocking leverage, staleness, debt, dependency chains
   - Output: promote/demote/cut/add with task IDs and reasons

4. **Run @product-owner**
   - Analyze: customer value, segment gaps, milestone alignment, validation status
   - Output: promote/demote/cut/add with task IDs and reasons

5. **Synthesize**
   - Merge both perspectives
   - Mark agreements as strong signal [tech+biz]
   - Surface disagreements with both viewpoints
   - Present structured recommendation table

6. **Confirm and apply**
   - User picks: all, skip X, only X, or none
   - Update priority fields in task YAML
   - Archive CUT items, create ADD items
   - Regenerate KANBAN.md

## Output Example

```
[REPRIORITIZE] 2026-04-04

⬆️  PROMOTE:
  TS-AUTH-003: P1 → P0 — blocks 3 critical-path tasks [tech+biz]
  TS-MOBILE-007: P2 → P1 — mobile launch in 4 weeks [biz]

⬇️  DEMOTE:
  TS-GAMIFICATION-001: P1 → P3 — no validated need, 0 dependents [tech+biz]

✂️  CUT:
  TS-LEGACY-012: superseded by TS-AUTH-003 refactor [tech]

➕ ADD:
  "Mobile offline sync" (P1) — implied by 3 mobile tasks [biz]

Apply? [all / skip TS-XXX / only TS-XXX / none]
```
