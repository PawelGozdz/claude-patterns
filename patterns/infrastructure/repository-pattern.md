# Repository Pattern (stub — see claude-patterns/patterns/infrastructure/repository-events-pattern.md)

**Tags**: "api:data-access"
**Level**: quickstart

## Rules

This project uses Kysely query-repository pattern for read-side CQRS:
- Select explicit columns in findBy* methods
- Map rows in private mapToOwnerQueryModel / mapToPublicQueryModel helpers
- Use sql<Type>`` template for non-standard types (enums, casts)
- No BaseKyselyRepository for query-only repos (no event handling needed)

## When to Use

**Use this stub for:**
- ✅ orientation only — it points at the real pattern, it is not the pattern

**Do NOT use for:**
- ❌ deciding repository shape — read `repository-events-pattern.md`, which this stub links to
