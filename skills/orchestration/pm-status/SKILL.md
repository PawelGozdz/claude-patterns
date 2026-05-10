---
name: pm-status
description: "Quick PM briefing — reads TEAM-STATE.md only, no agent spawn, instant"
origin: LocalHero
allowed-tools: Read
model: haiku
effort: low
disable-model-invocation: true
---

# /pm-status — Quick Status

Instant project status. Reads `TEAM-STATE.md` only — no agents spawned,
no cost, results in seconds.

**Cost**: ~$0 (read only)
**When**: Any time you want current state without a full pulse

## Steps

1. Read `project-orchestration/TEAM-STATE.md`
2. Display formatted:
   - Last sync date + who ran it
   - Sprint Focus (1 line)
   - Critical Now section (full)
   - Technical Pulse (key numbers only: debt, blocked, stale)
   - Business Pulse (key numbers only: milestone, risks)
   - Last 3 Team Notes

3. If TEAM-STATE.md doesn't exist: suggest running `/pulse` first

## Output Example

```
[PM STATUS] Last pulse: 2026-04-03 by @tech-lead

Sprint: Trust verification + load test stability

🔴 CRITICAL:
  • TS-AUTH-003 BLOCKED — email migration, blocks 3 others
  • TS-GEO-013 OVERDUE (18d) — no owner, mobile HIGH

Tech: Debt 🔴 | Blocked: 5 | Stale: 8
Business: MVP ~6w | Unvalidated: 2 | Mobile risks: 3

Last notes:
  [04-03] @tech-lead: BullMQ cleanup unblocks perf cluster
  [04-02] @product-owner: geo-auth mobile flow needs redesign
  [04-01] @tech-lead: FK order fixed — TS-TEST-LOAD-003 closeable

→ Run /pulse for full analysis
```
