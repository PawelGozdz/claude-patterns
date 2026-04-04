---
name: reprioritize
description: |
  Priority advisor: analyze backlog, suggest what to promote, demote, or cut.
  Runs @tech-lead + @product-owner for dual perspective. Interactive — confirms before changes.
tools: Read, Edit, Glob, Grep, Agent
---

# /reprioritize — Priority Advisor

Analyze the full backlog and recommend priority changes: what to promote,
demote, cut, or add. Dual perspective from both advisory agents.

**Cost**: ~$0.15–0.25 | **When**: When priorities feel off, after scope change, or mid-sprint

## Workflow

### 1. Gather current state

Read:
- `project-orchestration/TEAM-STATE.md` (shared brain)
- All task files from `project-orchestration/tasks/`
- `project-orchestration/KANBAN.md` (current board)

If TEAM-STATE.md doesn't exist:
> "No TEAM-STATE.md found. Run `/pulse` first to initialize the PM system."
> Stop here.

### 2. Ask user for context (optional)

> "What triggered this reprioritization? (skip if just a routine check)
> Examples: scope change, deadline moved, new blocker, capacity shift, stakeholder request"

Collect answer (empty = routine check).

### 3. Run @tech-lead for technical priority assessment

Invoke @tech-lead:
> "Review all tasks in project-orchestration/tasks/. For priority recommendations:
>
> PROMOTE (should be higher priority):
> - Tasks that unblock many others but are P1/P2
> - Debt items that slow down critical path work
> - Tasks with growing staleness that risk becoming blockers
>
> DEMOTE (should be lower priority):
> - P0/P1 tasks with no dependents and no deadline
> - Tasks blocked by external factors with no ETA
> - Nice-to-haves that got tagged P1 by momentum
>
> CUT (remove from backlog):
> - Tasks obsoleted by recent changes
> - Duplicates or tasks whose value was absorbed by other work
> - Tasks with no path to unblocking in the next 2 sprints
>
> ADD (missing from backlog):
> - Technical gaps discovered during analysis
> - Infrastructure needs implied by current tasks but not tracked
>
> {user context if provided}
>
> For each suggestion: task ID, current priority, recommended priority, one-line reason."

Collect tech-lead output.

### 4. Run @product-owner for business priority assessment

Invoke @product-owner:
> "Review all tasks in project-orchestration/tasks/. For priority recommendations:
>
> PROMOTE (should be higher priority):
> - Tasks with high customer-visible impact stuck at P2/P3
> - Tasks that close gaps in underserved customer segments
> - Tasks needed for upcoming milestone or deadline
>
> DEMOTE (should be lower priority):
> - P0/P1 tasks with unvalidated business assumptions
> - Features that serve already well-covered segments
> - Tasks with high effort but marginal customer value
>
> CUT (remove from backlog):
> - Features that no customer segment is asking for
> - Tasks superseded by a simpler alternative
> - Scope that won't ship before it becomes irrelevant
>
> ADD (missing from backlog):
> - Customer-facing gaps not covered by existing tasks
> - Validation tasks for high-risk assumptions
>
> {user context if provided}
>
> For each suggestion: task ID, current priority, recommended priority, one-line reason."

Collect product-owner output.

### 5. Synthesize and present recommendations

Merge both perspectives. When agents agree, mark as **strong signal**.
When they disagree, present both views.

Output format:

```
[REPRIORITIZE] {date}

⬆️  PROMOTE:
  TS-XXX: P2 → P1 — {reason} [tech+biz]
  TS-XXX: P1 → P0 — {reason} [tech]
  TS-XXX: P2 → P1 — {reason} [biz]

⬇️  DEMOTE:
  TS-XXX: P0 → P1 — {reason} [tech+biz]
  TS-XXX: P1 → P2 — {reason} [tech]

✂️  CUT:
  TS-XXX: {reason} [tech+biz]

➕ ADD:
  {title} (suggested P{N}) — {reason} [source]

⚖️  DISAGREEMENTS:
  TS-XXX: @tech-lead says promote (unblocks 3), @product-owner says demote (unvalidated)
  → Recommendation: {your synthesis}

Signal: [tech] = technical only, [biz] = business only, [tech+biz] = both agree
```

### 6. Confirm and apply

Ask:
> "Apply these changes? You can:
> - `all` — apply everything
> - `skip TS-XXX, TS-YYY` — apply all except listed
> - `only TS-XXX, TS-YYY` — apply only listed
> - `none` — just keep as notes"

On confirmation, update task files:
- Change `priority:` field in each accepted task
- Add a comment line: `# Reprioritized {date}: P{old} → P{new} — {reason}`
- For CUT items: move to `project-orchestration/_archive/` with `status: cut`
- For ADD items: create new task files with suggested priority

After applying, regenerate `project-orchestration/KANBAN.md`.

Output:
```
✅ Applied {N} priority changes. KANBAN.md updated.
→ Run /pm-status to verify new state.
```
