# NestJS-DDD Coding Rules

Stack-specific, enforceable coding rules for the **nestjs-ddd** stack. Each file
is a concise ALWAYS/NEVER contract distilled from the canonical pattern it links
to under `patterns/`. Read these BEFORE implementing; consult the full pattern
(and its `_summary.md` rule card with rule IDs) when you need rationale or examples.

These rules complement — they do not replace — `rules/common/` (immutability,
file organization, error handling) and `rules/typescript/`.

## Core invariants (apply across all files)

- **Domain is PURE** — no `infrastructure/`/`application/` imports, no thrown exceptions.
- **`Result<T>` always** — failure is typed data, never an exception, in domain + application.
- **Immutability** — new objects, never mutate; private fields, getters only.
- **Verify base classes** — `AggregateRoot`, `BaseEntity`, `BaseValueObject`.
- **NestJS DI** — `@Inject()` on every dependency; register handlers in `providers[]` / `onModuleInit`.
- **Cross-context** — only via ACL Registry or domain events (dot-notation EVENT_NAME enum as SSoT).
- **`BUSINESS_RULES.yaml`** — keep in sync with code whenever an invariant changes.

## Index

| Rule | One-liner | Full pattern |
|------|-----------|--------------|
| [aggregate.md](./aggregate.md) | Aggregate roots: factories, Result, sync, event emission with GDPR segregation. | `patterns/domain/aggregate-pattern.md` |
| [entity.md](./entity.md) | Entities: identity-based equality, no events, pure & sync (entity ≠ aggregate). | `patterns/domain/entity-pattern.md` |
| [value-object.md](./value-object.md) | Value objects: immutable, format-only validation, equality components. | `patterns/domain/value-object-pattern.md` |
| [domain-service.md](./domain-service.md) | Stateless cross-aggregate/policy logic; takes domain objects, returns Result. | `patterns/domain/domain-service-pattern.md` |
| [result-pattern.md](./result-pattern.md) | `Result<T>` everywhere — zero throw in domain, explicit failure propagation. | ADR-0013 (across domain + application patterns) |
| [repository.md](./repository.md) | Ports + mappers, event dispatch on save, `eventMap` enum SSoT, optimistic locking. | `patterns/infrastructure/repository-pattern.md` |
| [acl-registry.md](./acl-registry.md) | Cross-context only via ACL Registry or events; no cross-BC imports. | `patterns/architecture/acl-registry-pattern.md` |
| [application-handlers.md](./application-handlers.md) | Command/query handlers: orchestration only, `@Inject()`, auto-discovery, userId from context. | `patterns/application/command-handler-pattern.md`, `query-handler-pattern.md` |

## Related patterns not (yet) given a dedicated rule file

- Domain events — `patterns/domain/domain-event-pattern.md` (covered inline by aggregate.md; see its rule card for the full event contract).
- Specifications & policies — `patterns/domain/specification-policy-pattern.md`.
- Mappers — `patterns/infrastructure/mapper-pattern.md` (covered inline by repository.md).
- Application services / sagas — `patterns/application/application-service-pattern.md` (covered inline by application-handlers.md).
- Controller schema — `patterns/infrastructure/controller-schema-pattern.md`.
- Audit handlers — `patterns/application/audit-handler-pattern.md`.
