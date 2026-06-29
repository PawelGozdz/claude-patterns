# Rule: Result Pattern (Result<T>)
**Governs**: `patterns/domain/aggregate-pattern.md`, `domain-service-pattern.md`, `patterns/application/*` (ADR-0013)
**Applies to**: all domain and application code (`**/domain/**`, `**/application/**`)

## ALWAYS
- Return `Result<T, DomainError>` (or `Result.empty()` for void) from every domain operation that can fail.
- Construct outcomes with `Result.ok(value)` / `Result.fail(error)` / `Result.empty()`.
- Propagate failures explicitly: `if (r.isFailure) return Result.fail(r.error);` — check before unwrapping.
- Unwrap only after a success check — read `r.value` solely when `r.isSuccess`.
- Use typed domain errors (`XxxDomainError`, `XxxValidationError`) as the `E` channel, not bare `Error`.
- Map a `Result` to an HTTP error at the controller boundary only (translate `Result.fail` → response there).
- Keep `Result` synchronous in the domain; wrap in `Promise<Result<T, E>>` only at the application layer (handlers/services).

## NEVER
- `throw` anywhere in the domain layer — exceptions break domain purity; failure is data, not control flow.
- Access `r.value` without first checking `r.isSuccess`/`r.isFailure`.
- Swallow a failed `Result` (ignore it, log-and-continue) — propagate or handle it explicitly.
- Convert a `Result.fail` into a thrown exception inside domain/application logic to "simplify" a caller.
- Return `null`/`undefined` to signal failure where a `Result` is expected.

## Why
`Result<T>` makes failure an explicit, typed part of every signature, so the
compiler forces callers to handle it — unlike exceptions, which travel invisibly
and can be swallowed. A single throw in the domain reintroduces hidden control
flow and couples pure logic to a try/catch in infrastructure. Exceptions are
permitted only at true infrastructure boundaries (e.g. optimistic-lock conflicts).
