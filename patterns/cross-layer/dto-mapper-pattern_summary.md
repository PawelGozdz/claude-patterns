# Rule Card: Dto Mapper

**Tags**: "api:app"
**Pattern**: `patterns/cross-layer/dto-mapper-pattern.md`
**Layer**: Cross-layer
**Level**: quickstart

## Why this card exists

Two `Result.ok({...})` literals in one handler can silently apply two different rules to
the same derived field — confirmed in production as `paymentRequired` being hardcoded
`false` on one branch while computed correctly on another.

## Rules

| ID | Rule | Failure if broken |
|----|------|-------------------|
| **DM1** | A command handler's success response is assembled by ONE named `toXxxResult(...)` function, called from the handler's single `Result.ok(...)`. | Multiple inline DTO literals must be kept in sync by hand on every field addition; drift between them ships silently. |
| **DM2** | Any field on the DTO that is DERIVED (not a 1:1 aggregate read) is computed by exactly one expression, inside the mapper. | Two return paths can compute the same derived field two different ways — confirmed: `paymentRequired: false` hardcoded on one branch, `!fee.isZero()` on another, in the same handler. |
| **DM3** | The mapper is a pure, synchronous function — no DI, no ACL calls, no repository reads. Every value it needs is passed in as a parameter, already computed by the caller. | A mapper doing I/O becomes a second undocumented place a context talks to pricing/ACLs, breaking the "one seam" the pattern exists to create. |
| **DM4** | The mapper is co-located with the command it serves (same folder as `handler.ts`), not in a shared cross-command file. | A shared mapper file becomes a false shared abstraction the moment two commands' DTO shapes diverge even slightly. |
| **DM5** | A single return path with zero derived fields does NOT need a mapper — inline `Result.ok({...})` is fine. | Forcing a mapper on trivial 1:1 responses adds an indirection with nothing to consolidate. |

<!-- Karta to jest to, co realnie wkleja się do promptu implementera (§2b′ w
     commands/orchestrate.md). Limit ~8 KB — powyżej lint-patterns.mjs ostrzega, bo to
     znak, że wzorzec potrzebuje podziału. -->
