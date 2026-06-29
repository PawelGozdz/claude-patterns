# Rule: Application Handlers (Command / Query)
**Governs**: `patterns/application/command-handler-pattern.md`, `query-handler-pattern.md`, `application-service-pattern.md`
**Applies to**: `*.handler.ts` in `**/application/commands|queries/`, `*.service.ts` in `**/application/services/`

## ALWAYS
- Extend the base: `BaseCommandHandler<Command, Result<DTO, E>>` or `BaseQueryHandler<Query, Result<DTO, E>>`.
- Apply both decorators: `@Injectable()` + `@CommandHandler(Cmd)` / `@QueryHandler(Query)`.
- Inject EVERY constructor dependency with `@Inject(TOKEN)` — logger, requestContext, repos, services, ACL.
- Register handlers in the module `providers[]` (auto-discovery); for explicit registration use the module's `onModuleInit`.
- Get `userId` exclusively from `this.requestContext.getUserId()` — never from a command field (ADR-0021).
- Return `Result<DTO, E>` from `executeBusinessLogic()` — orchestration only: load → build VO → call aggregate factory → save → map DTO.
- Do cross-context calls only via `aclRegistry.getGlobalRequired<ILocalInterface>('context')` with a local interface.
- Implement `getOperationName()` and `getBoundedContext()` (telemetry); rely on inherited `@Transactional` for commands.
- Query handlers: inject the read-only `IQueryRepository`, paginate list queries (`{ items, pagination }`), return a DTO.

## NEVER
- Put `userId` in a Command class — it comes from the JWT/RequestContext, not the request body (security gap).
- Put domain logic (age checks, business rules) in a handler — it belongs in the aggregate/specification.
- `throw` in `executeBusinessLogic` — always `Result.fail(error)`.
- Manage transactions manually (`beginTransaction`/`commit`/`rollback`) — `@Transactional` handles it.
- Import directly from another bounded context — use the ACL Registry.
- Manually call `commandBus.register()`/`queryBus.register()` — auto-discovery replaces it.
- Mutate state, load aggregates, or skip pagination in a query handler (CQRS violation).
- Omit `@Inject()` on any constructor dependency.

## Why
Handlers are thin orchestration over the domain: they translate a request into
domain calls and a DTO back, holding zero business logic. Sourcing `userId` from
the request body is a privilege-escalation gap, which is why it must come from the
authenticated context. NestJS DI requires `@Inject()` on token-based dependencies,
and handler registration in `providers[]`/`onModuleInit` is what wires the buses.
