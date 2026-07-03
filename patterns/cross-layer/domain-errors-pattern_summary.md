# Domain Errors — Rule Card
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
- **DE3 (KRYTYCZNA — łamana w ~90% przypadków)** — **NOWY kod błędu ⇒ wpis w error-mapperze /
  `ERROR_HTTP_STATUS` W TYM SAMYM PR/diffie.** Błąd bez mapowania dochodzi do warstwy HTTP jako
  „nieznany" (brak właściwości `code` w mapowaniu) → klient dostaje **500** zamiast właściwego
  4xx z kodem. Definicja błędu i jego mapowanie to JEDNA zmiana, nie dwie.
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
  readonly code = ProjectErrorCode.XXX_CAPACITY_EXCEEDED; // DE2 — stabilny kod z enuma
}

// infrastructure/.../error-mapper (TEN SAM PR co nowy kod! — DE3)
export const ERROR_HTTP_STATUS: Record<ProjectErrorCode, number> = {
  // ...istniejące...
  [ProjectErrorCode.XXX_CAPACITY_EXCEEDED]: 409, // DE3/DE4
};
```

## Verifier — najczęstsze naruszenia → VETO
| Symptom w kodzie | Złamana reguła |
|---|---|
| W diffie: nowy członek enuma kodów błędów, a plik mappera/`ERROR_HTTP_STATUS` NIETKNIĘTY | **DE3/N3** |
| `throw new` w `domain/**` | N1 |
| `catch` bez `Result.fail(...)` ani rethrow | N2 |
| `error.message` w body odpowiedzi HTTP / mapowane 1:1 do klienta | DE5 |
| `instanceof XxxError` w kontrolerze zamiast mapowania po `code` | N4 |
| Klasa błędu bez właściwości `code` | DE2 |

**Pełny wzorzec**: [`domain-errors-pattern.md`](./domain-errors-pattern.md)
