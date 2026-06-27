# Entity — Rule Card
<!-- Egzekwowalne streszczenie entity-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, uzasadnienie, przykłady): entity-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Domain · **Applies to**: `*.entity.ts` w `**/domain/**/entities/`
**Base**: `BaseEntity<TProps, TId>` (@vytches/ddd) · **ADR**: 0013, 0021

> **Encja ≠ Agregat**: encja ma tożsamość i należy do agregatu, ale NIE jest aggregate root.
> Nie emituje domain eventów — to robi agregat. Wybierz encję dla prostego CRUD bez eventów.

## MUST
- **EN1** — extends `BaseEntity<TProps, TId>` (NIE `AggregateRoot`).
- **EN2** — konstruktor `private` (lub `protected`) — nigdy nie wołany bezpośrednio przez klienta.
- **EN3** — tworzenie przez `static create(...)` zwracające `Result<T, DomainError>`.
- **EN4** — hydratacja z bazy przez `static reconstruct(props, id)` — BEZ walidacji, BEZ eventów.
- **EN5** — KAŻDA metoda biznesowa zwraca `Result<T, DomainError>` / `Result.empty()` — nigdy nie rzuca.
- **EN6** — logika SYNCHRONICZNA: zero `async`, zero zależności infrastrukturalnych.
- **EN7** — równość przez tożsamość (ID) — nie nadpisuj `equals()` własną logiką value-based.
- **EN8** — implementacja `isValid(): boolean` (wymagana przez `BaseEntity` abstract).
- **EN9** — walidacja przez Specifications; nie inline regex/string-length.
- **EN10** — props eksponowane wyłącznie przez gettery; bezpośrednia mutacja `this.props.*` tylko w metodach encji.

## MUST NOT
- **N1** — ❌ `throw` — zawsze `Result.fail(...)` (niezmiennik czystości warstwy domeny).
- **N2** — ❌ `async`/`Promise` w metodach encji.
- **N3** — ❌ import z `infrastructure/` lub `application/`.
- **N4** — ❌ emisja domain eventów (`this.apply(new XxxEvent(...))`) — to robi agregat, nie encja.
- **N5** — ❌ publiczny konstruktor (`public constructor`) — wymusza obejście fabryk.
- **N6** — ❌ value-based `equals()` (porównanie po props zamiast ID) — duplikaty nie zostaną wykryte.
- **N7** — ❌ logika biznesowa w konstruktorze — należy do `create()` + Specification.

## Minimal correct skeleton
```ts
import { BaseEntity, EntityId, BaseEntityId, Result } from '@vytches/ddd';

interface XxxProps {
  name: XxxName;         // VO — format waliduje VO, nie encja (ADR-0021)
  status: XxxStatus;     // VO
}

export class XxxEntity extends BaseEntity<XxxProps, EntityId> {   // EN1
  private constructor(props: XxxProps, id: EntityId) {            // EN2
    super(props, id);
  }

  // EN3 — factory method: create()
  static create(name: XxxName): Result<XxxEntity, XxxDomainError> {
    const spec = new XxxNameValidSpecification();
    if (!spec.isSatisfiedBy({ name })) {                          // EN9
      return Result.fail(XxxDomainError.invalidName());           // N1
    }
    const id = BaseEntityId.createWithRandomUUID();
    return Result.ok(new XxxEntity({ name, status: XxxStatus.active() }, id));
  }

  // EN4 — hydration from DB, no validation, no events
  static reconstruct(props: XxxProps, id: EntityId): XxxEntity {
    return new XxxEntity(props, id);
  }

  // EN5, EN6 — sync business method, Result pattern, direct mutation
  rename(name: XxxName): Result<void, XxxDomainError> {
    if (!this.props.status.isActive()) {
      return Result.fail(XxxDomainError.notActive());
    }
    this.props.name = name;   // EN10 — direct mutation, NO event (N4)
    return Result.empty();
  }

  // EN8 — required by BaseEntity abstract
  isValid(): boolean {
    return !!this.props.name && !!this.props.status;
  }

  // EN10 — getters
  get name(): XxxName   { return this.props.name; }
  get status(): XxxStatus { return this.props.status; }
}
```

## Verifier — najczęstsze naruszenia → VETO
| Symptom w kodzie | Złamana reguła |
|---|---|
| `extends AggregateRoot` zamiast `BaseEntity` | EN1 |
| `public constructor(` | EN2 / N5 |
| brak `static create()` lub zwraca bez `Result<>` | EN3 |
| `throw new ...` w ciele encji | N1 / EN5 |
| `async` / `await` w metodzie | N2 / EN6 |
| `import { ... } from '...infrastructure...'` | N3 |
| `this.apply(new XxxEvent(` w encji | N4 |
| `equals()` porównujący props zamiast `_id` | N6 / EN7 |
| brak implementacji `isValid()` | EN8 |
| inline regex / `.length >` zamiast Specification | EN9 |

**Pełny wzorzec**: [`entity-pattern.md`](./entity-pattern.md)
