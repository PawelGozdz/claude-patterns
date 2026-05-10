# Patterns — `.claude/knowledge/patterns/`

This directory holds **canonical patterns** the orchestrator and implementer
agents read before writing code. Patterns come from two sources:

1. **Global patterns** — symlinked from `claude-patterns/patterns/` (subdirs).
   These are stable, reused across all projects of this stack.
2. **Project-specific patterns** — under directories you create here (e.g.
   `security/`, `conventions/`, `compliance/`). These capture rules unique
   to this project that other projects shouldn't inherit.

> The orchestrator (`/orchestrate` Phase 0.5) and direct-invoked implementers
> read this README **first** to discover what's available. Keep it accurate
> when you add or rename categories.

---

## Categories present in this project

> Edit this list as you add project-specific categories. Symlinked global
> categories appear automatically.

### Global (symlinked from `claude-patterns/patterns/`)

| Category | What it covers |
|----------|---------------|
| `cross-layer/` | Conventions, error handling, logger, security invariants — applies everywhere |
| `_stack-defaults/` | Per-stack always-include lists (read by orchestrator Phase 0.5a') |
| `architecture/` | High-level architecture patterns (transactional outbox, ACL registry, etc.) |
| `testing/` | Testing pyramid, fixtures, mocks |
| `orchestration/` | PM-system, task lifecycle |
| _stack-specific_ | `domain/`, `application/`, `infrastructure/` (DDD); or `flutter/`, `sveltekit/`, etc. |

### Project-specific (created locally — edit this section per project)

> Empty by default. Add as your project grows.
>
> Examples:
> - `security/` — project-specific threat models, sensitive-data invariants
> - `compliance/` — GDPR/CCPA/sector regulations specific to your business
> - `conventions/` — internal naming, folder structure unique to this codebase

---

## MUST-READ before implementation

These patterns apply to **every** task, regardless of feature scope. The
orchestrator already includes them in `{PATTERNS}` via
`_stack-defaults/<stack>.yml`, but if you're invoked directly (fast-path)
read them first:

- `cross-layer/conventions-pattern.md` — file naming, layer separation
- `cross-layer/security-invariants-pattern.md` — 5 universal security rules
- `cross-layer/safe-error-propagation-pattern.md` — no error leakage
- `cross-layer/domain-errors-pattern.md` — Result<T> discipline
- `cross-layer/logger-pattern.md` — PII-safe logging

Plus any project-specific patterns under `security/`, `compliance/`, etc.

---

## Quick reference — what to read for what task

| Writing… | Read first |
|----------|-----------|
| Controller / endpoint | `cross-layer/security-invariants-pattern.md`, `infrastructure/controller-schema-pattern.md` |
| Command / query handler | `application/command-handler-pattern.md`, `application/query-handler-pattern.md` |
| Aggregate / value object | `domain/aggregate-pattern.md`, `domain/value-object-pattern.md` |
| Repository | `infrastructure/repository-pattern.md`, `cross-layer/safe-error-propagation-pattern.md` |
| E2E test | `testing/e2e-hybrid-fixture-pattern.md`, `testing/testing-pyramid-pattern.md` |
| Unit test | `testing/golevelup-mock-pattern.md`, `testing/testing-pyramid-pattern.md` |
| Migration | `infrastructure/repository-pattern.md`, `architecture/transactional-outbox-pattern.md` |
| Anything touching auth/permission/PII | `cross-layer/security-invariants-pattern.md` + `security/*` (if project has it) |

---

## How patterns enter agent prompts

```
1. Orchestrator reads .claude/config/project.yml → stack_profile
2. Orchestrator reads patterns/_stack-defaults/<stack>.yml → always_include + trigger_includes
3. Orchestrator scans this directory recursively → discovers project patterns
4. Orchestrator combines all into {PATTERNS} → passed to implementer agent
5. PreToolUse hook check-patterns-read.js blocks Write if patterns weren't Read
```

Direct agent invocation (without orchestrator) bypasses steps 1-4 — that's
why agents have a fallback instruction to read THIS README first when the
`{PATTERNS}` list is missing.

---

## Adding a new project-specific category

1. Create `<category>/` directory here
2. Add pattern files following the global naming convention
   (`<topic>-pattern.md` with frontmatter at top)
3. **Update the "Project-specific" table above** so future readers/agents
   discover the new category
4. If the patterns should be in EVERY task for this stack, add their paths
   to `claude-patterns/patterns/_stack-defaults/<stack>.yml` `always_include`
   list (NOTE: only if reusable across projects of this stack — for
   project-only invariants, just having them here is enough since Phase 0.5
   scans recursively)

---

## See also

- `claude-patterns/docs/ARCHITECTURE.md` — full extension model
- `claude-patterns/docs/adr/0001-extension-architecture.md` — design rationale
- `claude-patterns/patterns/README.md` — global patterns catalog (38+ patterns)
- `claude-patterns/patterns/_stack-defaults/README.md` — stack-defaults schema
