# Global Claude Code Patterns Repository

**Version**: 3.5.0
**Created**: 2026-02-05
**Updated**: 2026-05-07
**Purpose**: Reusable patterns, agents, skills, project management, marketing skills, finance skills, and legal skills for Claude Code

---

## 📚 What Is This?

A **single source of truth** for production-tested software patterns and agent templates that can be shared across multiple Claude Code projects.

**Three Distribution Systems**:
1. **MCP Server** (`.mcp.json` per project) - Pattern delivery to Claude Code
2. **Filesystem Symlinks** (Global agents/commands/hooks) - Universal resources
3. **Stack Presets** (Settings templates) - Per-stack hooks, autoMode, worktree config

**Key Benefits**:
- ✅ **Write once, use everywhere** - No pattern duplication
- ✅ **Instant updates** - Change once, all projects see it immediately
- ✅ **Consistency** - Same patterns = consistent AI agent behavior
- ✅ **Multi-project support** - Works across different projects, not just multiple folders
- ✅ **Proven quality** - Extracted from LocalHero production codebase (1355+ tests)
- ✅ **Stack presets** - DDD hooks only in NestJS, Flutter hooks only in Flutter
- ✅ **Native integration** - .claude/rules/ auto-discovery, @import directives, worktree config

---

## 🏗️ Repository Structure

```
~/projects/claude-patterns/
├── README.md                    # This file
├── METADATA.yml                 # Repository metadata
├── .gitignore                   # Git exclusions
├── patterns/                    # Production patterns (38 core + 29 stack-specific + 1 marketing + 2 finance + 2 legal)
│   ├── README.md                # Pattern index & usage guide
│   ├── domain/                  # Domain layer (6 patterns)
│   ├── application/             # Application layer (4 patterns)
│   ├── infrastructure/          # Infrastructure layer (4 patterns)
│   ├── architecture/            # Architecture patterns (9 patterns)
│   ├── testing/                 # Testing patterns (7 patterns)
│   ├── cross-layer/             # Cross-layer patterns (4 patterns)
│   ├── orchestration/           # Orchestration patterns (1 pattern)
│   ├── marketing/               # Marketing patterns (1 pattern)
│   ├── finance/                 # Finance patterns (2 patterns: layered-knowledge, regulatory-disclaimer)
│   └── legal/                   # [NEW v3.5] Legal patterns (2 patterns: jurisdiction-aware-disclaimer, external-skills-catalog)
├── mcp-server/                  # MCP Server for multi-project use
│   ├── server.py                # MCP server implementation
│   ├── requirements.txt         # Python dependencies
│   ├── settings.json.example    # Example Claude settings
│   └── README.md                # MCP setup & usage guide
├── agents/                      # Agent definitions (11 universal + 14 stack-specific)
│   ├── README.md                # Agent setup & usage guide
│   ├── universal/               # Stack-agnostic agents (linked to ~/.claude/agents/)
│   │   ├── backend-technology-expert.md
│   │   ├── security-privacy-architect.md
│   │   ├── technical-architecture-lead.md
│   │   ├── tech-lead.md              # PM: project health, debt, dependencies
│   │   ├── product-owner.md          # PM: business value, mobile UX, milestones
│   │   ├── marketing-strategist.md   # Marketing coordinator (CRO, copy, SEO, growth)
│   │   ├── finance-strategist.md     # Finance coordinator (investment, compliance, advisory)
│   │   └── legal-strategist.md       # [NEW v3.5] Legal coordinator (contracts, GDPR, NDA, jurisdiction-aware)
│   └── stacks/                  # Stack-specific agents (linked per-project)
│       ├── nestjs-ddd/          # 3 agents (DDD expert, quality, security)
│       ├── flutter-clean-arch/  # 3 agents (arch, quality, UI)
│       ├── nextjs-app/          # 2 agents (arch, quality)
│       ├── sveltekit/           # 2 agents (arch, quality)
│       ├── python/              # 2 agents (arch, quality)
│       └── typescript-library/  # 2 agents (API guardian, quality)
├── skills/                      # Skills (slash commands) by category
│   ├── orchestration/           # Project management skills
│   │   ├── pulse/SKILL.md       # Full team sync — runs @tech-lead + @product-owner
│   │   ├── pm-status/SKILL.md   # Quick read of TEAM-STATE.md (no agents, ~$0)
│   │   ├── task-health/SKILL.md # Deep task audit — broken deps, stale, orphaned
│   │   ├── tech-debt/SKILL.md   # Debt analysis + TECH-DEBT.md update
│   │   └── sprint/SKILL.md      # Interactive sprint planning (both agents)
│   ├── marketing/               # 41 marketing skills (vendored from coreyhaines31/marketingskills, MIT)
│   │   ├── README.md            # Catalog + attribution + sync docs
│   │   ├── product-marketing-context/   # Foundation — run first
│   │   ├── page-cro/, signup-flow-cro/, ...   # 6 CRO skills
│   │   ├── copywriting/, copy-editing/, ...   # 6 content/copy skills
│   │   ├── seo-audit/, ai-seo/, ...           # 7 SEO skills
│   │   ├── paid-ads/, ad-creative/            # 2 paid skills
│   │   ├── cold-email/, email-sequence/       # 2 email skills
│   │   ├── ab-test-setup/, analytics-tracking/ # 2 measurement skills
│   │   └── ... (8 growth + 8 strategy/RevOps skills)
│   ├── finance/                 # 84 finance skills (vendored from JoelLewis/finance_skills, MIT)
│   │   ├── README.md            # Catalog + attribution + sync docs
│   │   ├── PLUGINS.md           # Plugin map + dependency graph
│   │   ├── core/                # 3 skills — math/stats foundations (REQUIRED by all)
│   │   ├── wealth-management/   # 32 skills — investment, portfolio, personal finance
│   │   ├── compliance/          # 16 skills — SEC/FINRA, KYC, AML, Reg BI, fiduciary
│   │   ├── advisory-practice/   # 12 skills — client onboarding, CRM, advisor workflows
│   │   ├── trading-operations/  # 9 skills — order lifecycle, execution, settlement
│   │   ├── client-operations/   # 8 skills — account lifecycle, transfers, reconciliation
│   │   └── data-integration/    # 4 skills — reference data, market data, integration
│   ├── legal/                   # [NEW v3.5] 12 legal skills (1 MIT evolsb + 11 Apache 2.0 vendored from lawvable per individual licenses)
│   │   ├── README.md            # Catalog + attribution + license-fragmented system explanation
│   │   ├── EXTERNAL.md          # Catalog of 30 NON-vendored skills (mostly AGPL — install per project)
│   │   ├── UPSTREAM_VERSION     # Per-skill license tracking
│   │   ├── contract-review/     # MIT, evolsb — CUAD-based contract review
│   │   ├── contract-review-anthropic/  # Apache 2.0
│   │   ├── nda-triage-anthropic/       # Apache 2.0 — RED/YELLOW/GREEN
│   │   ├── compliance-anthropic/       # Apache 2.0 — GDPR/CCPA/DPA/DSAR
│   │   └── ...                  # (canned-responses, legal-risk-assessment, meeting-briefing, document tools)
│   └── ...                      # (other skill categories)
├── templates/                   # Project templates
│   ├── project-orchestration/   # Full PM system folder template
│   │   ├── TEAM-STATE.md        # Shared brain template
│   │   ├── KANBAN.md            # Board view template
│   │   ├── TECH-DEBT.md         # Debt register template
│   │   ├── README.md            # System usage guide
│   │   ├── tasks/               # Active tasks folder
│   │   ├── completed-tasks/     # Completed tasks archive
│   │   └── _archive/            # Historical docs
│   ├── product-marketing-context.md  # [NEW v3.3] Marketing positioning template
│   └── ...                      # (other templates)
├── tools/                       # External tool reference (vendored)
│   └── marketing/               # 60 CLI helpers + 75+ integration guides
│       ├── REGISTRY.md          # Tool index (GA4, Stripe, HubSpot, …)
│       ├── integrations/        # Per-tool setup + common ops
│       └── clis/                # Reference CLI scripts (Node.js)
├── tests/                       # [NEW v3.4] Eval frameworks (vendored)
│   └── finance-evals/           # grade_responses.py + iteration-1, iteration-2 + evals.json
├── hooks/                       # PostToolUse/Stop hooks
│   ├── pm-task-check.js         # [NEW] PM briefing when task files change
│   └── ...                      # (other hooks)
├── commands/                    # Global commands (22 — symlinked to ~/.claude/commands/)
│   ├── README.md                # Command catalog & usage guide
│   ├── pulse.md                 # PM: full team sync
│   ├── pm-status.md             # PM: quick state read (~$0)
│   ├── sprint.md                # PM: interactive sprint planning
│   ├── task-health.md           # PM: deep task audit
│   ├── tech-debt.md             # PM: debt analysis
│   ├── orchestrate.md           # Unified orchestration (5 modes)
│   ├── plan.md                  # Requirements + implementation plan
│   ├── verify.md                # Quality gates (typecheck, lint, test)
│   └── ...                      # +14 more (see commands/README.md)
├── scripts/                     # Setup & maintenance scripts
│   ├── setup-global.sh          # Setup global ~/.claude/ (agents, commands, hooks)
│   ├── setup-project.sh         # Setup per-project (patterns, agents, rules, skills, MCP)
│   ├── generate-claude-md.sh    # Generate CLAUDE.md from project.yml
│   ├── migrate-v2.sh            # Migrate existing project to v3 features
│   ├── migrate-all.sh           # Batch migrate all projects
│   ├── sync-marketing-skills.sh # Pull updates from coreyhaines31/marketingskills
│   ├── sync-finance-skills.sh   # Pull updates from JoelLewis/finance_skills
│   ├── sync-legal-skills.sh     # [NEW v3.5] Pull updates from evolsb + lawvable (license-aware!)
│   └── validate-metadata.sh     # Validate METADATA.yml files
└── docs/                        # Additional documentation
    └── troubleshooting.md       # Common issues & solutions
```

---

## ⚖️ Legal System (NEW in v3.5)

12 legal skills (1 MIT + 11 Apache 2.0) vendored from `evolsb/claude-legal-skill`
+ `lawvable/awesome-legal-skills` (filtered by per-skill license), plus
catalog of 30 external skills (mostly AGPL-3.0 — install per project).

### Why a smaller catalog than marketing/finance

Legal skill ecosystem is **license-fragmented**. Most specialized prawniczych
skills (NDA-jamie-tso, GDPR-EU, French legal, mediation) are **AGPL-3.0** —
copyleft, would contaminate claude-patterns' MIT model. Only Apache 2.0 + MIT
vendored. The rest is cataloged in `skills/legal/EXTERNAL.md` with per-skill
install instructions and license warnings.

### The Concept

```
.agents/legal-context.md  → jurisdiction (PL/EU/US/FR), business form, regulated industry
        ↓
   ┌────┴─────────────────────────────────┐
   ↓                                      ↓
12 vendored skills (MIT/Apache)   30 external skills (AGPL/proprietary)
   skills/legal/                        cataloged in EXTERNAL.md
        ↓
@legal-strategist routes:
  - Vendored skill exists? → use it
  - Only external skill? → surface with license warning
  - No skill at all? → flag escalation to qualified counsel
```

### Three Access Modes (same as marketing/finance)

| Mode | When | How |
|---|---|---|
| **Strategic consultation** | Roadmap, sprint, milestone, regulatory exposure of features | `@product-owner` automatically consults `@legal-strategist` for jurisdiction lens |
| **Standalone** | Focused legal analysis | `@legal-strategist` invoked directly |
| **On demand** | Ad-hoc legal task | `/legal <task>` |

### Communication Style (jurisdiction-aware hedged)

`@legal-strategist` produces **principle-cited hedged recommendations**
with explicit jurisdiction context:

> *"Under [GDPR Art. 6(1)(b)] and recent CNIL guidance, the most
> defensible position appears to be **A**. Trade-offs: B has slightly
> better user experience but weaker lawful-basis grounding. Confidence:
> medium — rule is clear, application to your specific data flow less
> settled. Jurisdiction: EU general; PL-specific UODO interpretation
> may differ."*

Not: *"I cannot give legal advice; consult a lawyer."*

Disclaimers are **contextual** (4 categories: educational, GDPR/privacy,
contract drafting, litigation/dispute) **with jurisdiction layer** —
never boilerplate.

### Components

| Component | Path | Purpose |
|---|---|---|
| Agent | `agents/universal/legal-strategist.md` | Jurisdiction-aware coordinator with hedged voice |
| Command | `commands/legal.md` | `/legal <task>` entry point |
| Vendored skills (12) | `skills/legal/<skill>/` | MIT/Apache 2.0 only |
| External catalog | `skills/legal/EXTERNAL.md` | 30 non-vendored skills with license-aware install |
| Patterns | `patterns/legal/` | jurisdiction-aware-disclaimer + external-skills-catalog |
| Sync | `scripts/sync-legal-skills.sh` | License-verifying sync (--verify-licenses mode catches drift) |

### Usage

```bash
# Through @product-owner (automatic during strategic work touching law)
claude -p "/sprint"             # consults marketing + finance + legal strategists
claude -p "/pulse"              # team sync includes legal lens

# Standalone
claude -p "@legal-strategist analyze regulatory exposure of feature X in EU"

# On demand
claude -p "/legal review this SaaS agreement for unfavorable terms"
claude -p "/legal GDPR audit our data flows"
claude -p "/legal triage NDA — RED/YELLOW/GREEN classification"

# Power user: invoke skills directly
claude -p "/contract-review"
claude -p "/nda-triage-anthropic"
claude -p "/compliance-anthropic"
```

### License-aware sync

```bash
./scripts/sync-legal-skills.sh --verify-licenses   # check for upstream license drift
./scripts/sync-legal-skills.sh --diff              # preview changes
./scripts/sync-legal-skills.sh                     # interactive — diff + confirm
```

The `--verify-licenses` flag is **load-bearing** — it catches the case
where an upstream skill relicensed from MIT to AGPL (which would
require us to remove from `skills/legal/` and move to `EXTERNAL.md`).

---

## 💰 Finance System (NEW in v3.4)

84 specialized finance skills (investment, regulatory compliance, advisory,
trading, operations, data integration), vendored from
[JoelLewis/finance_skills](https://github.com/JoelLewis/finance_skills)
(MIT, by Joel Lewis), plus a coordinator agent with **data-driven hedged
voice** and **contextual disclaimers** (not boilerplate).

### The Concept

```
project.yml: skills: [finance/core, finance/wealth-management, finance/compliance]
                            ↓
   ┌────────────────────────┴────────────────────────┐
   ↓                        ↓                        ↓
core (3)            wealth-management (32)    compliance (16)
math/stats          investment + portfolio    Reg BI, KYC, AML
foundations         + personal finance        fiduciary, suitability
```

84 skills × 7 plugins × 8 knowledge layers — navigated by `@finance-strategist`
which respects plugin dependencies and applies contextual disclaimers.

### Three Access Modes

| Mode | When | How |
|---|---|---|
| **Strategic consultation** | During roadmap, sprint, milestone, pricing, growth analysis | `@product-owner` automatically consults `@finance-strategist` for unit economics, runway, regulatory exposure lens |
| **Standalone** | Focused finance analysis | `@finance-strategist` invoked directly |
| **On demand** | Ad-hoc finance task | `/finance <task>` |

### Communication Style (calibrated, not paralyzed)

`@finance-strategist` produces **data-driven hedged recommendations**:

> "Based on [evidence] and [observed trend], the most viable approach
> appears to be **A**. Trade-offs: B is less viable here because [...].
> Confidence: medium — strong on [X], uncertain on [Y]."

Not: *"I cannot give financial advice; consult a licensed advisor."*

Disclaimers are **contextual** — applied only to specific categories
(Reg BI/KYC/AML rules, investment-specific advice, trade execution
mechanics). Educational and operational analysis carry no disclaimer.

See `patterns/finance/regulatory-disclaimer-pattern.md` for the 6-category
table.

### Components

| Component | Path | Purpose |
|---|---|---|
| Agent | `agents/universal/finance-strategist.md` | Plugin-aware coordinator with hedged voice |
| Command | `commands/finance.md` | `/finance <task>` entry point |
| Skills (84) | `skills/finance/<plugin>/<skill>/` | 7 plugins with dependency graph |
| Plugin map | `skills/finance/PLUGINS.md` | Dependencies + layer architecture |
| Patterns | `patterns/finance/` | layered-knowledge + regulatory-disclaimer |
| Tests | `tests/finance-evals/` | Vendored eval framework + 2 iterations |
| Sync | `scripts/sync-finance-skills.sh` | Per-plugin rsync from upstream |

### Usage

```bash
# Through @product-owner (automatic during strategic work)
claude -p "/sprint"             # consults marketing + finance strategists
claude -p "/pulse"              # team sync includes finance lens

# Standalone
claude -p "@finance-strategist analyze the unit economics for our pricing tiers"

# On demand
claude -p "/finance compute TWR vs IRR for our model portfolio"
claude -p "/finance what does Reg BI require for fee disclosure?"

# Power user: invoke skills directly
claude -p "/return-calculations"
claude -p "/historical-risk"
claude -p "/suitability-and-best-interest"
```

### Pulling upstream updates

```bash
./scripts/sync-finance-skills.sh --diff       # preview only
./scripts/sync-finance-skills.sh              # interactive — diff + confirm + apply
./scripts/sync-finance-skills.sh --ref v1.0.0  # pin to a tag
```

The current vendored version is recorded in `skills/finance/UPSTREAM_VERSION`.

---

## 📣 Marketing System (NEW in v3.3)

41 specialized marketing skills (CRO, copy, SEO, paid, growth, RevOps),
vendored from [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills)
(MIT, by Corey Haines), plus a coordinator agent and a shared positioning
context pattern.

### The Concept

```
.agents/product-marketing-context.md    ← single source of truth (positioning, ICP, voice)
        ↑
        ├─ skills/marketing/page-cro/SKILL.md         ← reads context first
        ├─ skills/marketing/copywriting/SKILL.md      ← reads context first
        ├─ skills/marketing/seo-audit/SKILL.md        ← reads context first
        └─ ... 38 more skills, all consume the same context
```

The **`product-marketing-context`** doc is the marketing equivalent of
`BUSINESS_RULES.yaml` for DDD: one shared file that all 41 skills reference,
so the user never repeats positioning across CRO, SEO, copy, and growth tasks.

### Components

| Component | Path | Purpose |
|---|---|---|
| Agent | `agents/universal/marketing-strategist.md` | Routes tasks to the right skill, enforces context gate |
| Command | `commands/marketing.md` | `/marketing <task>` entry point |
| Skills (41) | `skills/marketing/` | CRO, copy, SEO, paid, email, growth, RevOps, … |
| Pattern | `patterns/marketing/product-marketing-context-pattern.md` | Architectural rationale |
| Template | `templates/product-marketing-context.md` | Copy → `.agents/` per project |
| Tools | `tools/marketing/` | 60 CLI refs + 75 integration guides (GA4, Stripe, HubSpot…) |
| Sync | `scripts/sync-marketing-skills.sh` | Pull upstream updates with diff + confirm |

### Usage

```bash
# 1. (Once per project) Set up positioning context
claude -p "/marketing"        # strategist will route to product-marketing-context if missing

# 2. Run any marketing task
claude -p "/marketing optimize the pricing page for conversions"
claude -p "/marketing draft a 5-email cold sequence for SaaS founders"
claude -p "/marketing run an SEO audit on /pricing"

# 3. Power-user: invoke skills directly
claude -p "/page-cro"
claude -p "/copywriting"
claude -p "/seo-audit"
```

### Pulling upstream updates

```bash
./scripts/sync-marketing-skills.sh --diff    # preview only
./scripts/sync-marketing-skills.sh           # interactive — diff + confirm + apply
./scripts/sync-marketing-skills.sh --ref v1.10.0  # pin to a tag
```

The current vendored version is recorded in `skills/marketing/UPSTREAM_VERSION`.

---

## 🧠 Project Management System (NEW in v3.1)

A **living team** for any project using claude-code. Two advisory agents share a
common state file (`TEAM-STATE.md`) and are triggered by task changes — creating
continuity across tmux sessions that can last days or weeks.

### The Concept

```
TEAM-STATE.md (shared brain)
├── Technical Pulse  ← @tech-lead writes here
└── Business Pulse   ← @product-owner writes here

project-orchestration/
├── tasks/           ← YAML-frontmatter tasks
├── TEAM-STATE.md    ← shared brain (auto-updated)
├── KANBAN.md        ← board view (auto-generated)
└── TECH-DEBT.md     ← debt register (auto-updated)
```

### Agents

| Agent | Lens | Key Questions |
|-------|------|--------------|
| `@tech-lead` | Technical | Blocked? Stale? Debt? Critical path? Mobile API risk? |
| `@product-owner` | Business | Customer value? Mobile UX? Milestone gap? Validated? |

### Skills (slash commands)

| Skill | When | Cost |
|-------|------|------|
| `/pm-status` | Quick check — reads TEAM-STATE.md only | ~$0 |
| `/pulse` | Full team sync — runs both agents | ~$0.10 |
| `/task-tidy` | Housekeeping: move done tasks, fix fields, validate YAML | ~$0.03 |
| `/task-health` | Deep task audit (broken deps, stale, orphaned) | ~$0.05 |
| `/tech-debt` | Debt analysis + TECH-DEBT.md update | ~$0.05 |
| `/sprint` | Interactive sprint planning | ~$0.20 |

### Trigger Mechanism

The system fires on task file changes (not session start — handles long tmux sessions):

```json
// Add to .claude/settings.json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit|MultiEdit",
      "hooks": [{ "type": "command",
        "command": "node /path/to/claude-patterns/hooks/pm-task-check.js" }]
    }]
  }
}
```

When a task file changes → compact PM briefing in Claude's context:
```
[PM] 74 active | P0: 3 | P1: 12 | Blocked: 5 | Stale: 8
[PM] ⚠️  Overdue: TS-AUTH-003 (2026-03-15, 18d ago)
[PM] 🔧 Debt: 🔴 3 major, 7 minor
```

### Setup for New Project

```bash
# 1. Copy template folder
cp -r ~/projects/claude-patterns/templates/project-orchestration ./project-orchestration

# 2. Agents available via global symlink (already in ~/.claude/agents/)
# Verify: ls ~/.claude/agents/ | grep -E "tech-lead|product-owner"

# 3. Add hook to .claude/settings.json (see above)

# 4. Initialize: edit project-orchestration/TEAM-STATE.md, then run /pulse
```

**Full documentation**: `patterns/orchestration/project-management-system.md`

---

## Quick Setup (Recommended)

Two-step setup: global (once per machine) + project (once per project).

### Step 1: Global Setup (once per machine)

```bash
cd ~/projects/claude-patterns
./scripts/setup-global.sh
```

**What this does**:
- Creates per-file symlinks in `~/.claude/agents/` for 5 universal agents
- Creates `~/.claude/commands/` symlink (22 commands)
- Creates `~/.claude/hooks/` symlink (12 hooks)
- Idempotent — safe to run multiple times

### Step 2: Project Setup (once per project)

```bash
./scripts/setup-project.sh ~/projects/your-project
```

**What this does**:
- Links patterns (stack-aware: DDD, Flutter, Python, etc.)
- Links stack-specific agents to `.claude/agents/`
- Links language rules to `.claude/rules/`
- Links configured skills to `.claude/knowledge/skills/`
- Copies stack hooks config (ddd-hooks.json, python-hooks.json)
- Sets up `.mcp.json` for project-scope MCP server
- Generates `CLAUDE.md` from `project.yml`

### Step 3 (optional): PM System

```bash
# Copy template
cp -r ~/projects/claude-patterns/templates/project-orchestration ./project-orchestration

# Add hook to .claude/settings.json (see PM System section below)

# Initialize
/pulse
```

### When to Use

- **New project**: Run Step 1 + Step 2
- **New machine**: Run Step 1, then Step 2 for each project
- **Broken symlinks**: Re-run the relevant step
- **PM system**: Also run Step 3

---

## v3 Migration (Existing Projects)

For projects already set up with v2, run:

```bash
# Single project
./scripts/migrate-v2.sh /path/to/project

# All projects in /opt/projects/
./scripts/migrate-all.sh
```

### What v3 Adds

| Feature | How It Works |
|---------|-------------|
| `.claude/rules/` auto-discovery | Claude Code natively finds rules without CLAUDE.md reference |
| `@import` in CLAUDE.md | Rules and skills loaded via native import directives |
| `.mcp.json` per project | Project-scope MCP server, committed to git |
| Stack-specific hooks | DDD/Flutter/Python hooks only in matching projects |
| `worktree` config | `node_modules` symlinked, `.env` copied to worktrees |
| `autoMode` classifier | Custom per-stack permission rules |
| Agent `memory: project` | Specialists remember decisions between sessions |
| Agent `isolation: worktree` | Verifiers run without blocking working tree |
| Skill `paths:` filtering | Skills auto-activate only for matching files |

### Stack Presets

Each project gets hooks and settings matching its `stack_profile`:

| Preset | Hooks | autoMode |
|--------|-------|----------|
| `nestjs-ddd` | DDD patterns, domain purity, TypeScript check, context isolation | pnpm test, pnpm lint, tsc |
| `flutter` | Clean arch, Riverpod patterns, cross-feature imports | flutter test, flutter analyze |
| `python` | Layer purity, type annotations | pytest, mypy, ruff |
| (base) | Universal only (formatting, console.log, git push) | Read, Glob, Grep |

---

## 🚀 Quick Start

### Option A: MCP Server (Recommended for Multi-Project Use)

**Use when**: Multiple DIFFERENT projects need patterns (e.g., LocalHero + MarketPlace + FutureProject)

**Setup** (5 minutes):

```bash
# 1. Install MCP dependencies
cd ~/projects/claude-patterns/mcp-server
python3 -m pip install -r requirements.txt

# 2. Add to your project's Claude settings
cd ~/your-project
vim .claude/settings.json
```

Add this to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "claude-patterns": {
      "command": "python3",
      "args": ["/opt/projects/claude-patterns/mcp-server/server.py"],
      "disabled": false
    }
  }
}
```

```bash
# 3. Commit config to git
git add .claude/settings.json
git commit -m "Add claude-patterns MCP server"

# 4. Restart Claude Code
# Patterns now work! When teammates git pull, patterns work for them too.
```

**Full MCP documentation**: See `mcp-server/README.md`

---

### Option B: Filesystem Symlinks (Simpler for Single Project)

**Use when**: Only one project needs patterns (or multiple folders of same project)

**For New Projects**:

```bash
# 1. Setup symlinks in your project
cd ~/my-new-project
~/projects/claude-patterns/scripts/setup-project.sh .

# 2. Done! Your project now uses global patterns
ls -la .claude/knowledge/patterns  # Should show symlink
```

**For Existing Projects**:

```bash
# 1. Backup current patterns (optional)
cd ~/my-project/.claude/knowledge
cp -r patterns patterns.backup

# 2. Setup symlinks
~/projects/claude-patterns/scripts/setup-project.sh ~/my-project

# 3. Verify
ls -la .claude/knowledge/patterns  # Should show symlink
```

**Note**: Symlinks require global repo to exist on each machine. When cloning project on new machine, run `setup-project.sh` again.

---

---

## Global Agents & Commands

User-level resources available across ALL projects on your system.

### Universal Agents (5)

| Agent | Purpose | Model |
|-------|---------|-------|
| `@tech-lead` | Project health: blocked/stale tasks, debt, dependencies | Sonnet |
| `@product-owner` | Business value: milestones, mobile UX, segment gaps | Sonnet |
| `@backend-technology-expert` | Sync/async decisions, performance, tech stack | Opus |
| `@security-privacy-architect` | OWASP, GDPR, encryption, auth | Opus |
| `@technical-architecture-lead` | Infrastructure, scalability, architecture | Opus |

### Commands (22)

Organized by category: PM (5), orchestration (4), quality (4), session (3), learning (4), infrastructure (2).

Key commands:
- `/pulse` — Full team sync (~$0.10)
- `/pm-status` — Quick state check (~$0)
- `/orchestrate` — Unified orchestration (5 modes)
- `/verify` — Quality gates (typecheck, lint, test, build)
- `/plan` — Requirements + implementation plan

See `commands/README.md` for full catalog.

### Cost Optimization

| Task Type | Model | Cost |
|-----------|-------|------|
| Search, scaffolding, progress | Haiku | ~$0.02 |
| Implementation, domain work | Sonnet | ~$0.10 |
| Security VETO, architecture | Opus | ~$0.50 |

**Full documentation**: `agents/README.md`, `commands/README.md`

---

## 📖 How It Works

### Symlink Architecture

Each project has a symlink from `.claude/knowledge/patterns/` pointing to `~/projects/claude-patterns/patterns/`:

```
my-project/
├── .claude/
│   └── knowledge/
│       ├── patterns/            # Symlink → ~/projects/claude-patterns/patterns/
│       ├── patterns-local/      # Project-specific overrides
│       └── learned/             # Project-specific learnings (NOT symlinked)
```

### Pattern Precedence

When Claude Code loads patterns, it uses this precedence:

1. **Local patterns** (`.claude/knowledge/patterns-local/`) - Highest priority
2. **Symlinked global patterns** (`.claude/knowledge/patterns/`)
3. **Claude Code defaults** - Fallback

**Example**:
- Global pattern: `~/projects/claude-patterns/patterns/domain/aggregate-pattern.md`
- Local override: `.claude/knowledge/patterns-local/domain/aggregate-pattern.md`
- Result: Claude uses the **local override** (project-specific needs)

---

### Config-Only Hook Pattern

Most Python projects need **zero hook scripts** — only a config file:

```
your-project/
├── python-hooks.json          ← Only this file needed
└── .claude/config/project.yml
```

**How it works:**

1. Global hooks live at `~/.claude/hooks/` (symlinked from claude-patterns)
2. When triggered, each hook walks upward from the edited file to find `python-hooks.json`
3. Config found → enforce rules from config
4. No config found → silent skip (no false positives)

**Analogy**: Like `.eslintrc.json` configures ESLint without copying the ESLint binary into your project. The enforcement engine is global; the rules are local.

**What goes in `python-hooks.json`:**
- Which layers to enforce purity on (domain, services, etc.)
- Which imports are forbidden in pure layers
- Which file patterns to check for type annotations
- Skip patterns for tests, venvs, etc.

See [`templates/PYTHON-HOOKS-GUIDE.md`](templates/PYTHON-HOOKS-GUIDE.md) for config variants by project type.

---

## 🔀 MCP vs Symlinks: Which to Use?

### Quick Decision Matrix

| Your Situation | Recommendation | Why |
|----------------|----------------|-----|
| Multiple DIFFERENT projects (LocalHero + MarketPlace + etc.) | **MCP Server** | Works out-of-box, no setup on new machines |
| Multiple folders of SAME project (local-hero-3, local-hero-4) | **MCP Server** | Git pull/push works immediately |
| Single project, simple setup | **Symlinks** | Simpler, no Python dependency |
| Team collaboration (git pull must work) | **MCP Server** | Config in repo, zero setup for teammates |
| Frequent machine changes | **MCP Server** | Config in repo, patterns work everywhere |

### Detailed Comparison

**MCP Server**:
- ✅ Works across ANY projects (not limited to one codebase)
- ✅ Out-of-box: git pull → patterns work (config in repo)
- ✅ Team-friendly: teammates pull config, patterns work immediately
- ✅ Future-proof: can add tools, versioning, analytics later
- ⚠️ Requires Python + MCP library (~5 min setup)
- ⚠️ Slightly more complex than symlinks

**Symlinks**:
- ✅ Simpler setup (one script, done)
- ✅ No dependencies (just filesystem)
- ✅ Instant access (no MCP protocol overhead)
- ⚠️ Requires setup on each machine (run `setup-project.sh`)
- ⚠️ Git doesn't store symlink content (just path)
- ⚠️ Breaks when global repo missing

### Real-World Example

**Your case** (from conversation):
- 4 parallel LocalHero folders (local-hero, local-hero-2, local-hero-3, local-hero-4)
- Starting NEW project (MarketPlace)
- Need patterns reusable everywhere
- Want git pull/push to work out-of-box

**Recommendation**: **MCP Server**

**Why**:
1. Works for LocalHero AND MarketPlace (different projects)
2. When you `git pull` in local-hero-4, MCP config is there → patterns work
3. When teammate clones project → patterns work immediately (no setup)
4. Update patterns once → all projects + teammates see changes

---

## 🏷️ Stack Tagging System

Patterns are tagged with supported tech stacks in `METADATA.yml`:

```yaml
# ~/projects/claude-patterns/patterns/domain/METADATA.yml
version: "1.0"
stack_support:
  - typescript
  - python      # Future
  - generic     # Language-agnostic concepts

patterns:
  - name: aggregate-pattern.md
    stacks: [typescript]
    maturity: production
    last_verified: 2026-02-05
  - name: value-object-pattern.md
    stacks: [typescript, python]
    maturity: production
    last_verified: 2026-02-05
```

**Why Stack Tags?**
- Python projects won't load TypeScript-specific patterns
- Generic patterns work for all languages
- Reduces context pollution for Claude agents

---

## Pattern Categories

38 core patterns + 29 stack-specific. Full index in `patterns/README.md`.

| Layer | Count | Key Patterns |
|-------|-------|-------------|
| Domain | 6 | aggregate, value-object, domain-event, entity, specification, domain-service |
| Application | 4 | command-handler, query-handler, application-service, audit-handler |
| Infrastructure | 4 | repository, repository-events, mapper, controller-schema |
| Architecture | 11 | ACL registry, dual-identity, transactional, integration-event, cross-context-communication, token-optimization, ... |
| Testing | 8 | testing-pyramid, schema-testing, context-isolation, e2e-hybrid-fixture, business-rules-yaml, ... |
| Cross-Layer | 4 | domain-errors, logger, error-handler-chain, conventions |
| Orchestration | 1 | project-management-system |
| Stack-specific | 29 | flutter (7), nextjs (7), python (5), sveltekit (5), typescript-library (5) |

---

## Maintenance

### Updating Patterns

```bash
# 1. Edit pattern in global repo
cd ~/projects/claude-patterns
vim patterns/domain/aggregate-pattern.md

# 2. Commit change
git add patterns/domain/aggregate-pattern.md
git commit -m "Improved aggregate factory method pattern"
git push

# 3. All projects see the update immediately (no action needed)
# - MCP Server: serves latest version automatically
# - Symlinks: point to latest version automatically
```

### Adding New Patterns

```bash
# 1. Add new pattern
cd ~/projects/claude-patterns/patterns/domain
vim new-pattern.md

# 2. Update METADATA.yml
vim METADATA.yml  # Add entry for new-pattern.md

# 3. Validate
cd ~/.claude-patterns
./scripts/validate-metadata.sh

# 4. Commit
git add .
git commit -m "Added new-pattern.md to domain layer"
```

### Syncing Across Machines (After GitHub Setup)

```bash
# On Machine A (after making changes)
cd ~/.claude-patterns
git push

# On Machine B (pull changes)
cd ~/.claude-patterns
git pull  # All projects see updates via symlinks
```

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `setup-global.sh` | Global setup: agents, commands, hooks to `~/.claude/` |
| `setup-project.sh` | Per-project: patterns, stack agents, rules, skills, MCP, CLAUDE.md |
| `generate-claude-md.sh` | Generate CLAUDE.md from `project.yml` config |
| `migrate-v2.sh` | Migrate single project to v3 |
| `migrate-all.sh` | Batch migrate all projects in `/opt/projects/` |
| `validate-metadata.sh` | Validate all METADATA.yml files |

---

## 📊 Pattern Maturity Levels

Each pattern has a maturity level in METADATA.yml:

| Level | Description | Example |
|-------|-------------|---------|
| **production** | Battle-tested in production (1000+ tests) | aggregate-pattern.md |
| **stable** | Well-tested, minor tweaks expected | value-object-pattern.md |
| **experimental** | New pattern, may change significantly | (none yet) |
| **deprecated** | Obsolete, use alternative | (none yet) |

---

## Success Metrics

After setup, you should see:
- `ls ~/.claude/agents/` shows 5 universal agent symlinks
- `ls ~/.claude/commands/` shows 22 command files
- `ls ~/.claude/hooks/` shows hook scripts + hooks.json
- `ls .claude/knowledge/patterns/` shows pattern symlink (per project)
- All slash commands work: `/pm-status`, `/pulse`, `/verify`, etc.

---

## 🐛 Troubleshooting

### Symlink Not Working

**Symptom**: `ls -la .claude/knowledge/patterns` shows broken symlink

**Solution**:
```bash
# Check if global patterns exist
ls ~/projects/claude-patterns/patterns/

# Re-run setup script
~/projects/claude-patterns/scripts/setup-project.sh .
```

### Windows Compatibility

**Symptom**: Symlinks don't work on Windows

**Solution**:
- **WSL2**: Symlinks work natively (recommended)
- **Windows native**: Use junction points instead:
  ```cmd
  mklink /J .claude\knowledge\patterns %USERPROFILE%\.claude-patterns\patterns
  ```

### Patterns Not Loading

**Symptom**: Claude doesn't see patterns

**Solution**:
```bash
# Verify symlink target exists
readlink .claude/knowledge/patterns

# Verify METADATA.yml is valid
cd ~/.claude-patterns
./scripts/validate-metadata.sh

# Check Claude Code settings
cat .claude/settings.json  # Ensure patterns path is correct
```

---

## 🚀 Next Steps

### After Initial Setup

1. **Test with existing project**: Verify all tests pass with symlinked patterns
2. **Create local overrides**: Add project-specific patterns to `patterns-local/`
3. **Update patterns**: Make improvements to global patterns as you learn
4. **Commit regularly**: Keep git history clean and descriptive

### Future Enhancements (Not Yet Implemented)

- [ ] Python pattern examples (Flask/FastAPI equivalents)
- [ ] GitHub repository for community contributions
- [ ] Auto-update mechanism (git pull on project open via hook)
- [ ] VS Code extension for pattern browsing
- [ ] Pattern versioning (semver for breaking changes)
- [ ] Pattern search CLI (`claude-patterns search "aggregate"`)
- [ ] Pattern diff tool (compare local vs global)

---

## 📚 References

**Source Material**:
- Extracted from LocalHero v3 production codebase
- Validated across 1355+ tests
- Production-tested patterns since 2026-01-06

**Key Documentation**:
- `patterns/README.md` — Full pattern index (67 patterns)
- `agents/README.md` — Agent catalog (19 agents)
- `commands/README.md` — Command catalog (22 commands)
- `patterns/orchestration/project-management-system.md` — PM system docs

---

**Version**: 3.1.0
**Last Updated**: 2026-04-03
