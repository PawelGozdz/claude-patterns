# Rule: Repository
**Governs**: `patterns/infrastructure/repository-pattern.md` (card: `repository-pattern_summary.md`), `mapper-pattern.md`
**Applies to**: `*.repository.ts` in `**/infrastructure/repositories|persistence/`; ports in `**/domain/repositories/`; RP12/N7 additionally cover `*.cron.ts`/`*.scheduler.ts`/`*.job.ts` under `**/infrastructure/**` and services in `**/application/services/`

## ALWAYS
- Implement the domain port interface (from `domain/repositories/`) — layer separation.
- Extend `BaseKyselyRepository` for command (write-side) repos; query repos do NOT extend it.
- Persist AND dispatch the aggregate's events inside `save()`/`delete()` (via `BaseKyselyRepository`).
- Map domain ↔ persistence through a dedicated mapper; return domain objects, never raw rows.
- Read and increment the `version` column on `save()` (optimistic locking).
- Register EVERY context domain event in `eventMap` using the EVENT_NAME enum (alphabetical imports).
- On an unknown event type: `console.warn` the name + known keys; never silently `return null`.
- Keep an L1 verification test that scans `domain/events/*.event.ts` against `eventMap` (CI blocker).
- Query repos: explicit columns in `SELECT`, dedicated query-model mappers, custom SQL via `sql<Type>` template literal.
- **RP12** — A cron, scheduler, job or application service that needs data operations on an aggregate goes through the repository PORT, never through an injected raw DB client. When there genuinely is no port for the query (reporting-shaped read across contexts, one-off maintenance script), the exception needs both a `// RP12-EXCEPTION: <reason>` comment above the injecting constructor/field AND an entry in the pattern's "Exceptions" section — an undocumented exception is indistinguishable from someone not knowing the rule.

## NEVER
- Return raw DB rows (`RowType`) instead of a domain object — the mapper is mandatory.
- Put business logic (domain rules/conditions) in the repository — I/O and mapping only.
- Import from another bounded context without going through the ACL Registry.
- Hardcoded string keys instead of the enum in `eventMap` — no compile-time safety.
- Skip an event in `eventMap` because it's "not used yet" — runtime bug in production.
- Throw a `DomainError` on a version conflict — that's an infrastructure exception.
- **N7** — `@Inject(DATABASE_TOKEN)` (or any raw DB client) in a class outside `**/infrastructure/repositories|persistence/` with no `// RP12-EXCEPTION: <reason>` annotation. Breaks layer separation and testability: the caller can no longer be tested against a port double, and the query escapes every rule the repository enforces (mapper, event dispatch, optimistic locking).

## Why
The repository is the only place domain meets the database; leaking rows or
business rules across that line corrupts the layering. RP12/N7 exist because the
line is easiest to cross from OUTSIDE the repository — a cron job with a raw
client looks harmless and bypasses mapper, event dispatch and version checks in
one move (found live in the first `/orchestrate` run on juz-ide-api-1, 2026-07-05). The `eventMap` is the
event-rehydration source of truth — a missing or string-keyed entry produces a
silent runtime failure, which the mandatory verification test exists to catch.
