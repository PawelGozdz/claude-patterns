# `agents/shared/` — Cross-stack Reusable Agents

This folder is for agents used by **2+ stack presets but not all**.

## Decision tree: where does an agent belong?

```
Is the agent useful for EVERY project regardless of stack?
├── YES → agents/universal/  (gets symlinked to ~/.claude/agents/, available globally)
└── NO  → Is it bound to ONE specific stack?
         ├── YES → agents/stacks/{stack}/  (e.g., flutter-ui-verifier in flutter-clean-arch/)
         └── NO  → agents/shared/  (this folder; symlinked into multiple stack presets)
```

## Examples

| Agent | Folder | Why |
|---|---|---|
| `project-orchestrator` | `universal/` | Every project orchestrates work, regardless of stack |
| `tech-lead` | `universal/` | Backlog/health analysis is stack-agnostic |
| `state-reader` | `universal/` | Reading state files is stack-agnostic |
| `code-quality-verifier` (nestjs-ddd) | `stacks/nestjs-ddd/` | Bound to DDD/CQRS rules, not for Flutter or Python |
| `flutter-ui-verifier` | `stacks/flutter-clean-arch/` | Flutter widgets only |
| `domain-application-implementer` | `stacks/nestjs-ddd/implementers/` | DDD/Result<T>/CQRS specific — won't work for Flutter |
| `migration-runner` *(hypothetical)* | `shared/` | Mechanical TS refactors useful in nestjs-ddd + nextjs-app + typescript-library, but not for Python or Flutter |
| `swagger-doc-generator` *(hypothetical)* | `shared/` | Useful for nestjs-ddd + nextjs API routes; not for mobile/library |

## Symlinking convention

Stack agents that use a shared agent symlink it from inside their stack folder:

```bash
# Example: hypothetical migration-runner shared by 3 backend stacks
agents/shared/migration-runner.md  (real file)
agents/stacks/nestjs-ddd/migration-runner.md         → ../../shared/migration-runner.md
agents/stacks/nextjs-app/migration-runner.md         → ../../shared/migration-runner.md
agents/stacks/typescript-library/migration-runner.md → ../../shared/migration-runner.md
```

`scripts/setup-project.sh` already iterates `agents/stacks/{stack}/*.md` — so a
symlinked shared agent is picked up transparently. No script change needed.

## When to promote/demote

- A `shared/` agent used by **all** stacks → promote to `universal/`.
- A `shared/` agent used by **only one** stack → demote to that `stacks/{x}/`.

## Current contents

(empty — placeholder for future cross-stack agents)
