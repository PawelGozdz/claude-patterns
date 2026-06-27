# Domain Service — Rule Card
<!-- Egzekwowalne streszczenie domain-service-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, uzasadnienie, przykłady): domain-service-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Domain · **Applies to**: `*.domain-service.ts` w `**/domain/services/`
**Dekorator**: `@Injectable()` (NestJS) · **ADR**: 0013, 0021

## MUST
- **DS1** — klasa oznaczona `@Injectable()` — domain service jest serwisem NestJS.
- **DS2** — BEZSTANOWY: brak zmiennych instancji (pola `private _x`) — wyłącznie parametry metod.
- **DS3** — każda metoda publiczna zwraca `Result<T, DomainError>` — nigdy nie rzuca.
- **DS4** — wywoływany przez handler warstwy aplikacji PRZED metodą agregatu (orchestracja w handlerze).
- **DS5** — logika SYNCHRONICZNA: zero `async`, zero `await` w metodach domenowych.
- **DS6** — złożone reguły (3+ specyfikacje) hermetyzuje przez `PolicyBuilder` / `createXxxPolicy()`.
- **DS7** — dane wejściowe to gotowe obiekty domenowe (agregaty, VOs) — NIE id/stringi wymagające ładowania.
- **DS8** — plik lokalizowany w `**/domain/services/` obok agregatów i błędów domenowych.

## MUST NOT
- **N1** — ❌ `throw` — zawsze `Result.fail(new XxxDomainError(...))`.
- **N2** — ❌ `async`/`await`/`Promise` — domain service jest synchroniczny.
- **N3** — ❌ import z `infrastructure/` lub `application/` (repozytoria, HTTP, e-mail, event bus).
- **N4** — ❌ konstruktor z zależnościami infrastrukturalnymi (`IUserRepository`, `IEmailService` itp.).
- **N5** — ❌ pola instancji przechowujące stan (`private currentResidence`, `private cache` itp.).
- **N6** — ❌ przyjmowanie ID (string/UUID) i samodzielne ładowanie agregatu — handler ładuje, serwis waliduje.
- **N7** — ❌ logika dotycząca pojedynczego agregatu bez złożonych specyfikacji — to idzie do agregatu inline.

## Minimal correct skeleton
```ts
import { Injectable } from '@nestjs/common';
import { Result } from '@vytches/ddd';

import { createXxxPolicy } from '../policies/xxx';           // DS6
import type { XxxAggregate, YyyAggregate } from '../aggregates';
import { XxxDomainError } from '../errors';

/**
 * Domain Service: cross-aggregate or complex-policy validation.
 * Stateless — all data arrives via parameters. No infrastructure.
 */
@Injectable()                                                // DS1
export class XxxDomainService {
  // NO constructor with repo/email/bus deps               // N4
  // NO private _field                                      // DS2 / N5

  /**
   * Validate cross-aggregate business rule.
   * Called by handler BEFORE aggregate method.             // DS4
   */
  public canDoXxx(                                          // DS7 — gotowe obiekty, nie id
    agg1: XxxAggregate,
    agg2: YyyAggregate,
  ): Result<void, XxxDomainError> {                        // DS3
    const policy = createXxxPolicy();                       // DS6
    const context = {
      ...agg1.getSpecificationContext(),
      yyyState: agg2.getSpecificationContext(),
    };

    const check = policy.check({ entity: context });
    if (!check.passed) {
      return Result.fail(                                   // N1 — nigdy throw
        XxxDomainError.fromViolation(check.violations[0]),
      );
    }

    return Result.empty();                                  // DS5 — sync
  }

  private mapViolation(code: string): XxxDomainError {
    // Helper prywatny — bez infrastruktury               // N3
    return XxxDomainError.byCode(code);
  }
}
```

## Verifier — najczęstsze naruszenia → VETO
| Symptom w kodzie | Złamana reguła |
|---|---|
| `throw new ...` w ciele serwisu | N1 |
| `async` / `await` w metodzie | N2 |
| `import { ... } from '...infrastructure...'` / `...application...` | N3 |
| `constructor(private readonly repo: IXxxRepository)` | N4 |
| `private _current: XxxAggregate` jako pole instancji | N5 |
| `canDoXxx(id: string): ...` — przyjmuje ID zamiast obiektu | N6 |
| jednolinijkowa walidacja inline przeniesiona do serwisu | N7 |
| brak `@Injectable()` | DS1 |
| brak zwracanego `Result<T>` | DS3 |

**Pełny wzorzec**: [`domain-service-pattern.md`](./domain-service-pattern.md)
