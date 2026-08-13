# Structured Logging — Rule Card

**Tags**: "api:observability:logging"

<!-- Egzekwowalne streszczenie logger-pattern.md. WIĄŻĄCE.
     Pełny wzorzec (5 wariantów DI, 6 anty-wzorców, przykłady): logger-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Cross-Layer · **Applies to**: handlery, serwisy, repozytoria, mappery — wszystko, co loguje · **Powiązane ADR**: ADR-0027

## MUST

- **LOG1** — Klasy warstwy aplikacji, domeny i infrastruktury logują przez token `LOGGER_SERVICE`.
- **LOG2** — Wstrzyknięcie przez konstruktor: `@Inject(LOGGER_SERVICE) private readonly logger: ILoggerService`.
- **LOG3** — Import z modułu współdzielonego: `import { LOGGER_SERVICE, type ILoggerService } from '@shared/infrastructure/logging'`.
- **LOG4** — Logowanie strukturalne: dane złożone idą jako obiekt metadanych, nie sklejony string.
- **LOG5** — Kontekst serwisu przez child logger: `logger.createChildLogger(ServiceName.name)`.
- **LOG6** — Klasy bazowe (`BaseCommandHandler`, `BaseQueryHandler`) dostają logger przez `super(logger, ...)`.

## MUST NOT

- **N1** — ❌ `new Logger()` w warstwie aplikacji, domeny lub infrastruktury.
- **N2** — ❌ `@Inject(ILoggerService)` — interfejsy znikają w runtime, wstrzykuje się token.
- **N3** — ❌ Kilka instancji loggera w jednej klasie — jedna, z DI.
- **N4** — ❌ PII w logach bez redakcji (`LOGGER_SERVICE` redaguje automatycznie przez `REDACTION_SERVICE`; ręczne obejścia to obejście redakcji).
- **N5** — ❌ `console.log()` w kodzie produkcyjnym — nieustrukturyzowane, nietrwałe, nieredagowane.

## MAY

- **M1** — `new Logger()` jest dopuszczalny w inicjalizacji na poziomie modułu (przed dostępnością DI), w samodzielnych klientach zewnętrznych (dostawcy AI, integracje bez kontekstu projektu) oraz w `main.ts`/bootstrapie.

## Powiązane

`cross-layer/safe-error-propagation-pattern.md` (co wolno logować, a co propagować) · `cross-layer/security-invariants-pattern.md` (SI5 — PII w logach)
