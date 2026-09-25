# Rate Limit Guard — Rule Card

**Tags**: "api:security:rate-limit"
<!-- Egzekwowalne streszczenie rate-limit-guard-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, uzasadnienie, przykłady): rate-limit-guard-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Infrastructure · **Applies to**: kontrolery/endpointy (`@Post`/`@Put`/`@Delete`/`@Get`) oraz
plik `*.rate-limits.ts` per kontekst w `**/api/**` · **ADR**: 0022 (Unified Rate Limiting)

## MUST

- **RLG1** — `@RateLimit` na KAŻDYM endpointcie (ADR-0022) — w tym na odczytach, które są kosztowne
  w obsłudze (wyszukiwanie, zapytania geo, eksporty).
- **RLG2** — limity żyją w `*.rate-limits.ts`, jeden plik per kontekst, importowany przez kontroler —
  nigdy jako liczby wpisane wprost w dekoratorze.
- **RLG3** — endpointy uwierzytelniania mają `blockDuration` — wyczerpanie limitu blokuje wywołującego,
  nie tylko go spowalnia.
- **RLG4** — kluczem limitu jest zalogowany aktor, gdy istnieje; adres klienta w przeciwnym razie.

## MUST NOT

- **N1** — ❌ endpoint zapisu (create/update/delete/mail/SMS) bez `@RateLimit` — otwiera drogę do
  DoS (masowy `POST` bez limitu przeciąża bazę).
- **N2** — ❌ liczby limitu wpisane inline w dekoratorze zamiast w `*.rate-limits.ts` — przestają być
  przeglądalne jako zbiór.

## Minimal correct skeleton

```typescript
// xxx.rate-limits.ts                                                    — RLG2
export const XxxRateLimits: Record<string, RateLimitConfig> = {
  postComment: {
    points: 20,
    duration: 15 * 60,
    blockDuration: 15 * 60,                                              // RLG3 (auth/sensitive)
  },
};

// xxx.controller.ts
@Post('comments')
@RequirePermissions({ action: Action.CREATE, subject: Subject.COMMENT })
@RateLimit(XxxRateLimits.postComment)                                    // RLG1
async postComment(@Body() body: PostCommentInput): Promise<Result<CommentResponse>> {
  // limit key = authenticated actor (RLG4), enforced by the guard before this runs
}
```

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| endpoint `@Post`/`@Put`/`@Delete` bez `@RateLimit` | RLG1 / N1 |
| `@RateLimit({ points: 20, duration: 900 })` wpisany inline w dekoratorze | RLG2 / N2 |
| endpoint logowania/rejestracji bez `blockDuration` w konfiguracji | RLG3 |
| brak osobnego pliku `*.rate-limits.ts` dla kontekstu | RLG2 |
| limit kluczowany po IP mimo dostępnego zalogowanego aktora | RLG4 |

**Pełny wzorzec**: [`rate-limit-guard-pattern.md`](./rate-limit-guard-pattern.md)
