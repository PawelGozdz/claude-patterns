# Public API Surface — Rule Card

**Tags**: "lib:api-surface:barrel"
<!-- Egzekwowalne streszczenie public-api-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (kontekst, uzasadnienie, przykłady): public-api-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Architecture · **Applies to**: `index.ts` publikowanych pakietów TS, np. `packages/*/src/index.ts`, `libs/*/src/index.ts`

## MUST

- **PA1** — `index.ts` biblioteki eksportuje WYŁĄCZNIE nazwane eksporty (`export { X } from ...` / `export type { X } from ...`) — żaden `export *`.
- **PA2** — Katalog `internal/` (i inne pliki oznaczone jako wewnętrzne, np. `*.internal.ts`) nigdy nie pojawia się w `index.ts` ani w żadnym re-eksporcie tranzytywnym.
- **PA3** — Identyfikatory domenowe (ID, kody walut, kwoty itp.) są typami markowanymi (`Brand<T, B>`), tworzonymi wyłącznie przez funkcje fabryczne walidujące format w runtime.
- **PA4** — Typy unii/discriminated union eksportowane publicznie mają towarzyszące type guardy (`is*`) eksportowane obok nich — konsument nie potrzebuje `as`/rzutowań.
- **PA5** — Publiczne API eksportuje interfejsy/typy + funkcje fabryczne, nie konkretne klasy implementacyjne.
- **PA6** — Każda funkcja oznaczona `@deprecated` w JSDoc ma też runtime `console.warn` przy pierwszym wywołaniu (JSDoc samo nie ostrzega osób bez wsparcia IDE/typów).
- **PA7** — Wpis `@deprecated` zawiera wersję wprowadzenia, planowaną wersję usunięcia i ścieżkę migracji (np. „Use `xV2()` instead").

## MUST NOT

- **N1** — ❌ `export * from './...'` w `index.ts` — leakuje wewnętrzne helpery i uniemożliwia detekcję breaking change.
- **N2** — ❌ Eksport konkretnej klasy zamiast interfejsu + fabryki — wiąże konsumentów z implementacją.
- **N3** — ❌ Surowy `string`/`number` jako publiczny typ identyfikatora zamiast branded type — `userId` i `paymentId` stają się zamienne bez błędu kompilacji.
- **N4** — ❌ Usunięcie API oznaczonego `@deprecated` w wersji minor/patch — łamie kontrakt semver (usuwać tylko w kolejnym major).
- **N5** — ❌ Eksport mutowalnych obiektów/tablic z publicznego API bez `readonly` — konsument może zmutować współdzielony stan.
- **N6** — ❌ Import z `internal/` (lub pliku `*.internal.ts`) spoza własnego pakietu — nawet pośrednio przez re-eksport w `index.ts`.

## Minimal correct skeleton

```ts
// libs/payments/src/index.ts -- THE public API surface

// Types (branded, PA3)
export type { PaymentIntent, PaymentStatus } from './types/payment.types';
export { paymentId, amountInCents } from './types/payment.types';       // PA3 factories

// Functions (interface + factory, not classes, PA5)
export { createPaymentIntent } from './services/create-payment-intent';

// Type guards travel with their union type (PA4)
export { isPaymentComplete, isRefundable } from './guards/payment.guards';

// Deprecated API: JSDoc + runtime warn (PA6/PA7)
/**
 * @deprecated Since v2.3.0. Use `processRefundV2()` instead. Removed in v3.0.0.
 */
export { processRefund, processRefundV2 } from './services/process-refund';

// NEVER exported: libs/payments/src/internal/*  (PA2, N6)
```

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| `export * from './...'` w `index.ts` | **N1** / PA1 |
| `import { ... } from '.../internal/...'` poza własnym plikiem wewnętrznym | **N6** / PA2 |
| `index.ts` eksportuje `class Foo` zamiast `interface`/`type` + fabryki | **N2** / PA5 |
| Publiczny typ pola `id: string` zamiast `id: PaymentId` (brak `Brand<...>`) | **N3** / PA3 |
| `export type PaymentStatus = 'a' \| 'b' \| ...` bez towarzyszącego `isPaymentStatus`/`is*` w tym samym pliku eksportów | **N4-adjacent: PA4** |
| Funkcja z `@deprecated` w JSDoc bez `console.warn` w ciele | **PA6** |
| `@deprecated` bez wersji/migracji w komentarzu | **PA7** |
| Usunięcie eksportu oznaczonego wcześniej `@deprecated` w commitcie z `fix:`/`patch` (nie `major`/`BREAKING CHANGE:`) | **N4** |
| Eksportowany obiekt/tablica bez `readonly` w typie | **N5** |

**Pełny wzorzec**: [`public-api-pattern.md`](./public-api-pattern.md)
