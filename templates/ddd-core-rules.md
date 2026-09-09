## DDD Rules

These apply because this project composes the `ddd/core` block. They used to
sit unconditionally in `~/.claude/CLAUDE.md`, one line above "do not assume
NestJS/TypeScript" — which meant every Flutter, Python and docs-only project
carried them too. Moved here 2026-09-07 (K111) so the rules arrive only where
they hold.

- The domain layer is pure: no infrastructure imports, no thrown exceptions.
- Domain operations return `Result<T>` rather than throwing.
- Contexts talk to each other through the ACL Registry or domain events. Nothing else.
- `BUSINESS_RULES.yaml` tracks the code. Change an aggregate, update it in the same commit.
- Test pyramid: L1 ~50%, L2 ~30%, L3 ~20%.

When editing domain files, check the base class the type is meant to extend
(`AggregateRoot`, `ValueObject`, and so on) before writing the body — getting
this wrong is the single most common finding in review.
