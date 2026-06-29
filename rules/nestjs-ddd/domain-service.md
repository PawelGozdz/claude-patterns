# Rule: Domain Service
**Governs**: `patterns/domain/domain-service-pattern.md` (card: `domain-service-pattern_summary.md`)
**Applies to**: `*.domain-service.ts` in `**/domain/services/`

> Use a domain service only for cross-aggregate logic or complex policies
> (3+ specifications). Single-aggregate logic stays inline in the aggregate.

## ALWAYS
- Annotate with `@Injectable()` — a domain service is a NestJS provider.
- Keep it STATELESS — data arrives via method parameters only, no instance fields.
- Return `Result<T, DomainError>` from every public method.
- Receive ready-made domain objects (aggregates, VOs) — the handler loads, the service validates.
- Keep logic SYNCHRONOUS — no `async`/`await`.
- Encapsulate complex rules via `PolicyBuilder` / `createXxxPolicy()`.
- Have the application handler call the domain service BEFORE the aggregate method.
- Locate the file under `**/domain/services/`, beside aggregates and domain errors.

## NEVER
- `throw` — always `Result.fail(new XxxDomainError(...))`.
- `async`/`await`/`Promise` — the domain service is synchronous.
- Import from `infrastructure/` or `application/` (repos, HTTP, email, event bus).
- Inject infrastructure dependencies in the constructor (`IUserRepository`, `IEmailService`, ...).
- Hold instance state (caches, "current" aggregate fields).
- Accept an ID and load the aggregate itself — the handler loads, the service validates.

## Why
A domain service exists to express logic that doesn't naturally belong to one
aggregate. Statelessness and synchronicity keep it a pure function over domain
objects; injecting repositories or going async would smuggle infrastructure into
the pure domain and make the same call non-deterministic across runs.
