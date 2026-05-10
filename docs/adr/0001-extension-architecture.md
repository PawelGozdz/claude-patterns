# ADR-0001: Extension architecture for claude-patterns

- **Status**: Accepted
- **Date**: 2026-05-10
- **Deciders**: Repo maintainer (single-user solo setup)
- **Supersedes**: —

## Context

`claude-patterns` is a single source of truth for software patterns, agents,
skills, hooks, and commands shared across multiple Claude Code projects on the
same machine. As the repo grows and individual projects accumulate
project-specific needs (e.g. LocalHero/`juz-ide-api` security invariants), we
needed to decide how projects extend or override the central content without
either:

1. Polluting `claude-patterns` with project-specific rules
2. Forcing every project to copy and diverge content
3. Introducing release-cycle ceremony incompatible with the solo workflow

Three options were on the table:

**Option A — Plugin format / marketplace.**
Package `claude-patterns` as a Claude Code plugin (`.claude-plugin/plugin.json`)
or marketplace with multiple modular plugins. Projects install via
`claude plugin install`.

**Option B — Fat manifest.**
Extend `.claude/config/project.yml` with declarative lists:
`patterns.always_include`, `agents_extras`, `hooks.pre_implement`,
`skills_extras`, etc. Orchestrator reads the manifest and applies.

**Option C — Convention over configuration (chosen).**
Keep `project.yml` thin (just `stack_profile` + minimal config). Use Claude
Code native per-project subdirectories (`.claude/agents/`, `.claude/skills/`,
`.claude/commands/`, `.claude/hooks/`, `.claude/output-styles/`,
`.claude/knowledge/patterns/`) for everything project-specific. Use a small
declarative `patterns/_stack-defaults/<stack>.yml` in `claude-patterns` for
"always-include" pattern lists per stack profile.

## Decision

**We adopt Option C (convention over configuration).**

### Three-layer model

1. **L1 — `claude-patterns` (central, shared via symlinks):**
   universal agents/skills/commands/patterns + per-stack defaults declared
   in `patterns/_stack-defaults/<stack>.yml`.

2. **L2 — Per-project `.claude/` directories (Claude Code native):**
   project-specific agents, skills, commands, hooks, output-styles, patterns,
   instructions (`CLAUDE.md`), and minimal `.claude/config/project.yml`
   (stack_profile only).

3. **L3 — `setup-project.sh` selective symlinks:**
   bridges L1↔L2. Universal content goes to global `~/.claude/` symlinks;
   stack-specific content goes to per-project `.claude/` symlinks driven by
   declarative stack-preset YAML.

### Override precedence (verified in Claude Code docs 2026-05-10)

```
managed > CLI flag > .claude/settings.local.json > .claude/settings.json > ~/.claude/settings.json
```

Project-level files (`.claude/agents/foo.md`) override globals by name match.

### Extension mechanism — projects extend `/orchestrate` without modifying it

1. **Add patterns** → drop file in `.claude/knowledge/patterns/`. Phase 0.5
   recursive scan picks it up automatically.
2. **Hook on agent** → add `.claude/hooks/foo.js` registered in
   `.claude/settings.json` as PreToolUse / PostToolUse / SubagentStart, etc.
3. **Override agent entirely** (last resort) → `.claude/agents/orchestrator.md`
   wins via precedence.

## Consequences

### Positive

- **No release ceremony.** Edit-once-propagate-via-symlinks workflow preserved.
- **Zero schema bloat.** `project.yml` stays one-line for most projects.
- **Skinny manifest never drifts.** `_stack-defaults/<stack>.yml` is the only
  YAML to maintain across all projects of a given stack.
- **Native discovery wins.** Claude Code natively reads `.claude/agents/`,
  `.claude/skills/`, etc. — we don't reimplement what the runtime already does.
- **Safe migrations.** Changing `claude-patterns` affects all projects
  immediately, but each project has its own override layer.

### Negative

- **Implicit > explicit.** New contributors must learn convention locations
  (`.claude/knowledge/patterns/security/...` vs `patterns/cross-layer/...`).
  Mitigated by `docs/ARCHITECTURE.md` and per-project pattern README files.
- **No version pinning.** Projects always consume HEAD of `claude-patterns`.
  Acceptable for solo setup; would need revisiting for multi-user team.
- **No public sharing.** We accept this — repo is intentionally local-only.

### Neutral

- `_stack-defaults/<stack>.yml` introduces one new declarative file per stack.
  Lightweight — pure list of pattern paths to always include.

## Alternatives considered (and rejected)

### Option A — Plugin format / marketplace

**Rejected.** Forces release cycle (bump version, reinstall after edits) without
proportional benefit for a solo single-user setup. Loses the instant-edit
symlink workflow which is the maintainer's biggest asset. Useful only if/when
the repo gets external consumers.

### Option B — Fat `project.yml` manifest

**Rejected.** Schema drift risk (one Python script change breaks all projects),
duplicates Claude Code native `.claude/<subdir>/` discovery, single point of
bloat (every new feature adds another field), implicit precedence conflicts
between manifest entries and filesystem files.

### Option D — Hybrid (thin project.yml + per-pattern frontmatter)

**Rejected for now.** Pattern frontmatter (`always_include: true`,
`trigger_keywords: [auth, geo]`, `applies_to_stacks: [nestjs-ddd]`) is more
self-describing but requires retrofitting all existing pattern files. Can be
revisited if `_stack-defaults/<stack>.yml` proves insufficient.

## Validation

The chosen architecture must support these scenarios:

| Scenario | How |
|---|---|
| Add custom skill to one project | `.claude/skills/foo/SKILL.md` |
| Override universal agent for one project | `.claude/agents/<name>.md` |
| Add stack-wide always-include pattern | edit `_stack-defaults/<stack>.yml` |
| Add project-specific security rules (LocalHero) | `.claude/knowledge/patterns/security/*.md` |
| Hook into agent for one project | `.claude/hooks/foo.js` + register in `settings.json` |
| Modify orchestrator behavior for one project | hooks (preferred) or full override (last resort) |

All six are supported by Option C with no special-case code in
`claude-patterns`.

## References

- `docs/ARCHITECTURE.md` — full technical reference
- `docs/ROADMAP.md` — implementation plan
- Claude Code docs (verified 2026-05-10): hook events, skill frontmatter,
  per-project subdirectory precedence
