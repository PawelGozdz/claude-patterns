# Roadmap: claude-patterns improvements

Implementation plan for the architecture documented in
[`docs/ARCHITECTURE.md`](ARCHITECTURE.md) and decided in
[`docs/adr/0001-extension-architecture.md`](adr/0001-extension-architecture.md).

**Status legend**: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` cancelled

---

## Sprint 1 — Foundation

> **Reality check (2026-05-10):** Research showed Sprint 1.1 and 1.4 are
> ~75% already implemented in current `setup-project.sh` / `setup-global.sh` /
> `migrate-v2.sh`. The actual gap is **1.3** (`_stack-defaults` + orchestrator
> update) — that's what unblocks declarative "always-include patterns per
> stack" and security integration.

- [x] **1.1 Selective per-project symlinks in `setup-project.sh`** (already done)
  - Universal agents → globally via `setup-global.sh`
  - Stack agents → per-project `.claude/agents/` via `setup-project.sh`
  - Patterns → per-project selective (per stack_profile in project.yml)
  - Skills → per-project (per skills list in project.yml)
  - Stale symlink cleanup when stack changes
  - **Outstanding (optional, low priority):** per-project `.claude/commands/` and
    `.claude/output-styles/` are not auto-symlinked but Claude Code reads them
    natively — projects can opt-in by placing files

- [-] **1.2 Stack-presets as declarative YAML** (deferred — refactor only)
  - Logic exists today but hard-coded as bash `case` in `setup-project.sh`
  - Refactor to `templates/stack-presets/<stack>.yml` would clean it up
  - **Defer until adding a 7th stack profile** — current 6 work fine in bash

- [ ] **1.3 Create `patterns/_stack-defaults/<stack>.yml` + orchestrator integration** ← **PRIORITY**
  - Schema: `always_include: [list of pattern paths relative to claude-patterns/patterns/]`
  - One YAML per stack (start with nestjs-ddd, others get stub)
  - Update `/orchestrate` Phase 0.5 to read stack-defaults YAML and merge into `{PATTERNS}` list
  - Unblocks security integration (Sprint 4) and declarative per-stack defaults
  - Investment: ~2h

- [x] **1.4 Migration helper script** (already done as `migrate-v2.sh` + `migrate-all.sh`)
  - 238-line `migrate-v2.sh` handles `.claude/rules/`, `.mcp.json`, `.worktreeinclude`, CLAUDE.md regen
  - `migrate-all.sh` for batch
  - **Outstanding:** verify idempotency with newest layout, document modes in README — defer to follow-up

---

## Backward compatibility

Existing projects keep working without re-configuration. The architecture is
designed so that:

- Old global symlinks in `~/.claude/agents/` remain functional after Sprint 1
- New hooks (Sprint 2.2, 2.3, 5.1, 5.2) are no-op when project lacks PM-system
  or relevant patterns
- Skill `model:`/`effort:` overrides (Sprint 2.1) propagate via existing
  symlinks — instant for all projects
- Selective per-project symlinks (Sprint 1.1) require opt-in re-run of
  `setup-project.sh` per project

**Required after rollout**:
1. Run `setup-global.sh` once after Sprint 2 to register new hooks globally
2. Run `setup-project.sh` (or `migrate-project.sh`) per project lazily —
   only when actively working on that project

---

## Sprint 2 — Cost optimization + PM automation

Cheap wins on cost (model overrides) + PM-system automation via hooks.

- [x] **2.1 Skill `model:` / `effort:` overrides** (12 skills updated)
  - Haiku + low: `pm-status`, `task-tidy`, `claude-updates-watcher` (read-only / deterministic)
  - Opus + high: `pulse`, `sprint`, `reprioritize`, `tech-debt`, `task-health`,
    `threat-model`, `security-review`, `cost-aware-llm-pipeline`, `api-design`
    (multi-perspective / deep analysis)
  - Rest stays at default (Sonnet) — no need to declare explicitly

- [x] **2.2 `SessionStart` hook — auto-load TEAM-STATE.md**
  - New hook `hooks/session-start-pm.js` walks up from cwd looking for
    `project-orchestration/TEAM-STATE.md`
  - If found: injects content into Claude context at session start with
    staleness note (>7d old)
  - If absent: silent
  - Registered as second SessionStart entry in `hooks.json` (alongside
    existing `session-start.js` for session continuity)

- [x] **2.3 PostToolUse hook — PM auto-housekeeping**
  - New hook `hooks/pm-task-housekeeping.js` fires after Edit/Write/MultiEdit
  - Detects task file in `project-orchestration/tasks/` with `status: done`
  - Moves to `completed-tasks/`, appends entry to KANBAN.md "Recently
    Completed" section
  - Disable via `PM_NO_AUTO_HOUSEKEEPING=true` (logs warning instead)
  - Silent on non-task files; never blocks
  - Used PostToolUse (not the proposed `TaskCompleted` event) because
    PostToolUse is well-tested, deterministic, and triggers on the actual
    file mutation that signals "done"

---

## Sprint 3 — Quality of life

Visual polish and developer ergonomics.

- [x] **3.1 Statusline PM script** (`hooks/statusline-pm.js`)
  - Reads stdin payload + walks up cwd to find `project-orchestration/TEAM-STATE.md`
  - PM mode: `⚡ model | 📁 project | 🎯 active-task | 🚫 blocked | 💰 cost | 📊 ctx%`
  - Fallback (no PM): shows git branch instead
  - Smoke-tested: PM mode + no-PM mode both work
  - Activate per-project via `settings.json` → `statusLine` key

- [x] **3.2 `!` injection in analytical skills**
  - `/pulse`: recent commits + blocked count + recent task changes
  - `/task-health`: total active, status distribution, stale tasks, missing priority
  - `/tech-debt`: major/minor counts, TECH-DEBT.md size + age, debt-tagged commits
  - Pre-loaded context section sits before agent invocations — agents inherit
    the data without re-Globbing

- [x] **3.3 Output styles for strategists** (`output-styles/`)
  - `marketing-strategist.md` — hedged data-driven voice for CRO/copy/SEO/paid/growth
  - `finance-strategist.md` — confidence-signalled with calibrated regulatory disclaimers
  - `legal-strategist.md` — jurisdiction-tagged with 4-category contextual disclaimers
  - `output-styles/README.md` documents activation (per-session, per-project, per-user)
  - `setup-global.sh` symlinks output-styles/ to `~/.claude/output-styles/`

---

## Sprint 4 — Security integration (juz-ide-api proof of concept)

Concrete application of the architecture to a real use case. Tests whether
the abstractions hold up under pressure.

### claude-patterns side

- [x] **4.1 `hooks/check-security-considerations.js`** (planning-time enforce)
  - Already staged in current working tree
  - Blocks task file save without `## Security Considerations`

- [x] **4.2 `agents/stacks/nestjs-ddd/security-e2e-verifier.md`** (verification gate)
  - Already exists, currently being enriched in working tree

- [ ] **4.3 `patterns/cross-layer/security-invariants-pattern.md`** (universal NestJS-DDD)
  - 5-point checklist: Zod schemas, @Auth, rate limit, error.message, PII in logger
  - Applies to every NestJS-DDD project (not LocalHero-specific)

- [ ] **4.4 `patterns/_stack-defaults/nestjs-ddd.yml`** lists security-invariants in always-include
  - Depends on Sprint 1.3

### juz-ide-api side (separate repo)

- [ ] **4.5 `.claude/knowledge/patterns/security/`** (LocalHero-specific patterns)
  - `civic-audience-invariants.md`
  - `teryt-raw-input.md`
  - `dual-identity.md`

- [ ] **4.6 `.claude/knowledge/patterns/README.md`** (discovery hub)
  - Lists all pattern categories
  - Highlights security/ as MUST-READ before controller/handler implementation
  - Quick reference table: "writing X → read Y, Z"

- [ ] **4.7 One-liner update in `domain-application-implementer.md`** (in claude-patterns)
  - Add: *"Before writing any file: read `.claude/knowledge/patterns/README.md` to discover relevant patterns, including security/."*
  - Closes fast-path gap (direct agent invocation without /orchestrate)

### Template side (claude-patterns/templates/)

- [ ] **4.8 `templates/project-orchestration/.claude-knowledge-patterns-readme-template.md`**
  - Template README new projects copy as starting point for their patterns directory
  - Ensures consistency across projects

---

## Sprint 5 — Tier 2

- [x] **5.1 `PreCompact` hook** — `hooks/pre-compact-pm-snapshot.js` saves
  `project-orchestration/TEAM-STATE.md` to `_archive/snapshots/{ISO-timestamp}.md`
  before context compaction. Silent for projects without PM-system.
  Registered as second PreCompact entry alongside existing `pre-compact.js`.

- [x] **5.2 `SubagentStop` cost log** — `hooks/subagent-stop-cost-log.js`
  appends per-agent token usage (input/output/cache) + estimated cost
  (Opus/Sonnet/Haiku 2026-05 pricing) + duration + project to
  `~/.claude/logs/agent-usage.jsonl`. Disable via `AGENT_USAGE_LOG=off`.
  Used by `/cost-report` for accurate per-agent breakdown.

- [x] **5.3 `ultrathink` keyword** — added to `/sprint`, `/reprioritize`,
  `/tech-debt` skill bodies. Triggers extended thinking during
  multi-perspective analysis where the genuine cost-benefit is non-trivial
  (sprint scope trade-offs, priority dependency unlocks, debt leverage
  ranking).

- [-] **5.4 `rules/` subfolder for complex skills** — DEFERRED with
  rationale: of the proposed candidates, only `tdd-workflow` (412 lines)
  qualifies as complex enough; `code-review` (44 lines) and `sprint`
  (99 lines) are short. Rules/ subfolder pattern in Claude Code is
  soft-supported (works but not first-class). Without a concrete pain
  point, refactor would be cosmetic. Revisit if a skill grows past
  600 lines or a real discovery problem emerges.

---

## Explicitly rejected (with rationale)

- ~~Plugin format / marketplace~~ — overkill for local-only, kills instant-edit workflow (see ADR-0001)
- ~~Per-skill versioning~~ — git history sufficient
- ~~Sandbox templates~~ — per-project concern, not repo-level
- ~~Agent SDK examples~~ — separate project scope
- ~~Custom themes / PowerShell / mobile / managed-team settings~~ — out of scope for solo Linux+tmux
- ~~Fat `project.yml` manifest~~ — schema drift, duplicates native discovery (see ADR-0001 Option B)

---

## Suggested order

1. **Sprint 1 first** (foundation) — 1.1 → 1.2 → 1.3 in sequence
2. **Sprint 2** (cost wins) — 2.1 (cheapest) → 2.2 → 2.3
3. **Sprint 4** (security) — can run in parallel with Sprint 3 since it
   touches different files
4. **Sprint 3** (QoL) — when convenient
5. **Sprint 5** — opportunistic

Each sprint should be a separate atomic milestone with its own commit.
