# Repository — Rule Card
<!-- Egzekwowalne streszczenie repository-events-pattern.md + stub repository-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (kontekst, uzasadnienie, checklist, testy): repository-events-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Infrastructure · **Applies to**: `*.repository.ts` w `**/infrastructure/repositories/` lub `**/infrastructure/persistence/`; interfejsy portów w `**/domain/repositories/`
**ADR**: 0025 (Hybrid Event System)

## MUST

- **RP1** — Command repository implementuje interfejs domenowy (port z `domain/repositories/`) — separacja warstw.
- **RP2** — Extends `BaseKyselyRepository` — obowiązkowo dla repozytoriów command (write-side); query repo — bez tej bazy.
- **RP3** — `save()` / `delete()` zawiera persist + dispatch eventów z agregatu przez `BaseKyselyRepository`.
- **RP4** — Mapper domena ↔ persistence (`mapToDomain` / `mapToPersistence`) jako prywatna metoda; żadna logika domenowa w mapperze.
- **RP5** — Optimistic locking: kolumna `version` czytana i inkrementowana przy `save()`; konflikt → rzucić wyjątek infrastruktury (nie DomainError).
- **RP6** — `reconstructEventByType()` rejestruje WSZYSTKIE zdarzenia domenowe kontekstu w `eventMap` używając enum (TS-EVENTS-002).
- **RP7** — Import eventów w `eventMap` — porządek alfabetyczny; wszystkie eventy, nie tylko aktualnie emitowane.
- **RP8** — Nieznany typ eventu → `console.warn` z nazwą i listą dostępnych kluczy; nigdy cicha `return null`.
- **RP9** — Istnieje weryfikacyjny test L1 skanujący `domain/events/*.event.ts` i porównujący z `eventMap` (CI bloker).
- **RP10** — Query repository (read-side): eksplicytne kolumny w `SELECT`, mapper `mapToOwnerQueryModel` / `mapToPublicQueryModel`, bez `BaseKyselyRepository`.
- **RP11** — Niestandardowe typy SQL (enum, cast) przez `sql<Type>`` template literal (Kysely).

## MUST NOT

- **N1** — ❌ Zwracanie surowych wierszy DB (`RowType`) zamiast obiektu domenowego — mapper jest obowiązkowy (RP4).
- **N2** — ❌ Logika biznesowa (warunki domenowe, reguły) w repozytorium — tylko I/O i mapowanie.
- **N3** — ❌ Import z innego bounded contextu z pominięciem ACL (cross-context coupling).
- **N4** — ❌ Hardcoded stringi zamiast enum w `eventMap` — brak compile-time safety (RP6).
- **N5** — ❌ Pominięcie eventu w `eventMap` z powodu "jeszcze nie używany" — bug runtime w produkcji.
- **N6** — ❌ Brak testu weryfikacyjnego `eventMap` — RP9 obowiązkowe dla każdego nowego repozytorium command.

## Minimal correct skeleton

```ts
// domain/repositories/xxx.repository.ts (port)
export interface IXxxCommandRepository {
  findById(id: XxxId): Promise<Result<XxxAggregate, NotFoundError>>;
  save(aggregate: XxxAggregate): Promise<void>;
}

// infrastructure/repositories/xxx-command-kysely.repository.ts
import { XxxEventNames } from '../../domain/events/event-names.enum'; // RP6
import { AaaHappenedEvent } from '../../domain/events/aaa-happened.event'; // RP7 alfabetycznie
import { BbbDoneEvent }     from '../../domain/events/bbb-done.event';     // RP7

@Injectable()
export class XxxCommandKyselyRepository                                     // RP2
  extends BaseKyselyRepository<XxxAggregate>
  implements IXxxCommandRepository                                           // RP1
{
  async findById(id: XxxId): Promise<Result<XxxAggregate, NotFoundError>> {
    const row = await this.db
      .selectFrom('xxx')
      .selectAll()
      .where('id', '=', id.value)
      .executeTakeFirst();

    if (!row) return Result.fail(NotFoundError.forId(id));
    return Result.ok(this.mapToDomain(row));                                // RP4
  }

  async save(aggregate: XxxAggregate): Promise<void> {
    await this.persistWithEvents(aggregate);                                // RP3
  }

  private mapToDomain(row: XxxRow): XxxAggregate {                         // RP4
    return XxxAggregate.reconstituteFromPersistence(
      XxxId.from(row.id),
      { name: XxxName.from(row.name) },
      row.version,                                                          // RP5
    );
  }

  protected override async reconstructEventByType(plain: any): Promise<any | null> {
    const eventMap: Record<string, any> = {                                 // RP6
      [XxxEventNames.AAA_HAPPENED]: AaaHappenedEvent,                      // RP7
      [XxxEventNames.BBB_DONE]:     BbbDoneEvent,
    };
    const EventClass = eventMap[plain.eventName];
    if (!EventClass) {
      console.warn(`[XxxRepo] Unknown event: ${plain.eventName}. Known: ${Object.keys(eventMap)}`); // RP8
      return null;
    }
    return ProjectDomainEvent.fromPlainObject(EventClass as any, plain);
  }
}

// infrastructure/repositories/xxx-query-kysely.repository.ts (RP10, RP11)
export class XxxQueryKyselyRepository {                                     // RP10 — bez BaseKysely
  async findPublic(id: string): Promise<XxxPublicQueryModel | null> {
    return this.db
      .selectFrom('xxx')
      .select(['id', 'name', sql<XxxStatus>`status::text` as 'status'])    // RP11
      .where('id', '=', id)
      .executeTakeFirst()
      .then(row => row ? this.mapToPublicQueryModel(row) : null);
  }

  private mapToPublicQueryModel(row: any): XxxPublicQueryModel { /* ... */ } // RP10
}
```

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| `return row` bez mappera z `domain/` | N1 |
| Warunek domenowy (`if (user.isPremium)`) w repozytorium | N2 |
| `import { ... } from '../../../other-context/...'` bez ACL | N3 |
| `'xxx.event.name'` string literal w `eventMap` zamiast enum | N4 |
| Brak klasy w `eventMap`, event istnieje w `domain/events/` | N5 |
| Brak pliku `*.verification.spec.ts` dla command repo | N6 (RP9) |
| Query repo extends `BaseKyselyRepository` | RP10 |
| `SELECT *` zamiast explicite kolumn w query repo | RP10 |
| `console.warn` brakuje przy nieznanym evencie | RP8 |
| Brak `version` w persist/select | RP5 |

**Pełny wzorzec**: [`repository-events-pattern.md`](./repository-events-pattern.md)
