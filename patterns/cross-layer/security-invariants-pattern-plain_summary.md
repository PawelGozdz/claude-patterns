# Security Invariants (Plain) — Rule Card

**Tags**: "api:security", "api:authz"

<!-- Egzekwowalne streszczenie security-invariants-pattern-plain.md. WIĄŻĄCE.
     Pełny wzorzec (przykłady z Fastify, uzasadnienie): security-invariants-pattern-plain.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Cross-Layer · **Applies to**: trasy, guardy, hooki i middleware w serwisie Node BEZ NestJS (Fastify/Express/worker) · **Odpowiednik NestJS**: `security-invariants-pattern.md`

## MUST

- **SIP1** — Tożsamość aktora pochodzi z zaufanej granicy (nagłówek ustawiany przez gateway/forward-auth albo zweryfikowany token). Schemat ciała i query na granicy HTTP **nie zawiera** pola aktora (`userId`, `actor`, `grantedBy`).
- **SIP2** — Każda trasa ma jawny mechanizm dostępu (`preHandler`/middleware/guard) albo komentarz „intentionally open" (np. `/health`).
- **SIP3** — Awaria zależności bezpieczeństwa (introspekcja tokena, store rate-limitu, brak wymaganej konfiguracji) kończy się **fail-closed**: odpowiedź 503 albo odmowa startu — nigdy cichym przejściem dalej.
- **SIP4** — Odpowiedź 5xx nie zawiera `error.message` ani `error.stack` błędów infrastruktury; treść jest statyczna. Echo komunikatu dozwolone tylko dla 4xx opisujących samo żądanie (walidacja, malformed JSON).
- **SIP5** — Wywołania loggera nie zawierają PII (e-mail, telefon, adres, treść wiadomości); identyfikuj po opaque ID i nazwie zdarzenia.

## MUST NOT

- **N1** — ❌ Pole aktora w schemacie ciała żądania albo odczyt aktora z `req.body`/`req.query`.
- **N2** — ❌ Trasa bez guardu i bez komentarza „intentionally open".
- **N3** — ❌ `catch { return true }` w guardzie albo limiter przepuszczający ruch, gdy jego store nie działa (fail-open).
- **N4** — ❌ `reply.send({ error: err.message })` i pochodne dla błędu 5xx.
- **N5** — ❌ E-mail, numer telefonu, adres, treść wiadomości w polach logu.

## Powiązane

`cross-layer/security-invariants-pattern.md` (wariant NestJS) · `cross-layer/safe-error-propagation-pattern-plain.md` (higiena komunikatów między warstwami) · `cross-layer/logger-pattern-plain.md`
