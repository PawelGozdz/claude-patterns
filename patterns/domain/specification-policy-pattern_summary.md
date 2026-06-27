# Specification & Policy — Rule Card
<!-- Egzekwowalne streszczenie specification-policy-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, uzasadnienie, przykłady): specification-policy-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Domain · **Applies to**: `*.specification.ts` w `**/domain/specifications/`, `*.policy.ts` w `**/domain/policies/`
**Base**: `CompositeSpecification<Ctx>` / `AsyncCompositeSpecification<Ctx>` (@vytches/ddd) · **ADR**: 0035

## MUST
- **SP1** — Specification extends `CompositeSpecification<ContextInterface>` (sync) lub `AsyncCompositeSpecification<ContextInterface>` (async).
- **SP2** — Kontekst to osobny interfejs (np. `SessionContext`) — NIGDY surowy agregat przekazywany do specyfikacji.
- **SP3** — Policy tworzona przez `function createXxxPolicy()` — factory function, NIGDY klasa z konstruktorem.
- **SP4** — PolicyBuilder ZAWSZE z obligatoryjnymi metadanymi: `.withId()`, `.withDomain()`, `.withName()` przed `.build()`.
- **SP5** — Reguły blokujące: `.must(spec)` z `.withSeverity('ERROR')`; ostrzeżenia nieblokujące: `.should(spec)` z `.withSeverity('WARNING')`.
- **SP6** — `policy.check()` zwraca `Result<void, E>` — wywołujący sprawdza `result.isFailure` i mapuje `result.error`.
- **SP7** — Agregat eksponuje `getSpecificationContext()` i deleguje do specyfikacji — zero logiki inline.
- **SP8** — Jeśli specyfikacja potrzebuje wartości z DB: handler (warstwa application) odpytuje repo, przekazuje wartość synchronicznie do `new XxxSpecification()`.
- **SP9** — `AsyncCompositeSpecification` dopuszczalne TYLKO w `PolicyBuilder.mustAsync()` i TYLKO gdy zależność to domain service interface (nie repo).
- **SP10** — Specyfikacje mają niezależne unit testy (fundament piramidy testów ADR-0035).

## MUST NOT
- **N1** — ❌ `BusinessRuleValidator.addRule()` — ZAWSZE `PolicyBuilder.must(spec)`.
- **N2** — ❌ `@Injectable()` + `@Inject(REPO_TOKEN)` w specyfikacji — repozytoria należą do handlera.
- **N3** — ❌ `async isSatisfiedBy()` z zapytaniem DB — wyciągnij wynik w handlerze, wywołaj sync spec.
- **N4** — ❌ logika biznesowa inline w agregacie zamiast delegacji do specyfikacji.
- **N5** — ❌ `throw` — policy zwraca `Result.fail(...)`, spec zwraca `boolean`.
- **N6** — ❌ pominięcie `.withId()` / `.withDomain()` / `.withName()` w PolicyBuilder.

## Minimal correct skeleton
```ts
import { CompositeSpecification, PolicyBuilder, PolicyContextFactory, Result } from '@vytches/ddd';

// SP2 — context interface (NOT aggregate)
export interface OrderContext {
  totalAmount: number;
  itemCount: number;
}

// SP1 — extends CompositeSpecification
export class MinOrderAmountSpecification extends CompositeSpecification<OrderContext> {
  isSatisfiedBy(ctx: OrderContext): boolean {   // N3 — sync, no DB
    return ctx.totalAmount >= 50;
  }
}

// SP3 — factory function, never class
export function createOrderPolicy() {
  return PolicyBuilder.create<OrderContext>()
    .withId('order-validation')               // SP4 — required
    .withDomain('orders')                     // SP4 — required
    .withName('Order Validation Policy')      // SP4 — required
    .must(new MinOrderAmountSpecification())  // SP5 — blocking
      .withCode('ORDER_TOO_SMALL')
      .withMessage('Minimum order 50 PLN')
      .withSeverity('ERROR')                  // N1 — NOT BusinessRuleValidator
    .build();
}

// Usage in application-layer service (policy.check → Result)
export class PlaceOrderService {
  async execute(ctx: OrderContext): Promise<Result<void>> {
    const policy = createOrderPolicy();
    const result = await policy.check({
      entity: ctx,
      context: PolicyContextFactory.minimal(ctx.userId), // SP6
    });
    if (result.isFailure) return Result.fail(new OrderError(result.error.message)); // N5 — no throw
    return Result.empty();
  }
}

// SP7 — aggregate delegates to spec, never inlines logic
class OrderAggregate {
  getSpecificationContext(): OrderContext { return { totalAmount: this._amount, itemCount: this._items.length }; }
  isValid(): boolean {
    return new MinOrderAmountSpecification().isSatisfiedBy(this.getSpecificationContext()); // N4 — delegate
  }
}
```

## Verifier — najczęstsze naruszenia → VETO
| Symptom w kodzie | Złamana reguła |
|---|---|
| `BusinessRuleValidator.addRule(` | N1 |
| `@Injectable()` lub `@Inject(` w specyfikacji | N2 |
| `async isSatisfiedBy(` z `await this.repo.` | N3 |
| Logika biznesowa (`if / daysSince >=`) bezpośrednio w metodzie agregatu | N4 |
| `throw new` w specyfikacji lub policy | N5 |
| `PolicyBuilder.create(` bez `.withId()` / `.withDomain()` / `.withName()` | N6 / SP4 |
| Agregat przyjmuje agregat jako arg specyfikacji zamiast context interface | SP2 |
| `class XxxPolicy` z konstruktorem zamiast `function createXxxPolicy()` | SP3 |
| Brak unit testu specyfikacji | SP10 |

**Pełny wzorzec**: [`specification-policy-pattern.md`](./specification-policy-pattern.md)
