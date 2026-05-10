---
name: pulse
description: "Team standup: run @tech-lead + @product-owner (which auto-consults @marketing-strategist + @finance-strategist + @legal-strategist when relevant), update TEAM-STATE.md and KANBAN.md"
origin: LocalHero
allowed-tools: Read, Write, Edit, Glob, Grep, Agent
model: opus
effort: high
disable-model-invocation: true
---

# /pulse — Team Standup

Run a full team sync. Two primary advisory agents analyze the current project
state. `@product-owner` automatically consults up to three specialist
strategists (`@marketing-strategist`, `@finance-strategist`,
`@legal-strategist`) in parallel for relevant lenses on strategic items.
All output flows into the shared brain (`TEAM-STATE.md`).

**Cost**: ~$0.20–0.50 (tech-lead + product-owner; product-owner spawns up to
3 strategists internally based on trigger keywords for ~$0.05–0.15 extra)
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

2. **Run @tech-lead** (technical lens — no strategist consultation)
   - Ask: "Analyze project-orchestration/tasks/ and provide your Technical Pulse update for TEAM-STATE.md. Include: blocked tasks, stale tasks (>14d), debt score, critical path, and one key insight."
   - Collect output

3. **Run @product-owner with strategic consultation**
   - Ask: "Analyze project-orchestration/tasks/ and business docs. Provide your Business Pulse update for TEAM-STATE.md. **For strategic items (roadmap, milestone, pricing, growth, GTM, ICP, segments)**, consult @marketing-strategist and @finance-strategist in parallel. **For items touching law/regulation (GDPR, contracts, NDA, ToS, IP, employment, compliance)**, also consult @legal-strategist. Synthesize their input. Include: milestone gap, unvalidated features, mobile UX risks, segment gaps, marketing lens (from @marketing-strategist), finance lens (from @finance-strategist), legal lens with jurisdiction (from @legal-strategist when triggered), and one synthesized recommendation."
   - Product-owner internally spawns relevant strategists based on trigger keywords — see `agents/universal/product-owner.md` "Strategic Consultation" section
   - Collect output

4. **Update TEAM-STATE.md**
   - Replace "Technical Pulse" section with @tech-lead output
   - Replace "Business Pulse" section with @product-owner output
     (which already includes marketing + finance lenses synthesized in)
   - Add a Team Note for each key insight from agents
   - Update `Last sync` date at the top

5. **Regenerate KANBAN.md**
   - Read all files in `project-orchestration/tasks/`
   - Group by priority (P0/P1/P2/P3) and status
   - Write updated KANBAN.md

5b. **Security gap audit across all active tasks**
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

6. **Output briefing to user**
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
