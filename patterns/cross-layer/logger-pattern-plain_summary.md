# Logger Pattern (Plain) — Rule Card

**Tags**: "api:observability:logging"

<!-- Egzekwowalne streszczenie logger-pattern-plain.md. WIĄŻĄCE.
     Pełny wzorzec (uzasadnienie, przykład z iam, anty-wzorce): logger-pattern-plain.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Cross-Layer · **Applies to**: każdy moduł, który loguje, w projekcie BEZ kontenera DI (Fastify/Express/worker/CLI) · **Odpowiednik z DI**: `logger-pattern.md` (dla NestJS)

## MUST

- **LGP1** — Jeden root logger na cały proces (np. `src/core/logger.ts`, `pino(...)` wywołane raz).
- **LGP2** — Każdy moduł tworzy nazwane dziecko raz, na poziomie modułu: `const logger = createLogger('<moduł>')`.
- **LGP3** — Logowanie strukturalne: pola jako pierwszy argument, wiadomość jako drugi — `logger.error({ err, userId }, 'komunikat')`.
- **LGP4** — Brak PII/sekretów w polach logu — redakcja/pominięcie po stronie wywołującego (brak automatycznej redakcji frameworkowej w tym wariancie).

## MUST NOT

- **N1** — ❌ Drugi root logger (kolejne wywołanie `pino()`/odpowiednika) — psuje wspólną konfigurację.
- **N2** — ❌ `console.log`/`console.error` na ścieżce żądania lub w kodzie serwisowym.
- **N3** — ❌ Kopiowanie wzorca tokenu DI (Symbol + `@Inject`) bez kontenera, który by go rozwiązał — zwykłe wywołanie funkcji jest poprawne, nie obejściem.

## Powiązane

`cross-layer/logger-pattern.md` (wariant DI/NestJS) · `cross-layer/safe-error-propagation-pattern.md` (co wolno logować) · `cross-layer/security-invariants-pattern.md` / lokalny override Fastify (PII w logach)
