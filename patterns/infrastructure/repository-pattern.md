# Repository Pattern (stub — see claude-patterns/patterns/infrastructure/repository-events-pattern.md)

This project uses Kysely query-repository pattern for read-side CQRS:
- Select explicit columns in findBy* methods
- Map rows in private mapToOwnerQueryModel / mapToPublicQueryModel helpers
- Use sql<Type>`` template for non-standard types (enums, casts)
- No BaseKyselyRepository for query-only repos (no event handling needed)
