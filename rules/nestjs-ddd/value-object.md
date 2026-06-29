# Rule: Value Object
**Governs**: `patterns/domain/value-object-pattern.md` (card: `value-object-pattern_summary.md`)
**Applies to**: `*.vo.ts` in `**/domain/value-objects/`

## ALWAYS
- Extend `BaseValueObject<Props>` — without exception, including enum-based VOs.
- Keep the constructor `private`; create via `static create(...)` returning `Result<VO, ValidationError>`.
- Make all fields `readonly`; expose via getters only — zero setters (immutability).
- Normalize in the factory: trim whitespace, lower/upper-case where required.
- Validate FORMAT/STRUCTURE only — length, range, regex, shape.
- Implement `getEqualityComponents()` (correct `.equals()`) and `validate(props)`.
- Keep computed methods pure — no side effects, no async.
- For enum-based VOs: `declare public readonly value: EnumType` (re-declare, no JS emit).

## NEVER
- Business rules in a VO — format/structure only; business logic goes to a Specification.
- Import from `infrastructure/` or external deps (DB, HTTP).
- `async`/`Promise` — value objects are synchronous.
- Setters or mutable fields.
- Direct `new XxxVO(...)` outside the factory.
- A plain class instead of `extends BaseValueObject` — you lose `.equals()`, hashing, and the DDD contract.

## Why
Value objects are immutable, equality-by-value building blocks. The base class
provides the equality and hashing contract the rest of the domain depends on, so
a plain class silently breaks comparisons. Confining them to format validation
keeps the business/format split clean (business rules live in Specifications).
