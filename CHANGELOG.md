# Changelog

All notable changes to claude-patterns are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions match the
`version:` field in `METADATA.yml`.

These entries moved out of `CLAUDE.md` on 2026-09-07 (K105). They had grown to
a third of that file, which every session in this repo pays for on every turn,
and none of it is instruction — it is history.

## [Unreleased]

### Changed
- `skills/finance/` and `skills/legal/` re-synced from upstream after four
  months. Legal picked up 11 renamed upstream folders (licenses unchanged,
  still Apache-2.0); finance gained 7 skills and reference material for most
  existing ones.
- The three `sync-*-skills.sh` scripts now protect files carrying the
  `<!-- LOCAL — not synced from upstream -->` marker, work without `rsync`
  installed, and resolve upstream skills by their `name:` field rather than by
  folder name.
- DDD rules moved out of the global `~/.claude/CLAUDE.md` into the per-project
  CLAUDE.md, emitted only when the composition includes the `ddd/core` block.
- `schemas/hooks.schema.json` corrected — it had the event name and the entry
  `type` swapped, so it rejected every real hooks configuration in the repo.

### Added
- `schemas/block.schema.json` — describes `blocks/*.yml`, derived from the real
  blocks and checked against `BLOCK_KEYS` in `materialize-runtime.mjs`.
- `docs/CONTRIBUTING.md` — the "how to add a …" procedures, moved from CLAUDE.md.

### Deferred
- The marketing skills sync. Upstream renamed 20 of the 42 skills we vendor;
  applying it needs the routing tables updated in the same change. Rename map
  is recorded in `skills/marketing/UPSTREAM_VERSION`.

## [3.5] — 2026-05-07

### Added

#### Legal System (NEW) — license-fragmented vendoring

Vendored **12 legal skills** from two upstream sources, applying per-skill
license verification because the legal skill ecosystem is heavily AGPL-3.0
(copyleft, would contaminate claude-patterns' MIT model).

**Sources**:
- [evolsb/claude-legal-skill](https://github.com/evolsb/claude-legal-skill) — 1 skill, MIT (contract-review CUAD)
- [lawvable/awesome-legal-skills](https://github.com/lawvable/awesome-legal-skills) — 11 skills filtered to Apache 2.0 (Anthropic + OpenAI authors)

**Not vendored**: 30 skills (25 AGPL-3.0 + 5 Anthropic-proprietary + 1
Manus-proprietary) — cataloged in `skills/legal/EXTERNAL.md` with
per-license install warnings and commercial-use guidance. Users install
these in their own project per their own license decisions.

**New skills folder** (`skills/legal/<skill>/` flat):
- 7 legal-domain skills: `contract-review`, `contract-review-anthropic`,
  `nda-triage-anthropic`, `compliance-anthropic` (GDPR/CCPA),
  `legal-risk-assessment-anthropic`, `canned-responses-anthropic`,
  `meeting-briefing-anthropic`
- 4 office tools (Apache 2.0): `docx/pdf/xlsx-processing-openai`,
  `security-review-openai`
- 1 meta-skill: `skill-creator-openai` (for authoring custom legal skills,
  e.g., Polish KSH or Kodeks Pracy specializations)

**New agent** (`agents/universal/`):
- `legal-strategist.md` — Sonnet coordinator with **jurisdiction-aware
  hedged voice** ("Under [GDPR Art. 6(1)(b)] and recent CNIL guidance,
  the most defensible position appears to be X. Confidence: medium.
  Jurisdiction: EU general; PL-specific UODO interpretation may differ.")
  Refuses to silently fabricate jurisdiction-specific content. Surfaces
  external skills from EXTERNAL.md when vendored coverage is missing.

**New command**: `commands/legal.md` — `/legal <task>`.

**New patterns** (`patterns/legal/`):
- `jurisdiction-aware-disclaimer-pattern.md` — 4-category disclaimer
  system (educational, GDPR/privacy, contract drafting, litigation/dispute)
  with jurisdiction layer. Sister to finance's regulatory-disclaimer.
- `external-skills-catalog-pattern.md` — how to manage license-fragmented
  skill ecosystems: vendor what's compatible, catalog the rest, sync
  script with `--verify-licenses` mode to catch upstream drift.
  Generalizable beyond legal.

**New script**: `scripts/sync-legal-skills.sh` — license-verifying sync.
The `--verify-licenses` flag is **load-bearing** — catches the case
where an upstream skill relicensed from MIT to AGPL (would require
removal from `skills/legal/`).

#### Strategic Consultation Update

`@product-owner` now consults `@legal-strategist` (in addition to
`@marketing-strategist` + `@finance-strategist`) during strategic work
that touches: GDPR, privacy, contracts, NDAs, ToS, IP, employment law,
or compliance. Trigger keywords expanded.

`/pulse`, `/sprint`, `/reprioritize` skills include the legal lens in
their multi-perspective synthesis.

---

## [3.4] — 2026-05-07

### Added

#### Finance System

Vendored 84 finance skills from
[JoelLewis/finance_skills](https://github.com/JoelLewis/finance_skills) (MIT)
with plugin-aware structure preserved.

**New skills folder** (`skills/finance/<plugin>/<skill>/`):
- 7 plugins with dependency graph: `core` (3 skills, math/stats foundations,
  required by all) → `wealth-management` (32), `compliance` (16),
  `advisory-practice` (12), `trading-operations` (9), `client-operations` (8),
  `data-integration` (4)
- 29 skills include `scripts/*.py` — runnable numpy/scipy implementations
- Each `SKILL.md` declares `## Layer N` (0-7) for knowledge depth
- `PLUGINS.md` documents the plugin map and dependency graph
- `UPSTREAM_VERSION` records the synced upstream commit + version

**New agent** (`agents/universal/`):
- `finance-strategist.md` — Sonnet coordinator with **data-driven hedged
  voice** ("Based on [evidence], the most viable approach appears to be X.
  Trade-offs: ... Confidence: medium.") rather than paralyzing
  "consult an advisor" deflection. Plugin-aware (enforces dependencies).
  Three access modes: through `@product-owner`, standalone, or via `/finance`.

**New command** (`commands/`):
- `finance.md` — `/finance <task>` entry point.

**New patterns** (`patterns/finance/`):
- `layered-knowledge-pattern.md` — 2-D organization (plugin × layer) for
  large skill collections. Generalizable beyond finance.
- `regulatory-disclaimer-pattern.md` — 6-category contextual disclaimer
  system (educational, general principles, regulatory, investment-specific,
  trading operational, business operations). Replaces boilerplate "this
  is not financial advice" deflections that get tuned out.

**New tests folder** (`tests/finance-evals/`):
- Vendored eval framework: `grade_responses.py` + 2 iterations of
  test responses + `evals.json`

**New script** (`scripts/`):
- `sync-finance-skills.sh` — per-plugin rsync from upstream with
  diff + confirm, preserves local meta files (README.md, PLUGINS.md,
  UPSTREAM_VERSION).

#### Strategic Consultation Integration

`@product-owner` now consults `@marketing-strategist` + `@finance-strategist`
in parallel during **strategic work** (roadmaps, sprint planning, milestones,
pricing analysis, growth questions). Skills `/pulse`, `/sprint`, `/reprioritize`
trigger this consultation automatically.

**Boundary**: code implementation skills (`/orchestrate` impl mode, `/tdd`,
`/scaffold`, `/build-fix`, `/verify`, `/code-review`) explicitly do NOT
consult business strategists. They are summoned only for strategy/analysis,
never for code work.

#### Marketing voice updated to match finance

`@marketing-strategist` voice refreshed to use the same data-driven hedged
format as `@finance-strategist` — replacing "I refuse to invent customer
quotes" framing with **"Based on industry benchmarks and [observed
trend]..." + contextual validation note**.

---

## [3.3] — 2026-05-07

### Added

#### Marketing System

Vendored 41 marketing skills from
[coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)
(MIT) and wrapped them in claude-patterns conventions.

**New skills folder** (`skills/marketing/`):
- 41 skills across CRO, copy, SEO, paid, email, growth, strategy, RevOps
- `product-marketing-context` is foundational — runs first per project,
  creates `.agents/product-marketing-context.md` (agenci czytają też
  `docs/business/…` — patrz niżej)
- `UPSTREAM_VERSION` records the synced upstream commit + version

**New agent** (`agents/universal/`):
- `marketing-strategist.md` — Sonnet coordinator. Enforces context gate,
  routes to the right skill, never fabricates positioning facts.

**New command** (`commands/`):
- `marketing.md` — `/marketing <task>` entry point.

**New pattern** (`patterns/marketing/`):
- `product-marketing-context-pattern.md` — architectural rationale for the
  shared positioning document (the marketing equivalent of `BUSINESS_RULES.yaml`).

**New template** (`templates/`):
- `product-marketing-context.md` — copyable scaffold for `.agents/` (lub `docs/business/`).

**New tools folder** (`tools/marketing/`):
- 60 reference CLI scripts + 75+ integration guides + REGISTRY.md
- For analytics, email, ads, CRM, SEO, payments, referrals
- Reference materials only — not executed from claude-patterns

**New script** (`scripts/`):
- `sync-marketing-skills.sh` — pull upstream updates with diff + confirm,
  records version in `UPSTREAM_VERSION`.

**Design principle**: vendoring (full copy) over submodules — keeps the
"everything is here" promise of claude-patterns. Updates are explicit and
auditable via the sync script.

---

## [3.1] — 2026-04-03

### Added

#### Project Management System (NEW)

Added a complete project management system as a reusable pattern:

**New agents** (`agents/universal/`):
- `tech-lead.md` — Technical PM: tracks blocked/stale tasks, debt, dependencies
- `product-owner.md` — Business PM: customer value, mobile UX, milestone advisory

**New skills** (`skills/orchestration/`):
- `pulse/` — Full team sync (both agents + TEAM-STATE.md update)
- `pm-status/` — Quick read of TEAM-STATE.md (~$0, no agent)
- `task-health/` — Deep task audit (broken deps, stale, orphaned)
- `tech-debt/` — Debt analysis + TECH-DEBT.md update
- `sprint/` — Interactive sprint planning

**New pattern** (`patterns/orchestration/`):
- `project-management-system.md` — Complete system docs, setup guide, conventions

**New template** (`templates/project-orchestration/`):
- Ready-to-copy folder: TEAM-STATE.md, KANBAN.md, TECH-DEBT.md, README.md

**New hook** (`hooks/`):
- `pm-task-check.js` — PostToolUse hook: PM briefing when task files change

**Design principle**: `TEAM-STATE.md` is the shared brain — all agents read it
first and write to it after analysis. This creates continuity across long
tmux sessions (days/weeks) without relying on session-start hooks.
