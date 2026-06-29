# Rule: Entity
**Governs**: `patterns/domain/entity-pattern.md` (card: `entity-pattern_summary.md`)
**Applies to**: `*.entity.ts` in `**/domain/**/entities/`

> Entity ≠ Aggregate. An entity has identity and belongs to an aggregate but is
> NOT an aggregate root. It does not emit domain events — the aggregate does.
> Choose an entity for simple identity-bearing state without events.

## ALWAYS
- Extend `BaseEntity<TProps, TId>` (NOT `AggregateRoot`) — verify the base class.
- Keep the constructor `private`/`protected`; create via `static create(...)` returning `Result<T, DomainError>`.
- Hydrate via `static reconstruct(props, id)` — no validation, no events.
- Return `Result<T, DomainError>` (or `Result.empty()`) from every business method.
- Keep logic SYNCHRONOUS — no `async`, no infrastructure access.
- Use identity-based equality (compare by ID); implement `isValid()` (required by `BaseEntity`).
- Validate via Specifications, not inline regex/string-length.
- Expose props through getters; mutate `this.props.*` only inside entity methods.

## NEVER
- `throw` — always `Result.fail(...)`.
- `async`/`Promise` in entity methods.
- Import from `infrastructure/` or `application/`.
- Emit domain events (`this.apply(...)`) — that is the aggregate's job.
- Public constructor — it bypasses the factories.
- Value-based `equals()` (comparing props instead of ID) — duplicates won't be detected.
- Business logic in the constructor — it belongs in `create()` + a Specification.

## Why
Entities live inside an aggregate's consistency boundary, so event emission and
cross-aggregate orchestration are not theirs to own. Identity-based equality is
what makes them distinguishable within a collection; value-based equality silently
collapses distinct entities. Keeping them pure and sync preserves the domain invariant.
