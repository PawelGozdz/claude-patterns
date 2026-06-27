# Aggregate — Rule Card
<!-- Egzekwowalne streszczenie aggregate-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, uzasadnienie, 5 przykładów): aggregate-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Domain · **Applies to**: `*.aggregate.ts` w `**/domain/aggregates/`
**Base**: `AggregateRoot<string>` (@vytches/ddd) · **ADR**: 0013, 0021, 0025, 0035

## MUST
- **A1** — extends `AggregateRoot<string>`.
- **A2** — konstruktor `private`/chroniony, NIGDY wołany bezpośrednio przez klienta.
- **A3** — tworzenie przez `static create(...)` zwracające `Result<T, DomainError>` i emitujące domain event.
- **A4** — hydratacja z bazy przez `static reconstituteFromPersistence(id, props, version)` — BEZ eventów.
- **A5** — KAŻDA metoda zwraca `Result<T, DomainError>` / `Result.empty()` — nigdy nie rzuca.
- **A6** — logika SYNCHRONICZNA: zero `async`, zero zależności infrastrukturalnych (DB/HTTP/serwisy).
- **A7** — pola prywatne `_field`, ekspozycja tylko przez gettery (immutability).
- **A8** — zmiana stanu zawsze przez `this.apply(new XxxDomainEvent(...))`.
- **A9** — eventy z segregacją GDPR: `piiData`, `anonymizedData`, `businessData`, `cryptoShredding`.
- **A10** — `getSpecificationContext()` udostępnia stan dla ewaluacji policy/specs.
- **A11** — tylko reguły biznesowe; walidacja FORMATU należy do value objects (ADR-0021).

## MUST NOT
- **N1** — ❌ `throw` — zawsze `Result.fail(...)` (niezmiennik czystości warstwy domeny).
- **N2** — ❌ `async`/`Promise` w metodach agregatu.
- **N3** — ❌ import z `infrastructure/` lub `application/`.
- **N4** — ❌ walidacja formatu (regex/długość znaków) — to robi VO.
- **N5** — ❌ bezpośrednie `new XxxAggregate(...)` poza `create`/`reconstituteFromPersistence`.
- **N6** — 🚨 ❌ emisja IntegrationEvent z agregatu — TYLKO DomainEvent; integration event emituje handler.
- **N7** — ❌ event bez metadanych `cryptoShredding` (`piiFields`, `retentionPeriod`, `isShredded`).

## Minimal correct skeleton
```ts
import { AggregateRoot, Result } from '@vytches/ddd';

export class XxxAggregate extends AggregateRoot<string> {     // A1
  private _foo: Foo;                                          // A7
  constructor(id: XxxId, props: XxxProps, version?: number) { // A2
    super({ id, version });
    this._foo = props.foo;
  }
  get foo(): Foo { return this._foo; }                        // A7

  static create(foo: Foo): Result<XxxAggregate, XxxDomainError> {        // A3, A5
    // tylko reguła biznesowa — format waliduje VO (A11/N4)
    if (foo.isEmpty()) return Result.fail(XxxDomainError.fooRequired()); // N1
    const agg = new XxxAggregate(XxxId.create(), { foo });
    agg.apply(new XxxCreatedEvent({                                       // A8, A9
      piiData: {}, anonymizedData: {}, businessData: { fooId: foo.value },
      cryptoShredding: { piiFields: [], retentionPeriod: 2555, isShredded: false }, // N7
    }));
    return Result.ok(agg);
  }

  static reconstituteFromPersistence(id: XxxId, props: XxxProps, version: number): XxxAggregate { // A4
    return new XxxAggregate(id, props, version);              // bez eventów
  }

  changeFoo(foo: Foo): Result<void, XxxDomainError> {         // A5, A6 (sync)
    if (this._foo.equals(foo)) return Result.fail(XxxDomainError.unchanged());
    this._foo = foo;
    this.apply(new FooChangedEvent({ /* segregacja GDPR jak wyżej */ }));
    return Result.empty();
  }

  getSpecificationContext() { return { foo: this._foo }; }    // A10
}
```

## Verifier — najczęstsze naruszenia → VETO
| Symptom w kodzie | Złamana reguła |
|---|---|
| `throw new ...` w ciele agregatu | N1 |
| `async` / `await` w metodzie | N2 |
| `import { ... } from '...infrastructure...'` / `...application...` | N3 |
| regex / `.length >` walidacja formatu | N4 |
| `new XxxAggregate(` poza fabrykami | N5 |
| `this.apply(new XxxIntegrationEvent(` | N6 |
| event bez `cryptoShredding` | N7 |
| brak `extends AggregateRoot` | A1 |
| publiczny konstruktor / brak `create()` | A2/A3 |

**Pełny wzorzec**: [`aggregate-pattern.md`](./aggregate-pattern.md)
