# Query Handler — Rule Card
<!-- Egzekwowalne streszczenie query-handler-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, uzasadnienie, anty-wzorce): query-handler-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Application · **Applies to**: `*.handler.ts` w `**/application/queries/`
**Base**: `BaseQueryHandler<Query, Result<DTO, Error>>` · **Decorators**: `@Injectable()`, `@QueryHandler(QueryClass)`
**ADR**: 0012 (CQRS), 0013 (Result pattern)

## MUST
- **QH1** — extends `BaseQueryHandler<Query, Result<DTO, Error>>`.
- **QH2** — dekoratory `@Injectable()` ORAZ `@QueryHandler(QueryClass)` na klasie handlera.
- **QH3** — rejestracja w `providers[]` modułu — auto-discovery przez `VytchesExplorerService` (NIE ręczne `queryBus.register()`).
- **QH4** — wstrzykiwanie WYŁĄCZNIE `IQueryRepository` (interfejs read-only); NIE repozytoriów komend.
- **QH5** — zapytania listowe ZAWSZE obsługują paginację (`page`, `limit`) i zwracają `{ items, pagination }`.
- **QH6** — zwraca `Result<DTO, Error>` — NIGDY agregat ani encję domenową.
- **QH7** — implementuje `getOperationName()` i `getBoundedContext()` (telemetria).
- **QH8** — nadpisuje `getUserContext()` z danymi żądającego użytkownika (ścieżka audytu).
- **QH9** — wywołuje `logReadModelAccess()` na początku `executeBusinessLogic()`.
- **QH10** — zależności konstruktora dekorowane `@Inject(TOKEN)`.

## MUST NOT
- **N1** — ❌ mutacja stanu / zapis (aggregagate.save(), repository.save()) — CQRS violation.
- **N2** — ❌ ładowanie agregatów w query — używaj denormalizowanego read-modelu.
- **N3** — ❌ logika biznesowa / walidacja domenowa wewnątrz handlera — query tylko pobiera dane.
- **N4** — ❌ brak paginacji w zapytaniach listowych (`findAll()` bez `page`/`limit`).
- **N5** — ❌ `@Transactional` / transakcje zapisu — operacje odczytu nie wymagają transakcji.
- **N6** — ❌ ręczne `queryBus.register()` w module — auto-discovery go zastępuje.

## Minimal correct skeleton
```ts
import { Inject, Injectable } from '@nestjs/common';
import { QueryHandler, Result } from '@vytches/ddd';
import { BaseQueryHandler } from '@shared/application/base/base-query-handler';
import type { ILoggerService } from '@shared/infrastructure/logging';
import { LOGGER_SERVICE } from '@shared/infrastructure/logging';
import { RequestContextService } from '@shared/infrastructure/request-context';
import type { IXxxQueryRepository } from '../../domain/repositories/xxx-query.repository';
import { GetXxxQuery, type XxxDto } from './query';

@Injectable()                                         // QH2
@QueryHandler(GetXxxQuery)                            // QH2
export class GetXxxHandler extends BaseQueryHandler<  // QH1
  GetXxxQuery,
  Result<XxxDto, XxxValidationError>
> {
  constructor(
    @Inject(XXX_QUERY_REPOSITORY)                     // QH10
    private readonly xxxQueryRepository: IXxxQueryRepository, // QH4
    @Inject(LOGGER_SERVICE) logger: ILoggerService,
    @Inject(RequestContextService) requestContext: RequestContextService,
    @Inject(REDACTION_SERVICE) redactionService: RedactionService,
  ) {
    super(logger, requestContext, redactionService);
  }

  protected getOperationName(): string { return 'GetXxx'; }   // QH7
  protected getBoundedContext(): string { return 'XxxContext'; } // QH7

  protected override getUserContext(query: GetXxxQuery) {
    return { userId: query.requestingUserId };        // QH8
  }

  public async executeBusinessLogic(
    query: GetXxxQuery,
  ): Promise<Result<XxxDto, XxxValidationError>> {
    this.logReadModelAccess('XxxReadModel');           // QH9

    const { page, limit } = query;                    // QH5
    const result = await this.xxxQueryRepository.findMany(
      { filter: query.filter },
      { page, limit },                                // QH5 — brak findAll() bez limitu (N4)
    );

    if (result.isFailure) {
      return Result.fail(result.error as XxxValidationError);
    }

    const dto: XxxDto = {                             // QH6 — DTO, nie agregat
      items: result.value.items.map(item => ({
        id: item.id,
        name: item.name,
      })),
      pagination: {
        page, limit,
        totalCount: result.value.totalCount,
        totalPages: Math.ceil(result.value.totalCount / limit),
      },
    };
    return Result.ok(dto);
  }
}

// W module.ts:                                       // QH3
// @Module({ providers: [GetXxxHandler, ...] })
// NIE: queryBus.register(GetXxxHandler)              // N6
```

## Verifier — najczęstsze naruszenia → VETO
| Symptom w kodzie | Złamana reguła |
|---|---|
| `repository.save(` / `aggregate.edit(` w handlerze query | N1 |
| `this.xxxRepository.findById(` zamiast `queryRepository` | N2 |
| walidacja domenowa / reguła biznesowa w handlerze | N3 |
| `findAll()` bez `page`/`limit` | N4 |
| `@Transactional` na metodzie query | N5 |
| `queryBus.register(GetXxxHandler)` w module | N6 |
| brak `@QueryHandler(GetXxxQuery)` (runtime: "No handler found") | QH2 |
| brak `extends BaseQueryHandler` | QH1 |
| zwraca agregat / encję domenową zamiast DTO | QH6 |
| brak `getUserContext()` override | QH8 |

**Pełny wzorzec**: [`query-handler-pattern.md`](./query-handler-pattern.md)
