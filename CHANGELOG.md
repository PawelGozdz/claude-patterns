# Changelog

All notable changes to claude-patterns are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions match the
`version:` field in `METADATA.yml`.

These entries moved out of `CLAUDE.md` on 2026-09-07 (K105). They had grown to
a third of that file, which every session in this repo pays for on every turn,
and none of it is instruction — it is history.

## [Unreleased]

### Added
- Block `design-system` (axis `ui`, ADR 0010) for the juz-ide design system — replaces
  the `claude-plugins` plugin from the rollout plan (ADR 0001 rejects plugins). Adds the
  skill category `skills/design-system/`: `design-tokens` (full token list generated from
  the `design-system` repo by `scripts/generate-reference.mjs`, never hand-copied),
  `ui-patterns` (screen patterns approved by the user on 2026-09-26), `screen-build`,
  `visual-check` (Playwright capture script, light/dark × desktop/mobile) and
  `new-screen` with its `/new-screen` command wrapper; agent
  `agents/stacks/design-system/ui-reviewer.md` (read-only screenshot review); hook
  `hooks/check-ui-tokens.js`, which runs the project's ESLint plus design rules on a
  saved `.ts`/`.tsx` and reports through `additionalContext` JSON on stdout.
- New axis value `ui` in `schemas/block.schema.json`. The schema no longer claims that two
  blocks on one axis conflict — the materializer never enforced that (ADR 0010).

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
- `orchestrate-prepare.mjs --overrides <file.json>` and `--emit-script <path>`:
  overrides merge into the output (unknown key = exit 1), and the emitted script
  embeds the args, passes `workflow-lint` (exit 4 otherwise) and becomes the
  `scriptPath` (ORC-065).
- `patterns_exclude[]` in the analysis artifact drops false keyword hits from
  pattern selection (ANL-038).
- Rule cards for `zod-schema-validation` and `rate-limit-guard`.
- `schemas/block.schema.json` — describes `blocks/*.yml`, derived from the real
  blocks and checked against `BLOCK_KEYS` in `materialize-runtime.mjs`.
- `docs/CONTRIBUTING.md` — the "how to add a …" procedures, moved from CLAUDE.md.

### Changed
- `/orchestrate` implementer and verifier prompts now carry a search budget:
  locating goes to one batched `Explore` (Haiku) call, `Read` only touches
  files being edited (offset/limit above 300 lines), own `Grep` only targeted.
  Metrics to 2026-09-15 put ~90% of implementer cost in cache-read — context
  growing with every turn — and the stack agents already said "delegate
  discovery"; `general-purpose` (libraries, `node`) never heard it. Baseline
  for the comparison (since 2026-08-15, per step): `domain-application-implementer`
  2.2 M cache-read / $0.81, `infrastructure-implementer` 2.1 M / $0.74,
  `general-purpose` 2.8 M / $0.87 — check `workflow-metrics-report.mjs --by agentType`.
- `domain-application-implementer.md` still told the agent to call
  `Task(codebase-explorer)`, an agent that has not existed since 2026-06-27;
  the call failed and the implementer fell back to grepping itself.

- `agents/stacks/refine-spa/` — `refine-implementer` and `refine-quality-verifier`
  (VETO) for Vite + React + Refine + Ant Design panels behind an identity
  gateway. First consumer: marketing-hub (TS-MH-002); linked through a block's
  `overlay.agents: [stacks/refine-spa/]`.
- `layers[].verify` — a layer may name its own verifier; `inner_loop.verify`
  stays the default. Needed the moment one repo holds an API and a web panel:
  the DDD `code-quality-verifier` has nothing to say about a React provider.

### Fixed
- `lint:check` temporarily removed from `checks` in `ddd/layers`, `flat-service` and
  grant-flow's local block: the checks added a day earlier ran lint on `domain`/`application`
  for the first time, surfacing real pre-existing debt (277-2463 errors, up to ~5 minutes per
  run) unrelated to any task, which halted every run with ESCALATE_AND_HALT. `typecheck` stays.
  Fixed one real, isolated `import/order` violation in marketing-hub instead of weakening its
  check. See TASK-ORCH-LINT-BASELINE-001 for the per-project re-enable criterion.
- `/orchestrate` could report GO for work nobody checked (marketing-hub
  TS-MH-005, 4 of 4 infrastructure layers). After a red probe the implementer
  could answer "nothing to do here", and the no-op verifier judged that claim
  without seeing the probe result. A red probe now closes the no-op path: the
  layer ends as `BLOCKED_BY_PRIOR` and the run stops for a human decision
  (ORC-062, `workflow-lint` WL17).
- The "code exists" gate, the silent-death diff probe and the test-block counter
  did not see new files (untracked or fully staged), so tasks that only add files
  ended in a false ESCALATE (ai-gateway TS-AIG-015, marketing-hub TS-MH-003/005).
  All three now share one command that lists untracked files one by one and
  compares against `HEAD`. The counter also catches `describe.each(` and
  `it.each(` (ORC-063, WL18).
- The final gate got its file list from layer reports (no-op layers report
  none) and no pattern cards. It now lists files from the working tree relative
  to the run's `baseSha`, receives every card of the run and is told which files
  were already dirty before the run started (ORC-063).
- The final gate lost its regression tests whenever analysis skipped the testing
  layer; on `ddd/layers` it ran no checks at all. Blocks can now declare
  `final_gate.checks`, which always run. `ddd/layers` and `flat-service` declare
  `typecheck, lint:check, test`, and the `ddd/layers` layers got their own
  `checks` (ORC-022).
- `units[]` in the analysis artifact was silently ignored: four planned
  infrastructure passes became one. Prepare now expands each unit into a
  sub-layer `<layer>:<unit>` and rejects malformed entries with exit 2 (ORC-064).
- `orchestrate-prepare.mjs --json` piped into another process was cut at 64 KB:
  `process.exit()` right after `stdout.write` dropped the unflushed buffer, and
  real args are ~140-190 KB. It now sets `process.exitCode` instead.
- `library-layers` declares `final_gate.checks: ["test"]`.
- A test file next to a scoped file (same directory, same name stem) now counts
  as in scope, so narrowing to `x.map.ts` no longer strands `x.adapter.spec.ts`.

- Optional layers never ran. `layerPlan()` read `a.createWhenHits`, but
  `orchestrate-prepare.mjs` never computed it, so every `optional: true` layer
  reported "create_when nie trafił" — including `api-surface` in
  `library-layers`, which has therefore never executed. Prepare now matches
  `create_when` against the same haystack the pattern triggers use.
- `env:` declared by blocks never left `runtime.yml`. `materialize-runtime.mjs`
  merged it correctly, but nothing copied it into `.claude/settings.json`, so
  `ECC_GATEGUARD: off` in `ts-library`, `ddd/core` and `clean-arch` was a
  statement, not a setting — every project on those blocks still ran GateGuard.
  `sync-runtime-hooks.mjs` now syncs `env` the same way it syncs hooks: adds
  missing keys, unions list-valued ones (`ECC_DISABLED_HOOKS`), leaves hand-set
  scalars alone and reports the conflict.
- `ts-library` also disables ECC's `pre:config-protection`. It blocks every edit
  to an existing `eslint.config.*`, which is right for a service and wrong for a
  published library whose lint config is part of the product — `platform`
  (2026-09-13) could not fix the `eslint.config.js` it was scaffolding.
- `setup-project.sh` never copied the PM dashboards into a fresh project: step 5
  creates `project-orchestration/analysis/TEMPLATE.md` first, so step 7 saw the
  directory, said "already exists" and skipped `TEAM-STATE.md`, `KANBAN.md`,
  `tasks/`. It now tests for `TEAM-STATE.md` and copies without overwriting.
- `/orchestrate` escalated on layers the task never touched: three "zero
  changes" attempts on `domain` (or `application`, for infrastructure-only
  work) looked identical to an implementer that did nothing. Two fixes — the
  analysis now declares `layers_skip: [{ id, reason }]` (ANL-036; prepare
  rejects unknown ids and missing reasons), and an implementer may return
  `changed_files: [] + no_changes_reason`, which the layer verifier confirms
  (`verify-noop` → GO without files) or rejects with concrete gaps.
- Decisions D1–Dn reached agent prompts empty when the analysis spelled the
  field `decision` instead of `choice`; `orchestrate-prepare.mjs` now fails
  the gate and names the field to rename.
- `layers_skip` silently dropped partial work: an analysis that skipped
  `application` "for 7 of 8 contexts" got `skip: true` for the whole layer,
  and the one context that mattered — a live data leak fix — would never have
  reached an implementer (juz-ide-api-2, 2026-09-18). New `layers_scope:
  [{ id, dirs, reason }]` narrows a layer instead of dropping it (implementer
  prompt, verifier prompt, probe pathspec and file attribution all follow the
  narrowed `dirs`, single files included); prepare now rejects a skip whose
  reason says "partially" ("wyjątek", "N z M", "tylko dla", …) and a layer
  listed in both fields (ANL-037).
- `templates/project.yml.example` still advertised `entry_points.orchestrate: "/o"`,
  a command that no longer exists; every project scaffolded from it (nest-kit,
  platform, auth, grant-flow) inherited the dead value. Now `/analyze` +
  `/orchestrate`, and the four project.yml files are corrected in place.
- `verify-project-setup.mjs` reported "setup kompletny" for a project whose
  `runtime.yml` had no `orchestrate` section at all (ai-gateway: `node + zod +
  approval-gate`, no architecture-axis block). `/orchestrate` would have fallen
  back to `GENERIC_LAYERS` — one `general-purpose` layer with no verifier and
  no final gate. The verifier now fails on missing `orchestrate.layers` or an
  empty `inner_loop.verify`, and warns on an empty `final_gate.agent`.
  ai-gateway itself now composes `flat-service`.

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
