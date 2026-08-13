# Specification & Policy — Rule Card

**Tags**: "api:domain"
<!-- Egzekwowalne streszczenie specification-policy-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, uzasadnienie, przykłady): specification-policy-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Domain · **Applies to**: `*.specification.ts` w `**/domain/specifications/`, `*.policy.ts` w `**/domain/policies/`
**Base**: `CompositeSpecification<Ctx>` / `AsyncCompositeSpecification<Ctx>` (@vytches/ddd) · **ADR**: 0035

## MUST
- **SP1** — Specification extends `CompositeSpecification<ContextInterface>` (sync) lub `AsyncCompositeSpecification<ContextInterface>` (async).
- **SP2** — Kontekst to osobny interfejs (np. `SessionContext`) — NIGDY surowy agregat przekazywany do specyfikacji.
- **SP3** — Rozróżniaj DWA rodzaje policy (audyt 2026-07: brak tego rozróżnienia = 6/8 fałszywych trafień):
  - **SP3a — Business Rule Policy** (blokująca, werdykt allow/block): tworzona przez
    `function createXxxPolicy()` zwracającą `PolicyBuilder...build()` — NIGDY klasa z konstruktorem.
  - **SP3b — Calculation Policy** (ADR-0035: zwraca WARTOŚĆ — wycena, próg, scoring — nie werdykt):
    dopuszczalna klasa LUB funkcja; NIE używa PolicyBuildera; nazwa/JSDoc jasno wskazuje kalkulację.
  - Plik `*.policy.ts` MUSI być jednym z dwóch. Ani PolicyBuilder, ani rozpoznawalna kalkulacja
    zwracająca wartość → naruszenie SP3.
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
  **Dekorator `@BusinessRule(RULES.xxx)` NIE jest dowodem delegacji** — jeśli ciało metody pod
  dekoratorem zawiera warunki biznesowe inline (a nie wywołanie `*.isSatisfiedBy(...)` /
  `policy.check(...)`), to jest naruszenie N4 = VETO. (Audyt 2026-07: 5/8 agregatów miało dekorator
  bez realnej delegacji — grep po samym `@BusinessRule` to przepuszczał; trzeba czytać ciało metody.)
  Uwaga: `@BusinessRule` to dekorator PROJEKTOWY (konwencja np. juz-ide-api-1), NIE część
  `@vytches/ddd` — reguła obowiązuje w każdym projekcie, który taki dekorator wprowadził;
  w projektach bez niego N4 sprawdzaj po samej treści metod agregatu.
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
| `@BusinessRule(` nad metodą, której CIAŁO nie woła `isSatisfiedBy(`/`policy.check(` (czytaj ciało, nie sam dekorator!) | N4 |
| `throw new` w specyfikacji lub policy | N5 |
| `PolicyBuilder.create(` bez `.withId()` / `.withDomain()` / `.withName()` | N6 / SP4 |
| Agregat przyjmuje agregat jako arg specyfikacji zamiast context interface | SP2 |
| `class XxxPolicy` egzekwująca reguły (werdykt) zamiast `function createXxxPolicy()` — NAJPIERW sprawdź, czy to nie Calculation Policy (SP3b: zwraca wartość → OK) | SP3a |
| `*.policy.ts` bez PolicyBuildera I bez rozpoznawalnej kalkulacji zwracającej wartość | SP3 |
| Brak unit testu specyfikacji | SP10 |

**Pełny wzorzec**: [`specification-policy-pattern.md`](./specification-policy-pattern.md)
