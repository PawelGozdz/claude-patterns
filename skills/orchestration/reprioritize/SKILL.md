---
name: reprioritize
description: "Priority advisor: suggest what to promote, demote, or cut from backlog"
origin: LocalHero
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
model: opus
effort: high
disable-model-invocation: true
---

# /reprioritize — Priority Advisor

> ultrathink — reprioritization is genuinely multi-criteria: customer
> value × technical leverage × dependency depth × capacity. Apply
> extended thinking to surface non-obvious trade-offs (e.g., "promoting
> X requires demoting Y because they share the auth subsystem").

Analyze full backlog with dual agent perspective and recommend priority changes.
Interactive — confirms before modifying any task files.

**Cost**: ~$0.15–0.25 (two Sonnet agent calls)
**When**: Priorities feel stale, after scope/deadline change, mid-sprint rebalance

## Steps

1. **Read current state**
   - Read `project-orchestration/TEAM-STATE.md`
   - Run `node /opt/projects/claude-patterns/scripts/tasks-digest.mjs` for a triage-ready
     id/status/priority/age table instead of reading every task file in full (K30,
     TASK-KAIZEN-001) — open a specific task file only when reprioritizing it requires
     detail the digest doesn't carry (dependencies, acceptance criteria, blockers)
   - Read `project-orchestration/KANBAN.md`
   - If `TEAM-STATE.md` doesn't exist, say "No TEAM-STATE.md found. Run `/pulse`
     first to initialize the PM system." and stop — there is nothing to rebalance
     against yet.

2. **Ask user for trigger** (optional)
   - What changed? Scope, deadline, blocker, capacity?
   - Empty = routine priority check

3. **Run @tech-lead**
   - Analyze: unblocking leverage, staleness, debt, dependency chains
   - Output: promote/demote/cut/add with task IDs and reasons

4. **Run @product-owner with strategic consultation**
   - Analyze: customer value, segment gaps, milestone alignment, validation status
   - **Consult @marketing-strategist** for GTM/CRO/audience lens on candidate items
   - **Consult @finance-strategist** for unit economics, pricing, regulatory lens
   - **Consult @legal-strategist** for items touching law/regulation
     (GDPR, contracts, NDA, ToS, IP, employment, compliance, jurisdiction)
   - Output: promote/demote/cut/add with task IDs, reasons, and strategist input

5. **Synthesize**
   - Merge perspectives: tech-lead + product-owner + marketing + finance + legal
   - Mark agreements as strong signal: [tech+biz], [tech+biz+mkt+fin], [all-5], etc.
   - Surface disagreements with all viewpoints — never silently pick one
   - Present structured recommendation table with confidence levels

6. **Confirm and apply**
   - Ask: "Apply these changes? `all` / `skip TS-XXX, TS-YYY` /
     `only TS-XXX, TS-YYY` / `none` (keep as notes only)"
   - For each accepted task: change the `priority:` field and append
     `# Reprioritized {date}: P{old} → P{new} — {reason}`
   - CUT items: move to `project-orchestration/_archive/` with `status: cut`
   - ADD items: create new task files at the suggested priority
   - Regenerate `project-orchestration/KANBAN.md`
   - Close with: "Applied {N} priority changes. KANBAN.md updated.
     → Run `/pm-status` to verify the new state."

## What each agent is looking for

Give these criteria to the agents in steps 3-4 — they are what makes the
four buckets mean the same thing across runs.

| Bucket | @tech-lead looks for | @product-owner looks for |
|---|---|---|
| **PROMOTE** | unblocks many others but sits at P1/P2; debt slowing the critical path; staleness about to turn into a blocker | high customer-visible impact stuck at P2/P3; closes a gap in an underserved segment; needed for the next milestone |
| **DEMOTE** | P0/P1 with no dependents and no deadline; blocked externally with no ETA; nice-to-have that drifted up by momentum | unvalidated business assumption; serves an already well-covered segment; high effort, marginal customer value |
| **CUT** | obsoleted by recent changes; duplicate or value absorbed elsewhere; no path to unblocking within 2 sprints | no segment is asking for it; superseded by a simpler alternative; won't ship before it stops mattering |
| **ADD** | technical gap found during analysis; infrastructure implied by current tasks but untracked | customer-facing gap no task covers; validation task for a high-risk assumption |

For every suggestion the agents must return: task ID, current priority,
recommended priority, one-line reason.

## Output Example

Illustration of the *shape* only — never copy these IDs or reasons into a real report.
Signal tags: `[tech]` technical only, `[biz]` business only, `[tech+biz]` both agree.

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
