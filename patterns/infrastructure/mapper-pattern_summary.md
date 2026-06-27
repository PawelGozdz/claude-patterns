# Mapper — Rule Card
<!-- Egzekwowalne streszczenie mapper-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, uzasadnienie, anti-patterns, przykłady): mapper-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Infrastructure · **Applies to**: `*.mapper.ts` w `**/infrastructure/repositories/mappers/`
**Interface**: `IAggregateMapper<TAggregate, TDbEntity>` · **ADR**: 0013

## MUST
- **MP1** — implementuje `IAggregateMapper<TAggregate, TDbEntity>` — gwarantuje spójność typów.
- **MP2** — dekorator `@Injectable()` — wymagany do DI w NestJS.
- **MP3** — `toDomain()` i `toPersistence()` zwracają `Result<T, MapperError>` — NIGDY nie rzucają.
- **MP4** — `toDomain()` używa `reconstituteFromPersistence()` — NIE `create()` (omija reguły biznesowe).
- **MP5** — `toDomain()` przyjmuje parametr `version: number` — wymagany do optimistic locking.
- **MP6** — `toPersistence()` zwraca `Partial<TDbEntity>` — umożliwia operacje upsert.
- **MP7** — typy DB (Kysely generated, np. `EngagementCommentsTable`) — explicit cast przy mapowaniu enumów.
- **MP8** — złożona rekonstrukcja value objects w prywatnych metodach pomocniczych — nie inline.
- **MP9** — pola opcjonalne obsługiwane explicite: `null → undefined` w `toDomain()`, `undefined → null` w `toPersistence()`.
- **MP10** — własny typ błędu mappera extends `BaseError` z `ProjectErrorCode` — spójne error handling.
- **MP11** — dostęp do agregatu wyłącznie przez publiczne gettery — nigdy przez prywatne pola.

## MUST NOT
- **N1** — ❌ `throw` — zawsze `Result.fail(MapperError.create(...))`.
- **N2** — ❌ `aggregate.create()` w `toDomain()` — użyj `reconstituteFromPersistence()`.
- **N3** — ❌ pominięcie parametru `version` — łamie optimistic locking.
- **N4** — ❌ zwracanie pełnego `TDbEntity` zamiast `Partial<TDbEntity>`.
- **N5** — ❌ inline rekonstrukcja złożonych VO — wydziel do metody prywatnej.
- **N6** — ❌ dostęp do `aggregate._privateField` — tylko publiczne gettery.
- **N7** — ❌ logika biznesowa w mapperze — mapper TYLKO tłumaczy format, nie waliduje reguł domenowych.

## Minimal correct skeleton
```ts
import { Injectable } from '@nestjs/common';
import { BaseError, Result } from '@vytches/ddd';
import type { XxxTable } from '@shared/database/types/database.types';
import { XxxAggregate, type XxxProps } from '../../../domain/aggregates/xxx.aggregate';
import { XxxId, XxxValueObject } from '../../../domain/value-objects';
import { ProjectErrorCode } from '@shared/domain/errors';

// MP10 — własny typ błędu
export class XxxMapperError extends BaseError {
  public readonly code = ProjectErrorCode.DATABASE_ERROR;
  constructor(message: string, public override readonly cause?: unknown) { super(message); }
  static create(message: string, cause?: unknown) { return new XxxMapperError(message, cause); }
}

@Injectable()                                                             // MP2
export class XxxAggregateMapper {
  // MP3, MP4, MP5 — toDomain: DB → agregat domenowy
  async toDomain(
    record: XxxTable,
    version: number                                                       // MP5
  ): Promise<Result<XxxAggregate, XxxMapperError>> {
    try {
      const id = XxxId.fromString(record.id);
      const voResult = XxxValueObject.create(record.some_field);
      if (voResult.isFailure) throw new Error(voResult.error.message);   // przechwycone niżej

      const props: XxxProps = {
        vo: voResult.value,
        optionalField: record.optional_field ?? undefined,               // MP9
      };

      const aggregate = XxxAggregate.reconstituteFromPersistence(        // MP4
        id, props, version
      );
      return Result.ok(aggregate);
    } catch (error) {
      return Result.fail(XxxMapperError.create(                          // MP3/N1
        `Failed to reconstruct Xxx: ${(error as Error).message}`, error
      ));
    }
  }

  // MP3, MP6 — toPersistence: agregat → rekord DB
  async toPersistence(
    aggregate: XxxAggregate
  ): Promise<Result<Partial<XxxTable>, XxxMapperError>> {               // MP6
    try {
      const data: Partial<XxxTable> = {
        id: aggregate.id.value,                                          // MP11 — getter
        some_field: aggregate.vo.value,
        status: aggregate.status as XxxTable['status'],                 // MP7 — explicit cast
        optional_field: aggregate.optionalField ?? null,                // MP9
      };
      return Result.ok(data);
    } catch (error) {
      return Result.fail(XxxMapperError.create(
        `Failed to persist Xxx: ${(error as Error).message}`, error
      ));
    }
  }

  // MP8 — prywatna metoda pomocnicza dla złożonego VO
  private reconstructComplexVo(raw: string, extra: string | null): SomeVo {
    /* ... switch/map logic tutaj, nie inline w toDomain ... */
    return SomeVo.pending();
  }
}
```

## Verifier — najczęstsze naruszenia → VETO
| Symptom w kodzie | Złamana reguła |
|---|---|
| `throw new Error(...)` w mapperze (nieprzechwycone) | N1 |
| `XxxAggregate.create(...)` w `toDomain()` | N2 |
| `toDomain(record: XxxTable)` — brak `version` | N3 |
| zwraca `XxxTable` zamiast `Partial<XxxTable>` | N4 |
| 50-liniowy `switch` inline w `toDomain()` | N5 |
| `aggregate._content`, `aggregate._userId` | N6 |
| walidacja reguł biznesowych (`if (trust < 40)`) w mapperze | N7 |
| brak `@Injectable()` | MP2 |
| brak `extends BaseError` w klasie błędu mappera | MP10 |

**Pełny wzorzec**: [`mapper-pattern.md`](./mapper-pattern.md)
