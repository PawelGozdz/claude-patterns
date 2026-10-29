# Rule: Application Handlers (Command / Query)
**Governs**: `patterns/application/command-handler-pattern.md`, `query-handler-pattern.md`, `application-service-pattern.md`, `command-handler-queue-port-pattern.md`
**Applies to**: `*.handler.ts` in `**/application/commands|queries/`, `*.service.ts` in `**/application/services/`

## ALWAYS
- Extend the base: `BaseCommandHandler<Command, Result<DTO, E>>` or `BaseQueryHandler<Query, Result<DTO, E>>`.
- Apply both decorators: `@Injectable()` + `@CommandHandler(Cmd)` / `@QueryHandler(Query)`.
- Inject EVERY constructor dependency with `@Inject(TOKEN)` — logger, requestContext, repos, services, ACL.
- Register handlers in the module `providers[]` (auto-discovery); for explicit registration use the module's `onModuleInit`.
- Get `userId` exclusively from `this.requestContext.getUserId()` — never from a command field (ADR-0021).
  Applies EQUALLY to self-scoped ("my X") Query classes, not just Commands — a `GetMyXQuery`
  reads userId in the handler too (ARCH-D001: found as a gap in 22 Query classes across 5
  contexts — see `patterns/architecture/dual-identity-pattern.md` Anti-Pattern 5). A `userId`
  field used ONLY for `getUserContext()` audit telemetry (never to scope the result set) is not
  this violation — the line is "does this field decide WHAT comes back," not "does the field exist."
- Return `Result<DTO, E>` from `executeBusinessLogic()` — orchestration only: load → build VO → call aggregate factory → save → map DTO.
- Do cross-context calls only via `aclRegistry.getGlobalRequired<ILocalInterface>('context')` with a local interface.
- Place the ACL call by kind: ACL READ with external I/O or a timeout (and any ACL leaving the process) → `prepare()`; ACL WRITE to an in-process context → `executeBusinessLogic()` (it joins the handler's CLS transaction and is rolled back with it; no `compensate()` needed).
- Implement `getOperationName()` and `getBoundedContext()` (telemetry); rely on inherited `@Transactional` for commands.
- Query handlers: inject the read-only `IQueryRepository`, paginate list queries (`{ items, pagination }`), return a DTO.
- A comment in the code is not evidence of compliance — the rule card wins. A comment or an analysis sentence that justifies a deviation ("the callback expects exceptions", "the handler does not write to the database") is a claim to verify in the code; if it contradicts the card, report a violation instead of following it.
- A comment in the code is not evidence of compliance — the rule card wins. A comment or an analysis sentence that justifies a deviation ("the callback expects exceptions", "the handler does not write to the database") is a claim to verify in the code; if it contradicts a rule, it is a violation, not a waiver.

## NEVER
- Put `userId` in a Command class — it comes from the JWT/RequestContext, not the request body (security gap).
- Put `userId` in a self-scoped Query class's constructor to determine WHOSE data is returned —
  same security gap, one layer later (ARCH-D001).
- Put domain logic (age checks, business rules) in a handler — it belongs in the aggregate/specification.
- `throw` in `executeBusinessLogic` — always `Result.fail(error)`. The same holds for every private method the handler calls from it: moving the `throw` into a helper does not make it legal.
- Import `@nestjs/bullmq` / `bullmq` or use `@InjectQueue` in a `*.handler.ts` under `application/commands|queries/` — enqueue through a port (`Symbol` + interface in `application/`, BullMQ adapter in the module/`infrastructure/`), see `patterns/application/command-handler-queue-port-pattern.md`. Direct queues remain legal in event handlers and services (`bullmq-queue-pattern`).
- Manage transactions manually (`beginTransaction`/`commit`/`rollback`) — `@Transactional` handles it.
- Import directly from another bounded context — use the ACL Registry.
- Manually call `commandBus.register()`/`queryBus.register()` — auto-discovery replaces it.
- `queue.add` (audit, cache invalidation, any enqueue) in a domain-event handler — in-process events are dispatched BEFORE the command's transaction commits, so the job survives a rollback and leaves a phantom. Use the outbox (`outboxService.saveMessage`).
- Mutate state, load aggregates, or skip pagination in a query handler (CQRS violation).
- Omit `@Inject()` on any constructor dependency.

## Enforcement
Both `NEVER` rules above (`throw` in a handler file, BullMQ in a handler) are checked mechanically by `tools/conformance` (`bodyRules` `CH-NO-THROW` / `CH-NO-BULLMQ`) as a RATCHET against the commit a run starts from: debt that is already committed does not block, a new violation does. A justified exception needs a reason in the code (`// THROW-EXCEPTION: <reason>`, `// QUEUE-EXCEPTION: <reason>`) or an entry with a `reason` in the project's `.claude/conformance.json`, and it counts only when it was committed BEFORE the run; an exception added during a run waits for a human.

## Why
Handlers are thin orchestration over the domain: they translate a request into
domain calls and a DTO back, holding zero business logic. Sourcing `userId` from
the request body is a privilege-escalation gap, which is why it must come from the
authenticated context. NestJS DI requires `@Inject()` on token-based dependencies,
and handler registration in `providers[]`/`onModuleInit` is what wires the buses.
