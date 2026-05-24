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

## Problem 2 — Missing `@Inject()` on class-token constructor parameters causes `undefined`

### Symptom
When a constructor mixes token-based injection (`@Inject(STRING_TOKEN)`) with class-based injection (no decorator), the class-based parameter is silently injected as `undefined`. App starts without error — the crash happens at runtime when the property is first accessed.

**Concrete case (TS-DISCORD-001):**
```typescript
// WRONG — configService will be undefined at runtime
constructor(
  @Inject(LOGGER_SERVICE) logger: ILoggerService,  // token-based
  private readonly configService: ConfigService,   // ❌ no @Inject() — becomes undefined
) {}
```
```
TypeError: Cannot read properties of undefined (reading 'getDiscordConfig')
  at DiscordWebhookService.resolveWebhookUrl
```

NestJS relies on TypeScript's `design:paramtypes` metadata for class-token injection. When a constructor has **any** `@Inject(token)` decorator, the metadata emission for subsequent undecorated parameters can become unreliable. Result: the parameter is `undefined`.

### Rule
**Always decorate every constructor parameter** with `@Inject()`, even class tokens:

```typescript
// WRONG — missing @Inject() on second param; will be undefined when first param uses @Inject(token)
constructor(
  @Inject(LOGGER_SERVICE) logger: ILoggerService,
  private readonly configService: ConfigService,  // ❌ undefined at runtime
)

// CORRECT
constructor(
  @Inject(LOGGER_SERVICE) logger: ILoggerService,
  @Inject(ConfigService) private readonly configService: ConfigService,  // ✅
)
```

**Safe rule of thumb**: if ANY parameter in the constructor uses `@Inject(token)` (string/symbol), then ALL parameters must have explicit `@Inject()`.

**Also applies to class tokens without string literals:**
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

---

## Problem 4 — `ScheduleModule.forRoot()` duplicate causes `@Interval()` to never fire

### Symptom
- `@Interval()` decorated methods are never called — no logs, no side effects
- App starts without error
- Adding `console.log` at the start of the method confirms it never executes

### Root cause
`ScheduleModule.forRoot()` creates a `SchedulerRegistry` instance. If a second module also calls `forRoot()`, NestJS creates a **second** `SchedulerRegistry`. The `@Interval()` decorator registers its task in one registry, but the NestJS scheduler listens to a different one. Silent mismatch.

**Concrete case (TS-DISCORD-001):**
- `AppModule` imports `ScheduleModule.forRoot()` ← correct, single global instance
- `TokenEconomyModule` also had `ScheduleModule.forRoot()` ← wrong duplicate

### Fix
`ScheduleModule.forRoot()` must appear **exactly once**, in the root `AppModule`. All other modules must NOT import it.

```typescript
// WRONG — in any non-root module
@Module({
  imports: [ScheduleModule.forRoot()],  // ❌ Creates second SchedulerRegistry
})
export class TokenEconomyModule {}

// CORRECT — remove it entirely from non-root modules
@Module({
  imports: [],  // ✅ No ScheduleModule here
})
export class TokenEconomyModule {}
```

### Diagnostic checklist
If `@Interval()` / `@Cron()` / `@Timeout()` never fires:
1. `grep -r "ScheduleModule.forRoot" src/` — if more than 1 result, you have the duplicate bug
2. Confirm the correct module is in AppModule's import chain

---

## Problem 5 — `protected override readonly logger` in BullMQ processor destroys child logger

### Symptom
- Processor logs show wrong context (`"Application"` instead of processor class name)
- Structured fields from `logger.error(msg, { key: value })` appear as `[object Object]`
- Child logger with processor name (set by `BaseQueueProcessor`) is lost

### Root cause
TypeScript constructor property parameters (`protected override readonly logger`) are assigned **after** `super()` completes. `BaseQueueProcessor.constructor` calls `logger.createChildLogger(queueName)` and stores it in `this.logger`. Then TypeScript's property initializer for the subclass immediately overwrites `this.logger` with the raw injected logger (no child context).

```typescript
// WRONG — "override readonly" overwrites child logger created by super()
constructor(
  @Inject(LOGGER_SERVICE) protected override readonly logger: ILoggerService
) {
  super(logger, QueueName.DISCORD_NOTIFICATIONS);
  // super() sets: this.logger = logger.createChildLogger('discord-notifications')
  // then TypeScript sets: this.logger = <raw injected logger>  ← overwrites!
}

// CORRECT — plain parameter, let super() set this.logger
constructor(
  @Inject(LOGGER_SERVICE) logger: ILoggerService
) {
  super(logger, QueueName.DISCORD_NOTIFICATIONS);
  // super() sets: this.logger = logger.createChildLogger('discord-notifications')
  // nothing overwrites it ✅
}
```

### Rule
In any class that extends `BaseQueueProcessor`, the logger constructor parameter must be a **plain local variable** (no access modifier). Never use `protected override readonly logger` — it destroys the child logger.

---

## When to import what in ApiModules

| Need | Import |
|------|--------|
| `AuthenticatedGuard` dependencies | `AuthorizationModule` |
| `PermissionGuard` + `AbilityFactory` | `AuthorizationModule` |
| Specific context CQRS handlers | The specific context module (e.g. `EngagementModule`) |
| All context handlers | `ContextsModule` — but **only in `ApiModule`**, never in sub-api-modules |
| Logger, QueryBus, CommandBus | `SharedModule` (global, always available) |
