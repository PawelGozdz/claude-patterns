---
name: sprint
description: |
  Sprint planning: both @tech-lead + @product-owner review backlog, propose scope,
  align technical feasibility with business priority. Interactive, writes sprint plan.
tools: Read, Glob, Grep, Write, Agent
---

# /sprint — Sprint Planning

Interactive sprint planning. Both agents analyze the backlog and propose
a sprint scope that balances technical feasibility with business priority.

**Cost**: ~$0.20–0.30 | **When**: Start of each 1–2 week sprint

## Workflow

### 1. Gather context

Read:
- `project-orchestration/TEAM-STATE.md` (current state)
- All P0/P1 tasks from `project-orchestration/tasks/`
- Recent entries in `project-orchestration/completed-tasks/` (last sprint velocity)

### 2. Ask user for constraints

Before running agents, ask:
> "Sprint planning inputs:
> 1. Sprint duration? (days)
> 2. Hard deadlines or external commitments?
> 3. Must-do tasks (non-negotiable)?
> 4. Capacity constraints (holidays, parallel work)?
>
> (Press Enter to skip any)"

Collect answers.

### 3. Run @tech-lead for technical perspective

Invoke @tech-lead:
> "Propose a sprint backlog for a {N}-day sprint given current task state.
> Available capacity: approximately {N × 6}h (assume 6h productive/day).
>
> Prioritize:
> 1. Tasks that unblock the most other work (critical path)
> 2. Debt items that unblock high-priority features
> 3. P0/P1 tasks that are ready (no blockers)
>
> For each proposed task: include ID, title, effort estimate (hours), why it's in this sprint.
> Flag tasks that look small but have hidden complexity.
> Note: {constraints from user}"

### 4. Run @product-owner for business perspective

Invoke @product-owner:
> "Review the proposed sprint backlog from @tech-lead for a {N}-day sprint.
> Next milestone: {from TEAM-STATE.md}
>
> For the proposed scope:
> 1. Does it move toward {milestone}? What's the gap after this sprint?
> 2. What customer-visible value ships by sprint end?
> 3. What should be cut if we're over capacity?
> 4. What's missing that would deliver business value?
> 5. Which task to validate with a real user this sprint?
>
> Flag: tasks with no validated customer need (assumed value)."

### 5. Synthesize and present

Combine both perspectives:

```
[SPRINT PLAN] {start_date} — {end_date} ({N} days)

PROPOSED SCOPE ({est}h / {capacity}h):

  Must do (critical path):
    TS-XXX: {title} ({N}h) — {why}
    ...

  High value (business impact):
    TS-XXX: {title} ({N}h) — {customer value}
    ...

  If capacity allows:
    TS-XXX: {title} ({N}h)

EXPECTED OUTCOMES:
  {What ships / what's unblocked by sprint end}

RISKS:
  • {risk}: {mitigation}

VALIDATE THIS SPRINT:
  → {specific validation action with real user}

Total: {est}h / {capacity}h | Buffer: {diff}h
```

### 6. Confirm and write plan

Ask: "Adjust scope? (add/remove tasks) Or confirm as-is?"

After confirmation, write sprint plan to:
`project-orchestration/sprints/SPRINT-{YYYY-MM-DD}-{theme}.md`

Update TEAM-STATE.md Sprint Focus section.
