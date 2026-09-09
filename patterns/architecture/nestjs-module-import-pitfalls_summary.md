# NestJS Module Import Pitfalls — Rule Card

**Tags**: "api:platform:nestjs"
<!-- Egzekwowalne streszczenie nestjs-module-import-pitfalls.md — 5 udokumentowanych
     incydentów (TS-MENTIONS-001, TS-DISCORD-001).
     Pełny wzorzec: nestjs-module-import-pitfalls.md -->

**Layer**: Infrastructure
**Status**: Production (5 incidents documented: TS-MENTIONS-001, TS-DISCORD-001)
**Source**: nestjs-module-import-pitfalls.md

## MUST
- **NM1** — Import `ContextsModule` **only** in `ApiModule`, never in a sub-API-module —
  duplicate import triggers a deadlock in `VytchesExplorerService.onModuleInit()` with the app
  hanging silently after "X dependencies initialized".
- **NM2** — If ANY constructor parameter uses `@Inject(TOKEN)`, decorate **every** parameter
  with an explicit `@Inject()`, including class tokens — otherwise later undecorated params
  become `undefined` at runtime (TypeScript `design:paramtypes` emission gets unreliable).
- **NM3** — Use the project's `envBooleanSchema(...)` helper for boolean env vars, never
  `z.coerce.boolean()` — Zod's coercion turns the string `"false"` into `true`.
- **NM4** — `envBooleanSchema` (or any helper `const` used inside a schema) must be **declared
  before** the schema that references it — a `const` is not hoisted.
- **NM5** — Call `ScheduleModule.forRoot()` **exactly once**, in the root `AppModule` — a second
  call creates a second `SchedulerRegistry`, silently disconnecting `@Interval()`/`@Cron()`.
- **NM6** — In any class extending `BaseQueueProcessor`, declare the injected `logger`
  constructor parameter as a **plain local variable** (no `protected`/`override`/`readonly`).

## MUST NOT
- **N1** — ❌ `imports: [..., ContextsModule]` in a sub-API-module — only import the specific
  module providing the guard dependency you need (e.g. `AuthorizationModule`).
- **N2** — ❌ Mix `@Inject(token)` and bare `private readonly x: Class` in the same constructor.
- **N3** — ❌ `z.coerce.boolean()` for any env-var boolean.
- **N4** — ❌ `ScheduleModule.forRoot()` in any module other than the root `AppModule`.
- **N5** — ❌ `protected override readonly logger` in a `BaseQueueProcessor` subclass —
  TypeScript's property initializer overwrites the child logger `super()` just created.

## ✅/❌ Use this pattern for / Do NOT use for
- ✅ App hangs silently after init logs with no thrown error.
- ✅ An injected param is `undefined` only when mixed with token-based injection.
- ✅ A boolean env var behaves inverted.
- ✅ `@Interval()`/`@Cron()` never fires.
- ✅ BullMQ processor logs under wrong context.
- ❌ General NestJS DI questions unrelated to these five symptoms.
- ❌ Errors with a clear stack trace in business logic.

## Verifier — najczęstsze naruszenia
| Symptom w kodzie | Złamana reguła |
|---|---|
| `grep -rn "ContextsModule" src/**/*api*.module.ts` poza `ApiModule` | NM1 |
| Konstruktor: `@Inject(X) a, private readonly b: B` (mix) | NM2 |
| `z.coerce.boolean()` w schemacie env | NM3 |
| `grep -r "ScheduleModule.forRoot" src/` > 1 wynik | NM5 |
| `protected override readonly logger` w klasie `extends BaseQueueProcessor` | NM6 |

**Pełny wzorzec**: [`nestjs-module-import-pitfalls.md`](./nestjs-module-import-pitfalls.md)
