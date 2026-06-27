# Command Handler — Rule Card
<!-- Egzekwowalne streszczenie command-handler-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, uzasadnienie, przykłady): command-handler-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Application · **Applies to**: `*.handler.ts` w `**/application/commands/`
**Base**: `BaseCommandHandler<Command, Result<DTO, Error>>` · **Decorators**: `@Injectable()`, `@CommandHandler(CommandClass)`
**ADR**: 0012, 0013, 0021, 0035

## MUST
- **CH1** — extends `BaseCommandHandler<Command, Result<DTO, Error>>`.
- **CH2** — oba dekoratory obecne: `@Injectable()` i `@CommandHandler(CommandClass)`.
- **CH3** — WSZYSTKIE zależności przez konstruktor z `@Inject()` (logger, requestContext, redactionService, repozytoria, serwisy).
- **CH4** — userId WYŁĄCZNIE z `this.requestContext.getUserId()` — NIGDY z pola command (ADR-0021).
- **CH5** — `executeBusinessLogic()` zwraca `Result<DTO, Error>` — NIGDY nie rzuca wyjątku.
- **CH6** — handler to CZYSTA ORKIESTRACJA: załaduj dane → stwórz VO → wywołaj fabrykę agregatu → zapisz → zwróć DTO.
- **CH7** — cross-context wywołania WYŁĄCZNIE przez `aclRegistry.getGlobalRequired<ILocalInterface>('context-name')` z lokalnym interfejsem ACL.
- **CH8** — transakcja obsługiwana przez `@Transactional` dziedziczone z `BaseCommandHandler` — auto-commit i auto-rollback.
- **CH9** — telemetria: `getOperationName()` i `getBoundedContext()` muszą być zaimplementowane.
- **CH10** — handler dodany do tablicy `providers` w module — wystarczy do auto-discovery przez `VytchesExplorerService`.

## MUST NOT
- **N1** — ❌ `userId` w klasie Command — userId pochodzi z JWT (RequestContext), nie z body (luka bezpieczeństwa, ADR-0021).
- **N2** — ❌ logika domenowa w handlerze (walidacja wieku, reguły biznesowe) — należy do agregatu/specyfikacji.
- **N3** — ❌ `throw` w `executeBusinessLogic` — zawsze `Result.fail(error)`.
- **N4** — ❌ ręczne zarządzanie transakcją (`beginTransaction`, `commit`, `rollback`) — `@Transactional` obsługuje to automatycznie.
- **N5** — ❌ bezpośredni import z innego kontekstu (`@contexts/other-context/...`) — wymagane ACL Registry.
- **N6** — ❌ ręczne `commandBus.register()` ani injekcja `CommandBus` w module — auto-discovery przez `@CommandHandler`.
- **N7** — ❌ brak `@Inject()` przy dowolnej zależności konstruktora.

## Minimal correct skeleton
```ts
import { Inject, Injectable } from '@nestjs/common';
import { CommandHandler, Result } from '@vytches/ddd';
import { BaseCommandHandler } from '@shared/application/base/base-command-handler';
import { ACL_REGISTRY_SERVICE, type ACLRegistryService } from '@shared/infrastructure/acl';
import { ILoggerService, LOGGER_SERVICE } from '@shared/infrastructure/logging';
import { RequestContextService } from '@shared/infrastructure/request-context';
import { XxxAggregate } from '../../../domain/aggregates/xxx.aggregate';
import { XxxDomainError } from '../../../domain/errors/xxx.error';
import type { IXxxCommandRepository } from '../../../domain/repositories/xxx-command.repository';
import { XxxValueObject } from '../../../domain/value-objects';
import type { XxxDto } from '../../dto/xxx.dto';
import { XxxCommand } from './command';

// ✅ Lokalny interfejs ACL — NIGDY nie importuj z innego kontekstu (CH7/N5)
interface IExternalContextAPI {
  getData(id: string): Promise<{ value: string }>;
}

@Injectable()                       // CH2
@CommandHandler(XxxCommand)         // CH2
export class XxxHandler extends BaseCommandHandler<
  XxxCommand,
  Result<XxxDto, XxxDomainError>
> {
  constructor(
    @Inject(LOGGER_SERVICE) logger: ILoggerService,              // CH3
    @Inject(RequestContextService) requestContext: RequestContextService, // CH3
    @Inject(REDACTION_SERVICE) redactionService: RedactionService,
    @Inject(XXX_COMMAND_REPOSITORY)                              // CH3, N7
    private readonly repository: IXxxCommandRepository,
    @Inject(ACL_REGISTRY_SERVICE)
    private readonly aclRegistry: ACLRegistryService,
  ) {
    super(logger, requestContext, redactionService);
  }

  protected getOperationName(): string { return 'XxxOperation'; }  // CH9
  protected getBoundedContext(): string { return 'XxxContext'; }   // CH9

  public async executeBusinessLogic(
    command: XxxCommand
  ): Promise<Result<XxxDto, XxxDomainError>> {
    // Krok 1: userId z RequestContext — NIGDY z command (CH4/N1)
    const userId = this.requestContext.getUserId();
    if (!userId) return Result.fail(XxxDomainError.authenticationRequired()); // N3

    // Krok 2: cross-context przez ACL (CH7/N5)
    const externalACL = this.aclRegistry.getGlobalRequired<IExternalContextAPI>('external-context');
    const externalData = await externalACL.getData(userId);

    // Krok 3: tworzenie VO (format waliduje VO, nie handler — N2)
    const voResult = XxxValueObject.create(command.value);
    if (voResult.isFailure) return Result.fail(voResult.error as XxxDomainError);

    // Krok 4: wywołanie fabryki agregatu — reguły biznesowe tu (CH6/N2)
    const aggResult = XxxAggregate.create(userId, voResult.value);
    if (aggResult.isFailure) return Result.fail(aggResult.error);

    // Krok 5: persist — transakcja auto przez BaseCommandHandler (CH8/N4)
    await this.repository.save(aggResult.value);

    // Krok 6: mapuj do DTO i zwróć (CH5)
    return Result.ok({ id: aggResult.value.id.value });
  }
}
```

## Verifier — najczęstsze naruszenia → VETO
| Symptom w kodzie | Złamana reguła |
|---|---|
| `command.userId` lub `userId` jako pole Command | N1 |
| walidacja biznesowa (`if age < 16`) w handlerze | N2 |
| `throw new ...` w `executeBusinessLogic` | N3 |
| `beginTransaction()` / `commit()` / `rollback()` ręcznie | N4 |
| `import { ... } from '@contexts/other-context/...'` | N5 |
| `commandBus.register(...)` w module | N6 |
| brak `@Inject()` przy zależności konstruktora | N7 |
| brak `@CommandHandler(CommandClass)` lub `@Injectable()` | CH2 |
| handler nie rozszerza `BaseCommandHandler` | CH1 |
| brak `getOperationName()` lub `getBoundedContext()` | CH9 |

**Pełny wzorzec**: [`command-handler-pattern.md`](./command-handler-pattern.md)
