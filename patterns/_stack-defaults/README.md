# `_stack-defaults/` — declarative always-include patterns per stack

This directory holds one YAML file per stack profile. The
[`/orchestrate`](../../commands/orchestrate.md) skill reads
`<stack_profile>.yml` in **Phase 0.5a'** to determine which patterns are
always included in `{PATTERNS}` for every implementation/verification task
in that stack.

## Why this exists

Without this layer, "always-include" patterns must be hard-coded in the
orchestrator skill. That couples the orchestrator to specific patterns and
makes per-stack evolution difficult. With this layer, each stack declares
its own defaults, project-specific patterns get discovered alongside, and
the orchestrator stays generic.

See [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) for the full
extension model.

## Schema

```yaml
stack_profile: <name, must match project.yml stack_profile>

always_include:
  # Patterns added to {PATTERNS} for EVERY task in this stack
  - <path relative to claude-patterns/patterns/>
  - cross-layer/conventions-pattern.md
  - ...

trigger_includes:
  # Patterns added when task description matches keywords
  - keywords: [auth, permission, login]
    include:
      - cross-layer/security-invariants-pattern.md
  - keywords: [aggregate, entity, value object]
    include:
      - domain/aggregate-pattern.md
      - domain/value-object-pattern.md
```

### Path conventions

- Paths are **relative to `claude-patterns/patterns/`**, NOT to
  `.claude/knowledge/patterns/`. The orchestrator translates them.
- Use forward slashes
- Verify each path exists before adding (orchestrator does NOT validate;
  missing path = silent omission)

### When to use `always_include` vs `trigger_includes`

- **`always_include`**: invariants every task must respect (security,
  conventions, error handling). Keep small (≤ 6 patterns) — these load
  for every task and inflate token cost otherwise.
- **`trigger_includes`**: layer-scoped or feature-scoped patterns that
  only matter for some tasks. Don't duplicate Step 0.5b keyword heuristics
  unnecessarily — only override when stack-specific.

## Adding a new stack

1. Verify `agents/stacks/<stack>/` and `patterns/<stack>/` exist (or
   `cross-layer/` patterns suffice)
2. Create `_stack-defaults/<stack>.yml` following the schema above
3. Test by reading the file in `/orchestrate` Phase 0.5a' against a
   project with `stack_profile: <stack>` in `project.yml`

## Current stacks

| Stack | File | always_include count |
|-------|------|---------------------|
| nestjs-ddd | `nestjs-ddd.yml` | 5 |
| sveltekit | (not yet created) | — |
| flutter-clean-arch | (not yet created) | — |
| nextjs-app | (not yet created) | — |
| python | (not yet created) | — |
| typescript-library | (not yet created) | — |

The orchestrator gracefully skips Step 0.5a' when the YAML for the current
stack doesn't exist — only `nestjs-ddd` ships with stack-defaults today.
Add YAMLs for other stacks as their always-include lists become clear.
