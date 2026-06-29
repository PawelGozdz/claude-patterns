# Rule: Aggregate
**Governs**: `patterns/domain/aggregate-pattern.md` (card: `aggregate-pattern_summary.md`)
**Applies to**: `*.aggregate.ts` in `**/domain/aggregates/`

## ALWAYS
- Extend `AggregateRoot<string>` — verify the base class on every aggregate.
- Keep the constructor `private`/`protected`; create only via `static create(...)` returning `Result<T, DomainError>`.
- Hydrate from persistence via `static reconstituteFromPersistence(id, props, version)` — no events emitted.
- Return `Result<T, DomainError>` (or `Result.empty()`) from every method.
- Keep all logic SYNCHRONOUS — no `async`, no infrastructure access.
- Store private `_fields`, expose via getters only (immutability).
- Mutate state only through `this.apply(new XxxDomainEvent(...))`.
- Emit events with GDPR segregation: `piiData`, `anonymizedData`, `businessData`, `cryptoShredding`.
- Expose `getSpecificationContext()` for policy/spec evaluation.
- Put only business rules here; delegate format validation to value objects.
- Update `BUSINESS_RULES.yaml` in the same change whenever an invariant changes.

## NEVER
- `throw` — always `Result.fail(...)` (domain-purity invariant).
- `async`/`Promise` in aggregate methods.
- Import from `infrastructure/` or `application/`.
- Format validation (regex/length) — that belongs in value objects.
- Direct `new XxxAggregate(...)` outside the factories.
- Emit an `IntegrationEvent` from an aggregate — DomainEvent only; the handler emits integration events.
- Emit an event missing `cryptoShredding` metadata (`piiFields`, `retentionPeriod`, `isShredded`).

## Why
The aggregate is the consistency boundary and must stay a pure, deterministic
function of its inputs. Throwing or going async couples it to infrastructure
and breaks the Result-based error contract every layer above relies on. Events
carry the GDPR segregation needed for crypto-shredding and audit downstream.
