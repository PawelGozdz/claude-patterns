# Domain Errors — Rule Card

**Tags**: "api:domain:errors"
<!-- Egzekwowalne streszczenie domain-errors-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (Result API, hierarchia błędów, przykłady): domain-errors-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu.
     Geneza karty (2026-07-03): cross-layer nie miał ŻADNYCH Rule Cards — RULE 7 pełnego
     wzorca (aktualizacja mappera) była łamana w ~90% przypadków → produkcyjne 500-tki. -->

**Layer**: Cross-Layer · **Applies to**: `domain/**/errors/`, enumy kodów błędów, `*error-mapper*` / `ERROR_HTTP_STATUS`, handlery CQRS (obsługa `Result.fail`)

## MUST
- **DE1** — Operacje domenowe zwracają `Result<T, E>` (`ok(value)` / `empty()` / `fail(error)`) —
  wywołujący sprawdza `isFailure` i mapuje `result.error`. NIGDY `throw` w domenie.
- **DE2** — Każdy błąd domenowy ma **stabilny `code`** z enuma kodów projektu (np.
  `ProjectErrorCode.XXX`) — nie ad-hoc string, nie sama klasa bez kodu.
- **DE3 (KRYTYCZNA — łamana w ~90% przypadków; 72 klasy w 8/11 kontekstów, audyt 2026-07)** —
  **NOWY kod błędu ⇒ wpis w kontekstowym error-mapperze (`IDomainErrorMapper`) W TYM SAMYM
  PR/diffie.** Błąd bez mapowania NIE daje 500 — realnie ląduje na generycznym 422 z
  `GlobalFallbackErrorMapper` (`ERROR_HTTP_STATUS` nie jest niezawodną siatką bezpieczeństwa, patrz
  domain-errors-pattern.md Anti-Pattern 5), tracąc zamierzony status i treść. Definicja błędu i jego
  mapowanie to JEDNA zmiana, nie dwie. Mechaniczny backstop: obowiązkowy L1 guardian coverage test
  per mapper (`rules/nestjs-ddd/error-mapper.md`, helper
  `src/shared/response/testing/error-mapper-coverage.guardian.ts`) — CI blocker, nie polega już
  wyłącznie na review.
- **DE4** — Mapowanie błąd→HTTP żyje w warstwie infrastruktury (mapper/registry) — domena nie zna
  kodów HTTP.
- **DE5** — `error.message` NIE trafia do odpowiedzi HTTP (leak szczegółów) — klient dostaje
  `code` + generyczny komunikat; szczegóły idą do logów. (Patrz safe-error-propagation-pattern.)

## MUST NOT
- **N1** — ❌ `throw new ...` w `domain/` (agregaty, VO, specyfikacje, serwisy domenowe).
- **N2** — ❌ catch-and-swallow (`catch {}` / `catch (e) { logger.warn(...) }` bez `fail`/rethrow)
  — błąd znika, stan niespójny.
- **N3** — ❌ Nowy członek enuma kodów błędów bez odpowiadającego wpisu w mapperze (= złamane DE3).
- **N4** — ❌ Mapowanie po `instanceof` klasy błędu rozsiane po kontrolerach zamiast centralnego
  mappera po `code`.

## Minimal correct skeleton
```ts
// domain/errors/xxx.errors.ts — DE1/DE2
export class XxxCapacityExceededError extends DomainError {
  readonly code = ProjectErrorCode.XXX_CAPACITY_EXCEEDED; // DE2 — stabilny kod z enuma, D_-prefiksowany
}

// infrastructure/.../xxx-error.mapper.ts — PRIMARY mechanizm (TEN SAM PR co nowy kod! — DE3)
private readonly errorMappings = new Map<ErrorConstructor<BaseError>, MapFn>([
  // ...istniejące...
  [XxxCapacityExceededError, error => new ConflictError('Capacity exceeded', { code: error.code })], // DE3/DE4
]);

// infrastructure/.../xxx-error-mapper-coverage.guardian.spec.ts — CI backstop (patrz error-mapper.md)
findUnregisteredErrorClasses({ domainRoots: [...], mapperFiles: [...], exclusions: [...] }); // must be []
```

## Verifier — najczęstsze naruszenia → VETO
| Symptom w kodzie | Złamana reguła |
|---|---|
| W diffie: nowa klasa błędu w `domain/**`, a `errorMappings` Map w kontekstowym mapperze NIETKNIĘTA | **DE3/N3** |
| Kontekstowy mapper bez pliku `*-error-mapper-coverage.guardian.spec.ts` | **DE3** (brak mechanicznego backstopu) |
| `throw new` w `domain/**` | N1 |
| `catch` bez `Result.fail(...)` ani rethrow | N2 |
| `error.message` w body odpowiedzi HTTP / mapowane 1:1 do klienta | DE5 |
| `instanceof XxxError` w kontrolerze zamiast mapowania po `code` | N4 |
| Klasa błędu bez właściwości `code`, lub `code` bez prefiksu `D_` | DE2 |

**Pełny wzorzec**: [`domain-errors-pattern.md`](./domain-errors-pattern.md)
