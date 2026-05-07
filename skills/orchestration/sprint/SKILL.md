---
name: sprint
description: "Sprint planning: @tech-lead + @product-owner (which auto-consults @marketing-strategist + @finance-strategist for strategic items) propose sprint scope"
origin: LocalHero
allowed-tools: Read, Glob, Grep, Write, Agent
effort: high
---

# /sprint — Sprint Planning

Interactive sprint planning session with two primary advisory agents.
Combines technical capacity (what's feasible) with business priority
(what's most valuable). `@product-owner` automatically consults
`@marketing-strategist` and `@finance-strategist` in parallel for marketing
+ finance lenses on each candidate item — so the sprint scope reflects
GTM, CRO, unit-economics, and regulatory exposure considerations,
not just feature delivery.

**Cost**: ~$0.30–0.50 (tech-lead + product-owner + 2 strategist sub-calls + iteration)
**When**: Start of each 1-2 week sprint

## Steps

1. **Read context**
   - `project-orchestration/TEAM-STATE.md`
   - All P0/P1 tasks from `project-orchestration/tasks/`
   - Last sprint's `completed-tasks/` entries (if any)

2. **Ask user for constraints**:
   - "How many days is this sprint? Any hard deadlines or external commitments?"
   - "Any tasks that are absolutely must-do this sprint?"
   - "Any known capacity constraints (holidays, other work)?"

3. **Run @tech-lead**:
   "Given {sprint_days} days and current task state, propose a sprint backlog.
   Consider: blocked tasks that could be unblocked, debt items that unblock
   other work, critical path items. Estimate effort in hours, not SP.
   Flag: tasks that look small but have hidden complexity."

4. **Run @product-owner** with strategic consultation:
   "Review the proposed sprint backlog from @tech-lead. From business
   perspective: does the sprint move us toward {next_milestone}?
   What's missing that would deliver customer value? What could be cut?
   Flag: tasks with no validated customer need.
   **Consult @marketing-strategist** for GTM/CRO/audience lens on each
   high-priority item.
   **Consult @finance-strategist** for unit economics, pricing,
   regulatory exposure lens on each high-priority item.
   Synthesize all three lenses (business + marketing + finance) in your
   recommendation. Flag any items where the three lenses disagree."

5. **Synthesize and present**:
   - Proposed sprint scope (task list with effort estimates)
   - Expected outcomes (what ships by sprint end)
   - Risks and dependencies to watch
   - One thing to validate with a real user this sprint

6. **Confirm with user**: adjust scope, then write sprint plan to
   `project-orchestration/sprints/SPRINT-{name}-{date}.md`

## Output Example

```
[SPRINT PLANNING] 2026-04-03 — 10 days

PROPOSED SCOPE (est. 48h capacity):
  Must do (critical path):
    TS-AUTH-003: Unblock email change flow (16h) — blocks 3 others
    TS-DB-MIGRATION-001: Email encryption IV (4h) — dep for AUTH-003

  High value (B2C impact):
    TS-GEO-013: Fix geo-auth mobile flow (12h) — mobile_impact: HIGH
    TS-INFRA-003: BullMQ cleanup (6h) — quick win, unblocks perf

  If capacity allows:
    TS-TEST-LOAD-003: Load test stability (8h)

EXPECTED OUTCOME:
  Email change feature unblocked + mobile geo-auth improved
  → 2 user-visible improvements + 1 debt item resolved

RISKS:
  • TS-DB-MIGRATION-001 might reveal schema issues (+4h buffer)
  • TS-GEO-013 mobile redesign needs UX decision before start

VALIDATE THIS SPRINT:
  → Show geo-auth mobile flow to 1 real user — is 4 screens acceptable?

Total: 46h / 48h capacity | Buffer: 2h
```
