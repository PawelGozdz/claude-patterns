# Architecture: claude-patterns + per-project extensions

This document describes how `claude-patterns` (central, shared) and individual
projects (per-project overrides) compose into a working system.

For the **decisions and rationale** behind this architecture, see
[`docs/adr/0001-extension-architecture.md`](adr/0001-extension-architecture.md).

For the **implementation plan**, see [`docs/ROADMAP.md`](ROADMAP.md).

---

## Goals

- **Centralized management** — one source of truth for agents, skills, patterns, hooks
- **Flexibility** — every project can extend or override centrally without modifying central repo
- **Locality** — works offline, no publication, no plugin marketplace
- **Preserved workflow** — instant edit (via symlinks) → instant propagation
- **Convention over configuration** — minimum manifests, maximum native Claude Code mechanisms

## Three layers

```
┌─────────────────────────────────────────────────────────────────┐
│  L1: claude-patterns (central, /opt/projects/claude-patterns)   │
│                                                                  │
│  agents/                                                         │
│   ├── universal/         (tech-lead, product-owner, Explore...) │
│   └── stacks/<stack>/    (per stack profile)                    │
│  skills/                 (universal commands)                    │
│  commands/                                                       │
│  patterns/                                                       │
│   ├── <layer>/           (cross-layer, domain, application...)  │
│   ├── <stack>/           (sveltekit, flutter, nextjs...)        │
│   └── _stack-defaults/   ← always-include lists per stack       │
│       └── <stack>.yml                                            │
│  templates/                                                      │
│   ├── stack-presets/     (declarative "what to symlink")        │
│   └── project-orchestration/                                    │
└─────────────────────────────────────────────────────────────────┘
                            ↓ symlinks
┌─────────────────────────────────────────────────────────────────┐
│  L3: setup-project.sh (selective bridge)                        │
│                                                                  │
│  Universal     → ~/.claude/agents/    (global symlinks)         │
│  Stack-specific → project/.claude/agents/  (per-project)        │
│  Stack preset YAML decides what goes where                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│  L2: project /.claude/ (per-project overrides + extensions)     │
│                                                                  │
│  .claude/agents/             → Claude Code natively              │
│  .claude/skills/             → Claude Code natively              │
│  .claude/commands/           → Claude Code natively              │
│  .claude/hooks/              → Claude Code natively              │
│  .claude/output-styles/      → Claude Code natively              │
│  .claude/knowledge/patterns/ → /orchestrate Phase 0.5            │
│  .claude/config/project.yml  → THIN: stack_profile + minimal    │
│  CLAUDE.md                   → auto-injected                     │
│  .claude/settings.json       → hooks registration, permissions  │
└─────────────────────────────────────────────────────────────────┘
```

## Override matrix

Where you put files determines who sees them:

| Need | Location | Visibility |
|------|----------|------------|
| Add universal skill | `claude-patterns/skills/<cat>/<name>/SKILL.md` | All projects |
| Add project-only skill | `<project>/.claude/skills/<name>/SKILL.md` | One project |
| Add universal agent | `claude-patterns/agents/universal/<name>.md` | All projects |
| Add project-only agent | `<project>/.claude/agents/<name>.md` | One project |
| Override universal agent for one project | `<project>/.claude/agents/<same-name>.md` | One project (precedence wins) |
| Add global hook | `claude-patterns/hooks/foo.js` + `hooks/hooks.json` | All projects |
| Add project-only hook | `<project>/.claude/hooks/foo.js` + register in `.claude/settings.json` | One project |
| Add slash command | `commands/foo.md` (global) or `.claude/commands/foo.md` (project) | Global or project |
| Output style for strategist | `claude-patterns/output-styles/foo.md` (global) or `.claude/output-styles/foo.md` (project) | Global or project |
| Universal pattern | `claude-patterns/patterns/<layer>/foo.md` | All projects (discovered by /orchestrate) |
| Project-specific pattern | `<project>/.claude/knowledge/patterns/<cat>/foo.md` | One project (auto-discovered Phase 0.5) |
| "Always include for stack X" | `claude-patterns/patterns/_stack-defaults/<stack>.yml` | All projects of that stack |
| Static instructions (PII, naming, conventions) | `<project>/CLAUDE.md` | One project (auto-injected) |
| Stack identification | `<project>/.claude/config/project.yml` (one line) | Used by /orchestrate |

## Modifying `/orchestrate` per project — three escape hatches

Projects do **not** fork or modify the universal orchestrator agent. They
extend its behavior through three native mechanisms:

### 1. Add patterns (most common)

Drop a file in `.claude/knowledge/patterns/<category>/`. Phase 0.5 recursively
scans this directory and adds discovered patterns to `{PATTERNS}` block passed
to the implementer.

**Example** (juz-ide-api LocalHero security):
```
.claude/knowledge/patterns/security/civic-audience-invariants.md
.claude/knowledge/patterns/security/teryt-raw-input.md
.claude/knowledge/patterns/security/dual-identity.md
```

### 2. Hook on agent

Register a hook in `.claude/settings.json` that fires around orchestrator
phases. Useful for injecting extra context, blocking on violations, or
logging.

**Example** (planning-time security enforcement):
```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "command": ".claude/hooks/check-security-considerations.js" }
    ]
  }
}
```

### 3. Override orchestrator entirely (last resort, rare)

`.claude/agents/orchestrator.md` wins via per-project precedence. Use only
when the project genuinely needs a fundamentally different flow. **Drift
risk is high** — prefer hooks + patterns first.

## `/orchestrate` Phase 0.5 — full flow

```
1. Read .claude/config/project.yml
   → stack_profile = nestjs-ddd

2. Read claude-patterns/patterns/_stack-defaults/nestjs-ddd.yml
   → always_include: [
       cross-layer/security-invariants-pattern.md,
       cross-layer/safe-error-propagation-pattern.md,
       cross-layer/domain-errors-pattern.md,
       cross-layer/logger-pattern.md
     ]

3. Recursively scan .claude/knowledge/patterns/
   → discovers: security/civic-audience.md, security/teryt-input.md,
                 conventions/zod-schemas.md, ...

4. (Optional) Filter by task keywords if patterns have trigger_keywords
   → narrows down based on task scope

5. Combine into {PATTERNS} block
   → passed to implementer agent in Phase 3
```

## Concrete example — juz-ide-api with security

```
juz-ide-api/
├── CLAUDE.md                                  # mentions security/ in patterns
├── .claude/
│   ├── config/project.yml                     # stack_profile: nestjs-ddd
│   ├── hooks/
│   │   ├── check-security-considerations.js   # planning-time enforce
│   │   └── check-patterns-read.js             # impl-time enforce
│   ├── knowledge/patterns/
│   │   ├── README.md                          # discovery hub
│   │   └── security/
│   │       ├── civic-audience-invariants.md   # LocalHero-specific
│   │       ├── teryt-raw-input.md
│   │       └── dual-identity.md
│   └── settings.json                          # registers hooks, permissions
└── project-orchestration/
    ├── TEAM-STATE.md
    └── tasks/

claude-patterns/
├── patterns/
│   ├── _stack-defaults/
│   │   └── nestjs-ddd.yml                     # always_include list
│   └── cross-layer/
│       ├── security-invariants-pattern.md     # universal NestJS-DDD invariants
│       ├── safe-error-propagation-pattern.md
│       ├── domain-errors-pattern.md
│       └── logger-pattern.md
└── agents/stacks/nestjs-ddd/
    ├── domain-application-implementer.md       # one-liner: read .claude/knowledge/patterns/README.md
    └── security-e2e-verifier.md
```

### Flow when running `/orchestrate implement add-civic-audience-feature`

1. **Hook `check-security-considerations.js`** — blocks task save if `## Security Considerations` section missing
2. **Phase 0.5** — combines `_stack-defaults/nestjs-ddd.yml` + scan of `.claude/knowledge/patterns/` → `{PATTERNS}` includes both universal + LocalHero-specific
3. **Phase 3** — implementer reads patterns, writes code
4. **Hook `check-patterns-read.js`** — validates patterns were read before Write
5. **Phase 4B** — `security-e2e-verifier` agent acts as VETO gate

### Fast-path (direct agent invocation, bypassing /orchestrate)

When user calls `@domain-application-implementer` directly:

1. Agent has one-liner in system prompt: *"Before writing any file: read `.claude/knowledge/patterns/README.md` to discover relevant patterns, including security/."*
2. Agent reads README, discovers `security/`, reads patterns
3. Hook `check-patterns-read.js` validates Write only if patterns were read

Both paths converge on the same enforcement guarantees.

## Anti-patterns (avoid)

- ❌ Hardcoding project-specific rules into universal skills in `claude-patterns/skills/<universal>/SKILL.md`
- ❌ Adding "extras" lists to `project.yml` (`agents_extras`, `hooks_extras`, `patterns.always_include`, ...)
- ❌ Modifying universal orchestrator code per project — use hooks/patterns instead
- ❌ Per-project full copies of orchestrator agent (drift risk)
- ❌ Schema-heavy declarative manifests duplicating native discovery
- ❌ Plugin format / marketplace / release cycle for solo single-user setup

## What this architecture is NOT

- Not a plugin marketplace (intentionally — see ADR-0001)
- Not version-pinned per project (projects consume HEAD of claude-patterns)
- Not designed for multi-team distribution (single-user solo setup)
- Not a substitute for project-level CLAUDE.md (use both)

## Key properties

1. **Workflow preserved** — instant edit via symlinks works as before
2. **Zero ceremony for projects** — minimum declaration (one `stack_profile`)
3. **Scales to N projects** — each gets stack-defaults free + may add own
4. **Safe migrations** — changes propagate immediately, but every project has override layer
5. **Discoverable** — agents in fast-path read README, find patterns; `/orchestrate` scans known locations
6. **No schema drift** — minimal YAML/JSON to maintain (only `_stack-defaults/<stack>.yml` and thin `project.yml`)
