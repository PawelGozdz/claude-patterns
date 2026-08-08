---
name: pulse
description: "Team standup: run @tech-lead + @product-owner (this skill explicitly asks it to consult @marketing-strategist + @finance-strategist + @legal-strategist when relevant), update TEAM-STATE.md and KANBAN.md"
origin: LocalHero
allowed-tools: Read, Write, Edit, Glob, Grep, Agent
model: opus
effort: high
disable-model-invocation: true
---

# /pulse — Team Standup

Run a full team sync. Two primary advisory agents analyze the current project
state. `@product-owner` does **not** spawn strategists on its own (opt-in since
v3.6) — step 2 below explicitly asks it to consult up to three specialists
(`@marketing-strategist`, `@finance-strategist`, `@legal-strategist`) in
parallel for relevant lenses on strategic items. All output flows into the
shared brain (`TEAM-STATE.md`).

**Cost**: ~$0.40–0.90 (tech-lead on haiku + product-owner on sonnet; the
strategists this skill requests add ~$0.05–0.15)
**When**: Start of each working day, or before planning a sprint

## Pre-loaded context (auto-injected, no subagent calls)

Recent commits (last 7 days):
!`git log --oneline --since="7 days ago" | head -30 2>/dev/null || echo "(no recent git history)"`

Blocked task count:
!`grep -l "^status: blocked" project-orchestration/tasks/*.md 2>/dev/null | wc -l`

Recently modified task files (last 7 days):
!`find project-orchestration/tasks -name "*.md" -newermt "7 days ago" 2>/dev/null | head -15`

This context is preprocessed for you — agents below get it as part of the
shared briefing, so they don't need to re-Glob/grep the same data.

## Steps

1. **Read current state**
   - Read `project-orchestration/TEAM-STATE.md` (shared brain)
   - Note what changed since last pulse (Team Notes section)

2. **Run @tech-lead AND @product-owner in PARALLEL, in the FOREGROUND, in ONE message**
   (two independent Agent tool calls, both with `run_in_background: false` — step 4 needs BOTH
   results before it can do anything, so foreground is correct here, not background).
   - @tech-lead: "Analyze project-orchestration/tasks/ and provide your Technical Pulse update for TEAM-STATE.md. Follow your Collection Protocol (bulk-grep the frontmatter, do not sample files). Open with the `Scanned: N/M` coverage header. Include: blocked tasks, stale tasks (>14d), debt score, critical path, and one key insight. Omit any metric whose source field is missing from this project's task files rather than estimating it."
   - @product-owner: "Analyze project-orchestration/tasks/ and business docs. Provide your Business Pulse update for TEAM-STATE.md. **Complete your Collection Protocol scan FIRST** (bulk-grep the frontmatter, verify which fields actually exist in this project) and open with the `Scanned: N/M` coverage header — the scan takes priority over consultation. **Then, for strategic items (roadmap, milestone, pricing, growth, GTM, ICP, segments)**, consult @marketing-strategist and @finance-strategist in parallel; **for items touching law/regulation (GDPR, contracts, NDA, ToS, IP, employment, compliance)**, also consult @legal-strategist. If turn budget runs short, skip the consultation and say so rather than shortening the scan. Synthesize their input. Include: milestone status (counts and overdue days — **no duration estimates**), unvalidated features, mobile UX risks, segment notes (only if a segment field exists; otherwise state it is not tracked), marketing lens, finance lens, legal lens with jurisdiction (when triggered), and one synthesized recommendation. Write the report in the language of this project's docs." (this prompt is the explicit request that authorizes the spawns — see `agents/universal/product-owner.md` "Strategic Consultation")
   - Both tool results land directly in this turn's tool output — collect them from there.

   **Do NOT** (observed failure mode, 2026-07-04): launch these in the background with a custom
   label/description and then try to fetch results by that label via a task-output lookup — the
   label is a display alias, not a real task ID, so the lookup fails ("No task found with ID: ...").
   If an agent genuinely must run in the background, wait for its actual completion notification
   (which carries the full result inline) instead of polling for it — never spawn extra
   "placeholder"/"wait check"/filler agents while waiting; that burns cost for zero value and this
   skill has no use for them.

3. **Update TEAM-STATE.md**
   - Replace "Technical Pulse" section with @tech-lead output
   - Replace "Business Pulse" section with @product-owner output
     (which already includes marketing + finance lenses synthesized in)
   - Add a Team Note for each key insight from agents
   - Update `Last sync` date at the top

4. **Regenerate KANBAN.md**
   - Read all files in `project-orchestration/tasks/`
   - Group by priority (P0/P1/P2/P3) and status
   - Write updated KANBAN.md

4b. **Security gap audit across all active tasks**
    - For each task in `project-orchestration/tasks/`, read frontmatter
    - Match labels + title against `claude-patterns/templates/canonical-labels.yml`
    - Check `## 🔒 Security Pre-Analysis` section status (missing/empty/placeholder vs filled)
    - Aggregate counts:
      * Total active security-relevant tasks
      * Of those: pre-analyzed vs not pre-analyzed
      * Of in-progress security-relevant tasks: how many would be hook-blocked
    - Add a "🔒 Security posture" entry to Team Notes section in TEAM-STATE.md:
      ```
      🔒 Security posture (auto): 12 security-relevant active tasks |
        pre-analyzed: 7 (58%) | gap: 5 tasks need /threat-model |
        of those, 2 are status: in-progress (hook-blocking unless Pre-Analysis filled)
      ```

5. **Output briefing to user**
   - 10–15 line summary: critical items, key risks, one recommended action
   - Format: concise, actionable, no fluff
   - Include security posture line if gaps detected (>20% gap rate)

## Output Example

```
[PULSE] 2026-04-03

CRITICAL: TS-AUTH-003 blocked (18d) — unblocks 3 tasks on critical path
WARNING: 8 stale tasks | Debt: 🔴 HIGH (3 major)
MOBILE: TS-GEO-013 has 4-screen mobile flow — friction risk

BUSINESS: MVP gap ~6 weeks | B2B segment underserved (12%)
CUT from MVP: TS-GAMIFICATION-001 (no validation)
VALIDATE BEFORE BUILD: TS-KLEPSYDRA-001

→ Today's focus: unblock TS-AUTH-003
→ TEAM-STATE.md and KANBAN.md updated
```
