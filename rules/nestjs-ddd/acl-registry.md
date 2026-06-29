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

## NEVER
- `import { XxxModule } from '@contexts/xxx/...'` in another context — creates circular deps and breaks BC isolation.
- Import another context's adapter/API class — defeats the whole pattern.
- Resolve the adapter in the constructor — it may not be registered yet.
- `throw` from an adapter method — always `Result.fail(new Error(...))`.
- Omit `implements OnModuleInit` in the provider module — the adapter never reaches the registry.
- Import the provider module in a consumer — import only the global `ACLModule`.

## Why
Bounded contexts must stay independently deployable and free of circular
dependencies. The registry is a runtime indirection: consumers depend on an
inline interface and a string key, never on the provider's code. Constructor
resolution races module initialization, so adapters are always fetched lazily
inside methods. Asynchronous integration uses events keyed by the EVENT_NAME enum.
