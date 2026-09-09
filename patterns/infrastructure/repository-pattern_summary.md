# Repository — Rule Card

**Tags**: "api:data-access"
<!-- Egzekwowalne streszczenie repository-pattern.md (RP1-RP5, RP10-RP12) + repository-events-pattern.md
     (RP6-RP9). WIĄŻĄCE. Pełny wzorzec (kontekst, uzasadnienie, przykłady, wyjątki): repository-pattern.md;
     szczegóły rejestracji eventMap: repository-events-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Infrastructure · **Applies to**: `*.repository.ts` w `**/infrastructure/repositories/` lub `**/infrastructure/persistence/`; interfejsy portów w `**/domain/repositories/`; RP12/N7 dodatkowo obejmują `*.cron.ts`/`*.scheduler.ts`/`*.job.ts` w `**/infrastructure/**` i serwisy w `**/application/services/`
**ADR**: 0025 (Hybrid Event System)

**Geneza RP12/N7 (2026-07-05):** pierwszy live przebieg `/orchestrate-ddd` w juz-ide-api-1
(TS-SEC-ANTI-SPOOF-003) wygenerował `DeviceNoncePurgeCron` z `@Inject(DATABASE_TOKEN) private
readonly db: Kysely<Database>` i inline `deleteFrom('device_nonces')...` zamiast przez
`IDeviceNonceRepository` — human review złapał to (port nie miał jeszcze metody `purgeExpired()`,
więc implementer poszedł na skróty zamiast dodać metodę do portu). Sprawdzone: WSZYSTKIE 18 innych
cronów/schedulerów w tym repo idą przez repozytorium/port/command-bus, żaden inny nie wstrzykuje
`DATABASE_TOKEN` bezpośrednio — to był jedyny wyjątek.

## MUST

- **RP1** — Command repository implementuje interfejs domenowy (port z `domain/repositories/`) — separacja warstw.
- **RP2** — Extends `BaseKyselyRepository` — obowiązkowo dla repozytoriów command (write-side); query repo — bez tej bazy.
  **Odstępstwo (dopuszczalne w ~5% przypadków)** wymaga: (a) komentarza `// RP2-EXCEPTION: <powód>`
  nad klasą, (b) wpisu w sekcji „Wyjątki" pełnego wzorca (przeanalizowany kod + uzasadnienie).
  Command-repo bez `extends` I bez adnotacji = VETO, nie „pewnie wiedzieli co robią".
- **RP3** — `save()` / `delete()` zawiera persist + dispatch eventów z agregatu przez `BaseKyselyRepository`.
- **RP4** — Mapper domena ↔ persistence (`mapToDomain` / `mapToPersistence`) jako prywatna metoda; żadna logika domenowa w mapperze.
- **RP5** — Optimistic locking: kolumna `version` czytana i inkrementowana przy `save()`; konflikt → rzucić wyjątek infrastruktury (nie DomainError).
- **RP6** — `reconstructEventByType()` rejestruje WSZYSTKIE zdarzenia domenowe kontekstu w `eventMap` używając enum (TS-EVENTS-002).
- **RP7** — Import eventów w `eventMap` — porządek alfabetyczny; wszystkie eventy, nie tylko aktualnie emitowane.
- **RP8** — Nieznany typ eventu → `console.warn` z nazwą i listą dostępnych kluczy; nigdy cicha `return null`.
- **RP9** — Istnieje weryfikacyjny test L1 skanujący `domain/events/*.event.ts` i porównujący z `eventMap` (CI bloker).
- **RP10** — Query repository (read-side): eksplicytne kolumny w `SELECT`, mapper `mapToOwnerQueryModel` / `mapToPublicQueryModel`, bez `BaseKyselyRepository`.
- **RP11** — Niestandardowe typy SQL (enum, cast) przez `sql<Type>`` template literal (Kysely).
- **RP12** — Cron/scheduler/application-service, który potrzebuje operacji na danych agregatu,
  wstrzykuje interfejs repozytorium (port z `domain/repositories/`) — NIE surowy token bazy
  (`DATABASE_TOKEN`/`Kysely<Database>` itp.) jako domyślny wybór. Brakująca metoda na porcie
  (np. `purgeExpired()`) to sygnał **dodaj metodę do repozytorium**, nie obejście przez
  wstrzyknięcie raw clienta.
  **Odstępstwo (dopuszczalne, gdy jest dobry powód — np. cross-aggregate bulk operacja, dla
  której repozytorium per-agregat byłoby sztucznym obejściem, albo poller/batch-job działający
  poza granicą jednego agregatu jak w `KyselyOutboxRepository`)** wymaga: (a) komentarza
  `// RP12-EXCEPTION: <powód>` nad konstruktorem/polem wstrzykującym raw client, (b) wpisu
  w sekcji „Wyjątki" pełnego wzorca (przeanalizowany kod + uzasadnienie). Raw token bez
  adnotacji I bez uzasadnienia = VETO, nie „pewnie miał powód" (ten sam standard co RP2).

## MUST NOT

- **N1** — ❌ Zwracanie surowych wierszy DB (`RowType`) zamiast obiektu domenowego — mapper jest obowiązkowy (RP4).
- **N2** — ❌ Logika biznesowa (warunki domenowe, reguły) w repozytorium — tylko I/O i mapowanie.
- **N3** — ❌ Import z innego bounded contextu z pominięciem ACL (cross-context coupling).
- **N4** — ❌ Hardcoded stringi zamiast enum w `eventMap` — brak compile-time safety (RP6).
- **N5** — ❌ Pominięcie eventu w `eventMap` z powodu "jeszcze nie używany" — bug runtime w produkcji.
- **N6** — ❌ Brak testu weryfikacyjnego `eventMap` — RP9 obowiązkowe dla każdego nowego repozytorium command.
- **N7** — ❌ `@Inject(DATABASE_TOKEN)` (lub odpowiednik raw DB clienta) w klasie spoza
  `**/infrastructure/repositories/` (cron, scheduler, application-service) do bezpośrednich
  zapytań BEZ adnotacji `// RP12-EXCEPTION: <powód>` — łamie separację warstw i testowalność
  (nie da się zamockować repozytorium w teście jednostkowym cron-a bez podnoszenia realnego DB
  clienta). Z adnotacją i uzasadnieniem w sekcji „Wyjątki" — dopuszczalne (RP12).

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
| Klasa `*CommandRepository` / plik `*-command.*.repository.ts` BEZ `extends BaseKyselyRepository` i BEZ `// RP2-EXCEPTION:` | **RP2** |
| Własna implementacja `save()` duplikująca persist+dispatch zamiast bazowej z `BaseKyselyRepository` | RP3 |
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
| Cron/scheduler/service z `@Inject(DATABASE_TOKEN)` / `Kysely<Database>` zamiast portu repozytorium, BEZ `// RP12-EXCEPTION: <powód>` | **RP12 / N7** |

**Pełny wzorzec**: [`repository-pattern.md`](./repository-pattern.md) — kontekst, przykłady write/read-side,
anty-wzorce, sekcja „Wyjątki" (RP2/RP12). Rejestracja `eventMap` (RP6-RP9): [`repository-events-pattern.md`](./repository-events-pattern.md)
