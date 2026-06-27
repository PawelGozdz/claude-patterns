# Application Service — Rule Card
<!-- Egzekwowalne streszczenie application-service-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, uzasadnienie, przykłady): application-service-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Application · **Applies to**: `*.service.ts` w `**/application/services/`
**Decorators**: `@Injectable()` (wymagane) · `@Transactional()` (multi-step)
**ADR**: 0013, 0021

## MUST
- **AS1** — `@Injectable()` na klasie — serwis jest zarządzany przez kontener NestJS.
- **AS2** — KAŻDA zależność wstrzykiwana przez konstruktor z dekoratorem `@Inject()` (interfejs) lub przez typ (klasa).
- **AS3** — wyłącznie **orkiestracja**: koordynuje komendami/zapytaniami i infrastrukturą; zero logiki domenowej.
- **AS4** — operacje domenowe delegowane przez `CommandBus.execute()` / `QueryBus.execute()` — nigdy bezpośrednio do repozytorium.
- **AS5** — wieloetapowy przepływ owinięty `@Transactional()` — granica transakcji należy do serwisu, nie do handlera.
- **AS6** — KAŻDA metoda zwraca `Promise<Result<T, E>>` — nigdy nie rzuca, błędy propagowane przez `Result.fail(...)`.
- **AS7** — cross-context: integracja z innymi kontekstami WYŁĄCZNIE przez `IntegrationEventBus` lub ACL Registry — nigdy bezpośrednie wywołanie serwisu innego kontekstu.
- **AS8** — saga z kompensatą: przy multi-step gromadź `compensations[]` i wywołaj `compensate()` przy błędzie (odwrócona kolejność).
- **AS9** — prosty CRUD (jeden command/query) — użyj handlera bezpośrednio, BEZ dodatkowego serwisu aplikacyjnego.

## MUST NOT
- **N1** — ❌ `throw` — zawsze `Result.fail(new XxxError(...))` lub przepuść błąd przez `if (result.isFailure) return Result.fail(result.error)`.
- **N2** — ❌ logika domenowa (walidacja reguł biznesowych, obliczenia): należy do agregatu lub domain service.
- **N3** — ❌ bezpośredni import i wywołanie `IUserRepository` / innego repozytorium poza handlerami — omija handler i łamie CQRS.
- **N4** — ❌ import z `domain/` poza DTO/komendami/zapytaniami — serwis NIE operuje na agregatach bezpośrednio.
- **N5** — ❌ `IntegrationEvent` publikowany z agregatu lub handlera domenowego — to robi serwis aplikacyjny (lub dedykowany handler integracyjny).
- **N6** — ❌ tworzenie serwisu aplikacyjnego dla prostego CRUD (naruszenie AS9 / over-engineering).

## Minimal correct skeleton
```ts
import { Injectable, Inject } from '@nestjs/common';
import { CommandBus, QueryBus, EventBus } from '@nestjs/cqrs';
import { Result } from '@vytches/ddd';
import { Transactional } from '@nestjs-cls/transactional';

@Injectable()                                                          // AS1
export class XxxApplicationService {
  constructor(
    @Inject(CommandBus) private readonly commandBus: CommandBus,      // AS2
    @Inject(QueryBus)   private readonly queryBus:   QueryBus,        // AS2
    @Inject(EventBus)   private readonly eventBus:   EventBus,        // AS2
    @Inject(IX_SERVICE) private readonly xService:   IXService,       // AS2 — interfejs infrastruktury
  ) {}

  // Simple delegation — NO application service needed for this in isolation (AS9)
  // shown here for illustration of CommandBus pattern only
  async doSimple(dto: XxxDto): Promise<Result<XxxId, XxxError>> {    // AS6
    const command = new DoSimpleCommand(dto.foo, dto.bar);
    return this.commandBus.execute(command);                           // AS4
    // zero business logic here                                        // N2
  }

  @Transactional()                                                     // AS5
  async doMultiStep(dto: XxxDto): Promise<Result<XxxResult, XxxError>> { // AS6
    const compensations: (() => Promise<void>)[] = [];                // AS8

    // Step 1 — domain command
    const stepOneResult = await this.commandBus.execute(              // AS4
      new StepOneCommand(dto.foo),
    );
    if (stepOneResult.isFailure) return Result.fail(stepOneResult.error); // N1 — no throw

    compensations.push(() => this.commandBus.execute(new UndoStepOneCommand(stepOneResult.value)));

    // Step 2 — infrastructure
    await this.xService.doInfraWork(stepOneResult.value);

    // Step 3 — cross-context integration event                        // AS7, N5
    await this.eventBus.publish(
      new XxxIntegrationEvent({ id: stepOneResult.value }),
    );

    return Result.ok({ id: stepOneResult.value });
    // compensate on catch — pełny przykład w application-service-pattern.md (AS8)
  }
}
```

## Verifier — najczęstsze naruszenia → VETO
| Symptom w kodzie | Złamana reguła |
|---|---|
| `throw new ...` w ciele serwisu | N1 |
| `if (password.length < 8)` lub inna reguła domenowa | N2 |
| `constructor(private readonly userRepo: IUserRepository)` + bezpośredni `.save()` | N3 |
| `import { UserAggregate }` w serwisie aplikacyjnym | N4 |
| `IntegrationEvent` emitowany z agregatu / handlera domenowego | N5 |
| Serwis aplikacyjny z jedną metodą wołającą jeden command | N6 |
| Brak `@Injectable()` | AS1 |
| Brak `@Inject()` przy interfejsie w konstruktorze | AS2 |
| Brak `@Transactional()` przy multi-step | AS5 |
| Metoda zwraca `Promise<void>` lub `Promise<XxxDto>` zamiast `Result` | AS6 |
| Cross-context: bezpośredni `import` z innego kontekstu | AS7 |

**Pełny wzorzec**: [`application-service-pattern.md`](./application-service-pattern.md)
