# Zod Schema Validation — Rule Card

**Tags**: "api:security:validation", "api:api-surface:contract"
<!-- Egzekwowalne streszczenie zod-schema-validation-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, uzasadnienie, przykłady, anti-patterns): zod-schema-validation-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Infrastructure · **Applies to**: pliki definiujące schematy Zod — `*.schemas.ts` w
`**/validation/schemas/**`, `common.validators.ts`, `*-schemas.ts` w `**/response/openapi/**` ·
**ADR**: 0020 (Zod na granicy API), 0021 (walidacja formatu na granicy, reguły biznesowe w domenie)

## MUST

- **ZOD1** — `.strict()` na KAŻDYM schemacie obiektowym — nieznane pola są odrzucane, nie cicho pomijane.
- **ZOD2** — walidacja UUID na każdym id — `z.string().uuid()`, nigdy goły `z.string()`.
- **ZOD3** — pola tekstowe (free-text) przechodzą przez safe-text pattern — `/^[^<>]*$/` lub
  równoważny — HTML w polu tekstowym to wektor XSS.
- **ZOD4** — współdzielone koncepty (email, hasło, UUID, współrzędne, ograniczone liczby) przez
  `commonValidators` / `PASSWORD_REQUIREMENTS` — nie inline per schema.
- **ZOD5** — schematy odpowiedzi są eksportowane i inferowane — kontroler zwraca
  `Result<z.infer<typeof schema>>`, nie ręcznie pisane DTO.
- **ZOD6** — dane autora/organizatora/twórcy w response DTO jako zagnieżdżony obiekt
  `AuthorSnapshotDto { userId, displayName, avatarUrl }` (przez `authorSnapshotSchema`, opcjonalnie
  `.extend()`) — NIGDY jako płaskie pola (`authorId`, `authorName`, `authorAvatarUrl`).

## MUST NOT

- **N1** — ❌ reguła biznesowa w schemacie (np. "użytkownik poniżej 16 lat nie może publikować") —
  schema sprawdza TYLKO format; znaczenie należy do domeny (ADR-0021).
- **N2** — ❌ duplikowanie walidatora inline, gdy `commonValidators` już go ma — dwie kopie dryfują
  (np. `min(8)` lokalnie vs `PASSWORD_REQUIREMENTS.minLength=12`).
- **N3** — ❌ schemat bez `.strict()` — literówka w nazwie pola przechodzi walidację po cichu.

## Minimal correct skeleton

```typescript
import { z } from 'zod';
import { commonValidators, PASSWORD_REQUIREMENTS } from '@shared/validation/common.validators';
import { authorSnapshotSchema } from '@shared/response/openapi/author-schemas';

const SAFE_TEXT_PATTERN = /^[^<>]*$/;                                    // ZOD3

export const createThingSchema = z
  .object({
    targetId: z.string().uuid('Target ID must be a valid UUID'),         // ZOD2
    email: commonValidators.email,                                       // ZOD4
    note: z.string().max(500).regex(SAFE_TEXT_PATTERN),                  // ZOD3
  })
  .strict();                                                             // ZOD1 / N3

export const thingResponseSchema = z.object({                           // ZOD5
  id: z.string().uuid(),
  organizer: authorSnapshotSchema,                                       // ZOD6 — nested, not flat
});

export type CreateThingInput = z.infer<typeof createThingSchema>;
export type ThingResponse = z.infer<typeof thingResponseSchema>;
```

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| `z.object({...})` bez `.strict()` na końcu | ZOD1 / N3 |
| `targetId: z.string()` zamiast `.uuid()` | ZOD2 |
| pole tekstowe bez regexu / safe-text patternu | ZOD3 |
| `email: z.string().email()` zamiast `commonValidators.email` | ZOD4 / N2 |
| `password: z.string().min(8)` obok istniejącego `PASSWORD_REQUIREMENTS` | N2 |
| kontroler zwraca ręcznie pisany DTO zamiast `z.infer<typeof schema>` | ZOD5 |
| `organizerId` + `organizerDisplayName` jako płaskie pola w response | ZOD6 |
| `.refine()` sprawdzający regułę biznesową (np. limit domenowy) w schemacie | N1 |

**Pełny wzorzec**: [`zod-schema-validation-pattern.md`](./zod-schema-validation-pattern.md)
