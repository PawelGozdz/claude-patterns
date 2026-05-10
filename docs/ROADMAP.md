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

- [ ] **2.1 Skill `model:` / `effort:` overrides**
  - Read-only / simple (`/pm-status`, `/cost-report`, `/progress`, `/checkpoint`) → `haiku` + `low`
  - Multi-perspective (`/sprint`, `/reprioritize`, `/tech-debt`, `/pulse`) → `opus` + `max`
  - Rest → `sonnet`
  - Investment: ~1h (~25 SKILL.md edits)
  - Verified in docs: ✅ exists per-turn override

- [ ] **2.2 `SessionStart` hook — auto-load TEAM-STATE.md**
  - In projects with `project-orchestration/`: auto-inject `TEAM-STATE.md` at session start
  - Eliminates "Claude forgot where we were" on long tmux sessions
  - Investment: ~1h
  - Verified in docs: ✅ event exists

- [ ] **2.3 `TaskCompleted` hook — PM auto-housekeeping**
  - When task file marked done: move to `done/`, update `KANBAN.md`, refresh `TEAM-STATE.md` "Last Completed"
  - Eliminates manual `/task-tidy`
  - Investment: ~2h
  - Verified in docs: ✅ event exists

---

## Sprint 3 — Quality of life

Visual polish and developer ergonomics.

- [ ] **3.1 Statusline PM script** (`hooks/statusline-pm.sh`)
  - Reads `project-orchestration/TEAM-STATE.md` if present, fallback git status
  - Shows: active task / blocked count / sprint week / context %
  - Investment: ~2h
  - Verified in docs: ⚠️ feature exists, payload schema needs experimental confirmation

- [ ] **3.2 `!` injection in analytical skills**
  - Add live data to `/pulse`, `/task-health`, `/tech-debt`:
    ```markdown
    Last week activity:
    !`git log --oneline --since="7 days" | head -20`

    Blocked tasks:
    !`grep -l "status: blocked" project-orchestration/tasks/*.md | wc -l`
    ```
  - Investment: ~1h
  - Verified in docs: ✅ syntax confirmed

- [ ] **3.3 Output styles for strategists**
  - `output-styles/marketing-strategist.md`, `legal-strategist.md`, `finance-strategist.md`
  - Hedged voice extracted from agent prompts to reusable styles
  - Strategist agents activate via output style instead of inline prompt
  - Investment: ~2h
  - Verified in docs: ⚠️ supported, frontmatter details thin in fetched docs

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

## Sprint 5+ — Tier 2 optional

Lower priority, implement based on observed need.

- [ ] **5.1 `PreCompact` hook** — snapshot `TEAM-STATE.md` before compaction (history of pulse)
- [ ] **5.2 `SubagentStop` hook** — log per-agent token usage to `~/.claude/logs/agent-usage.jsonl`
- [ ] **5.3 `ultrathink` keyword** in `/sprint`, `/reprioritize`, `/tech-debt` content
- [ ] **5.4 `rules/` subfolder** for complex skills (`tdd`, `code-review`, `sprint`) — progressive disclosure pattern

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
