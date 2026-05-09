# NestJS Module Import Pitfalls

## Problem 1 — Duplicate ContextsModule import causes silent startup hang

### Symptom
- App starts (all "X dependencies initialized" logs appear)
- Port 3000 **never opens** — app hangs silently after `ApiModule dependencies initialized`
- `onApplicationBootstrap` never runs (DDDModule handlers never registered)
- One specific context module is **missing** from "dependencies initialized" logs (the one inside the duplicated parent)
- No error is thrown — NestJS gets stuck in `onModuleInit()` phase

### Root cause
When a module is imported in **two places** in the module tree and one of those places triggers NestJS's `VytchesExplorerService.onModuleInit()` (async), the explorer can deadlock while trying to register handlers from a module that is still mid-initialization.

**Concrete case (TS-MENTIONS-001):**
```
ApiModule
  ├── ContextsModule          ← import #1
  │     └── MentionsModule
  └── MentionsApiModule
        └── ContextsModule   ← import #2 (WRONG — duplicate)
              └── MentionsModule (never logs "dependencies initialized")
```

`VytchesExplorerService.onModuleInit()` is `async`. When called during module init, it calls `discoverHandlers()` which accesses `provider.instance` for every registered provider. If a provider belongs to a module that NestJS considers "already being initialized" (due to deduplication race), the explorer can block waiting for it indefinitely.

### Fix
**Never import ContextsModule in individual API modules.** `ContextsModule` is already imported by `ApiModule`. API modules only need the specific module that provides their guard dependencies.

```typescript
// WRONG — causes startup hang
@Module({
  imports: [SharedModule, ContextsModule],   // ContextsModule already in ApiModule!
  controllers: [MentionsController],
})
export class MentionsApiModule {}

// CORRECT — import only what you need
@Module({
  imports: [
    SharedModule,
    AuthorizationModule,   // provides IDENTITY_VERIFICATION_PORT for AuthenticatedGuard
  ],
  controllers: [MentionsController],
})
export class MentionsApiModule {}
```

### Diagnostic checklist
When app hangs after "X dependencies initialized" with no error:
1. Check if any API module imports `ContextsModule` — it should only be in `ApiModule`
2. Search for the **missing** module in the "dependencies initialized" log — that's the one inside the duplicate parent
3. Verify with: `docker logs <container> 2>&1 | grep "initialized" | grep -c "BullModule"` — if > 2, module is being duplicated

---

## Problem 2 — Missing `@Inject()` on class-token constructor parameters

### Symptom
NestJS silently resolves class tokens via `design:paramtypes` metadata (TypeScript `emitDecoratorMetadata`), so a **missing `@Inject(ClassName)`** on a class-token parameter does NOT crash the app. However it is incorrect and can cause unexpected behavior when:
- The parameter is not the only one (mixed decorated/undecorated params)
- TypeScript strips metadata in certain compilation configurations

### Rule
**Always decorate every constructor parameter** with `@Inject()`, even class tokens:

```typescript
// WRONG — missing @Inject() on first param
constructor(
  private readonly mentionParser: MentionParserDomainService,
  @Inject(MENTION_RESOLVE_REPOSITORY) private readonly repo: IRepo,
)

// CORRECT
constructor(
  @Inject(MentionParserDomainService)
  private readonly mentionParser: MentionParserDomainService,
  @Inject(MENTION_RESOLVE_REPOSITORY) private readonly repo: IRepo,
)
```

---

## Problem 3 — `z.coerce.boolean()` coerces string `"false"` to `true`

### Symptom
`DATABASE_AUTO_MIGRATE=false` in environment runs migrations on every startup despite the intent to disable them.

### Root cause
`z.coerce.boolean()` in Zod coerces ANY non-empty string to `true`. The string `"false"` is non-empty, so it becomes `true`.

### Fix
Use the project's `envBooleanSchema` helper (defined in `config.schema.ts`). It must be declared **before** it is used in a schema:

```typescript
// WRONG
autoMigrate: z.coerce.boolean().optional()

// CORRECT — but envBooleanSchema must be declared before DatabaseConfigSchema
autoMigrate: envBooleanSchema(true).optional()
```

**Important**: `envBooleanSchema` is a `const` (not hoisted). If it is defined after the schema that uses it, you get `ReferenceError: Cannot access 'envBooleanSchema' before initialization`. Move the helper definition above all schemas that use it.

---

## When to import what in ApiModules

| Need | Import |
|------|--------|
| `AuthenticatedGuard` dependencies | `AuthorizationModule` |
| `PermissionGuard` + `AbilityFactory` | `AuthorizationModule` |
| Specific context CQRS handlers | The specific context module (e.g. `EngagementModule`) |
| All context handlers | `ContextsModule` — but **only in `ApiModule`**, never in sub-api-modules |
| Logger, QueryBus, CommandBus | `SharedModule` (global, always available) |
