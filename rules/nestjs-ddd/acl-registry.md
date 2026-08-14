# Rule: ACL Registry (cross-context)
**Governs**: `patterns/architecture/acl-registry-pattern.md` (card: `acl-registry-pattern_summary.md`) — ADR-0032, 0037
**Applies to**: `*.adapter.ts` in `**/infrastructure/acl/`, consumer ports calling cross-context, module registration

## ALWAYS
- Communicate cross-context ONLY via `aclRegistry.getGlobalRequired<T>(key)` or domain/integration events.
- Inject `ACLRegistryService` with `@Inject(ACL_REGISTRY_SERVICE)` (NestJS token, not class injection).
- Define the adapter interface inline at the call site (`getGlobalRequired<{ method(...): ... }>(key)`) — no class imports from the provider context.
- Register the adapter in the provider module's `onModuleInit()`: `registerGlobal(key, adapter, description)`.
- Have adapters implement `IACLAdapter`, live in the provider's `**/infrastructure/acl/`, and return `Result<T, Error>`.
- Use a lowercase context-name key (`'authorization'`, `'auth'`, `'geographic-auth'`).
- Fetch the adapter inside the method (not the constructor) — guarantees init order.
- Use the dot-notation EVENT_NAME enum as the single source of truth for event-based cross-context messaging.
- Batch a cross-context call that would otherwise repeat per unit of work (per level/tier/item) —
  one adapter method taking the full list in, one round trip out (TS-REACH-SYSTEM-001 D6).

## NEVER
- Call a per-item ACL method in a loop when the caller already knows the full set up front —
  N+1 across a bounded-context boundary still costs a real round trip per iteration.
- `import { XxxModule } from '@contexts/xxx/...'` in another context — creates circular deps and breaks BC isolation.
- Import another context's adapter/API class — defeats the whole pattern.
- Resolve the adapter in the constructor — it may not be registered yet.
- `throw` from an adapter method — always `Result.fail(new Error(...))`.
- Omit `implements OnModuleInit` in the provider module — the adapter never reaches the registry.
- Import the provider module in a consumer — import only the global `ACLModule`.
- A persistent DB trigger/function in one bounded context's table READING another context's
  table (e.g. a trigger on `contextA.foo` selecting from `contextB.bar`) — `dependency-cruiser`
  scans the TypeScript import graph, not DDL, so this coupling is structurally invisible to the
  tool the project relies on to enforce BC isolation; it is the same violation as a direct
  cross-context `import`, one layer lower (TS-GEO-SPATIAL-QUERY-AUDIT-002 D9). Read through an
  ACL adapter in the command handler before the write instead. **Narrow exception**: a
  one-shot, irreversible BACKFILL migration MAY join a cross-context table, provided (a) it
  runs exactly once and is not a standing mechanism, (b) the migration body documents the
  precedent inline, and (c) the source-side join always carries `deleted_at IS NULL` as
  defense-in-depth (D25) — this exception does NOT cover a permanent trigger/function that
  fires on every write.

## Why
Bounded contexts must stay independently deployable and free of circular
dependencies. The registry is a runtime indirection: consumers depend on an
inline interface and a string key, never on the provider's code. Constructor
resolution races module initialization, so adapters are always fetched lazily
inside methods. Asynchronous integration uses events keyed by the EVENT_NAME enum.
