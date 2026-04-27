---
name: task-health
description: "Deep task audit: blocked, stale, missing deps, format issues, orphaned tasks"
origin: LocalHero
allowed-tools: Read, Glob, Grep, Agent
effort: medium
---

# /task-health — Task Audit

Deep audit of the entire task graph. Identifies structural issues that
accumulate silently over weeks of development.

**Cost**: ~$0.02 (1 Haiku extraction + 1 Sonnet analysis — was $0.05 with Sonnet-only)
**When**: Weekly, or before sprint planning

---

## Architecture (cost-optimized — 2 phases)

**Phase 1: extraction (Haiku)** — `state-reader` agent reads all `project-orchestration/tasks/*.md`, extracts YAML frontmatter + signals into structured data. Pure mechanical, no judgment.

**Phase 2: analysis (Sonnet)** — `tech-lead` agent receives structured data from Phase 1 and produces the prioritized audit report.

This split saves ~60% tokens vs. running tech-lead over raw task files (no need for Sonnet to parse 70 markdown files when Haiku can extract them at 12× the rate).

---

## Steps

### Phase 1 — Extract structured task data

```
Agent(subagent_type='state-reader',
      prompt='Read all project-orchestration/tasks/*.md and return structured
              data per task: { id, title, status, priority, story_id,
              assignee, due_date, depends_on[], updated_date, days_since_update,
              has_required_fields_complete, in_progress_days_if_applicable }.
              Also return aggregate: { total_tasks, by_status, by_priority }.
              Format: YAML.',
      description='Task data extraction (Haiku)')
```

### Phase 2 — Audit analysis

```
Agent(subagent_type='tech-lead',
      prompt='Audit task health using this structured data:
              {PHASE_1_OUTPUT}

              Also resolve completed tasks list:
              {GLOB: project-orchestration/completed-tasks/*.md → IDs only}

              Report:
              1. Broken dependencies — task depends on ID not present in tasks/
                 or completed-tasks/
              2. Stuck in-progress >7 days
              3. Status=blocked without explanation in description
              4. Missing required fields (priority, updated_date, assignee)
              5. Orphaned (no story_id)
              6. Circular dependency chains
              7. P0/P1 with no due_date

              Prioritize fixes: critical (broken deps) → high (stuck) → cleanup.',
      description='Task health analysis (Sonnet)')
```

### Phase 3 — Render

Display audit results with fix recommendations.

Ask user: "Fix issues automatically where safe (missing fields)? Y/N"

---

## Output Example

```
[TASK HEALTH AUDIT] 2026-04-03 — 74 tasks scanned

BROKEN DEPENDENCIES (fix immediately):
  • TS-PERF-003 depends on TS-INFRA-002 — but TS-INFRA-002 not in tasks/
  • TS-SEC-003 depends on TS-AUTH-001 — TS-AUTH-001 is completed, update dep

STUCK IN-PROGRESS (>7d):
  • TS-TEST-LOAD-002 (in-progress for 22d) — no recent commits
  • TS-GEO-015 (in-progress for 9d) — check assignee

MISSING REQUIRED FIELDS:
  • 12 tasks missing updated_date
  • 5 tasks missing assignee
  • 3 P0 tasks missing due_date

ORPHANED (no story_id):
  • TS-B2G-COMPLIANCE-001 — no US-XXX reference
  • TS-ANNOUNCE-001 — no US-XXX reference

CIRCULAR DEPS: None found ✅

→ 4 critical fixes needed | 17 field updates recommended

(extraction: state-reader/Haiku, analysis: tech-lead/Sonnet)
```
