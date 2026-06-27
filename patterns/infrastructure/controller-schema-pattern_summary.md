# Controller & Schema — Rule Card
<!-- Egzekwowalne streszczenie controller-schema-pattern.md. WIĄŻĄCE dla implementacji.
     Pełny wzorzec (kontekst, uzasadnienie, 7 anti-patterns): controller-schema-pattern.md
     Verifier sprawdza KAŻDĄ regułę z ID poniżej i cytuje ją przy naruszeniu. -->

**Layer**: Infrastructure/HTTP · **Applies to**: `*.controller.ts` w `**/infrastructure/controllers/` lub `**/app/api/`
**ADR**: 0013 (Result pattern), 0020 (Zod schemas), 0021 (Dual Identity), 0022 (Rate Limiting)

## MUST

- **CS1** — każde wejście (body, params, query) walidowane przez Zod schema zdefiniowaną w `@shared/validation/schemas/**` lub lokalnie; `.strict()` obowiązkowe na body schemas.
- **CS2** — `userId` / tożsamość aktora WYŁĄCZNIE z `@CurrentUser() user: UserContext` (JWT) — NIGDY z `@Body()`, `@Param()`, `@Query()` (ADR-0021, TS-MULTI-ACTOR-001).
- **CS3** — każda metoda opatrzona `@RateLimit(XxxRateLimits.operationName)` z konfiguracji w osobnym pliku `*.rate-limits.ts` (ADR-0022).
- **CS4** — dekorator `@AuthEndpointSchema({ request, response, errors })` na każdym endpoincie — generuje OpenAPI + obsługę błędów.
- **CS5** — typy odpowiedzi to `Promise<Result<z.infer<typeof responseSchema>>>`, NIGDY surowy DTO.
- **CS6** — kontroler TYLKO orkiestruje: `commandBus.execute(...)` lub `queryBus.execute(...)`; żadna reguła biznesowa nie jest sprawdzana w kontrolerze.
- **CS7** — mapowanie `Result` na response: `if (result.isFailure) return Result.fail(result.error)` — bez rzucania wyjątków, bez odsłaniania `error.message` klientowi bezpośrednio.
- **CS8** — błędy zwracane jako typy infrastrukturalne: `AuthenticationError` (→401), `AuthorizationError` (→403), `ValidationError` (→400), `NotFoundError` (→404), `BusinessLogicError` (→422) — NIGDY `new Error(...)`.
- **CS9** — tekst free-form walidowany wzorcem `SAFE_TEXT_PATTERN = /^[^<>]*$/` lub równoważnym — ochrona przed XSS.
- **CS10** — prymitywy wspólne (email, UUID, password, coordinates) WYŁĄCZNIE przez `commonValidators.*` z `@shared/validation/common.validators` — bez inline magic numbers.
- **CS11** — dane autora/organizatora/twórcy w odpowiedzi jako zagnieżdżony `authorSnapshotSchema` (`{ userId, displayName, avatarUrl }`), nigdy jako płaskie pola (ADR drift prevention).

## MUST NOT

- **N1** — ❌ `userId` w request body lub Zod schema body — krytyczna luka bezpieczeństwa (user impersonation).
- **N2** — ❌ logika biznesowa w kontrolerze (walidacja reguł, sprawdzanie trust level, obliczenia domenowe) — należy do handlera.
- **N3** — ❌ brak `@RateLimit` na jakimkolwiek endpoincie publicznym lub wymagającym auth.
- **N4** — ❌ `throw` / wyjątek rzucony z metody kontrolera — zawsze `Result.fail(...)`.
- **N5** — ❌ pole `success: boolean` w obiekcie zwracanym przez `Result.ok(...)` — JSend interceptor dodaje status automatycznie (duplikacja).
- **N6** — ❌ surowy DTO jako typ zwracany (`Promise<UserActionDto>`) — wymagane `Promise<Result<z.infer<typeof schema>>>`.
- **N7** — ❌ `new Error(...)` jako argument `Result.fail(...)` — traci mapowanie na kod HTTP.

## Minimal correct skeleton

```ts
import { z } from 'zod';
import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { ICommandBus, Result } from '@vytches/ddd';
import { AuthenticatedGuard, CurrentUser, UserContext } from '@shared/infrastructure/auth';
import { AuthEndpointSchema } from '@shared/response';
import { ValidationError, BusinessLogicError } from '@shared/response/errors/base-response-error';
import { RateLimit } from '@shared/security/rate-limiting/decorators/rate-limit.decorator';
import { commonValidators } from '@shared/validation/common.validators';
import { authorSnapshotSchema } from '@shared/response/openapi/author-schemas';
import { XxxRateLimits } from './xxx.rate-limits';   // CS3 — oddzielny plik

// ── Zod schemas ────────────────────────────────────────────────────────────
const SAFE_TEXT = /^[^<>]*$/;                         // CS9

export const createXxxSchema = z.object({             // CS1
  title: z.string().min(3).max(200).regex(SAFE_TEXT),
  targetId: z.string().uuid(),                        // CS10 — lub commonValidators.uuid
}).strict();                                          // CS1 — .strict() obowiązkowe

export const xxxResponseSchema = z.object({
  id: z.string().uuid(),
  author: authorSnapshotSchema,                       // CS11 — zagnieżdżony snapshot
  title: z.string(),
  createdAt: z.string().datetime(),
});

export type CreateXxxInput = z.infer<typeof createXxxSchema>;
export type XxxResponse = z.infer<typeof xxxResponseSchema>;

// ── Controller ─────────────────────────────────────────────────────────────
@Controller('xxx')
@UseGuards(AuthenticatedGuard)
export class XxxController {
  constructor(@Inject(ICommandBus) private readonly commandBus: ICommandBus) {}

  @Post()
  @RateLimit(XxxRateLimits.create)                    // CS3
  @HttpCode(HttpStatus.CREATED)
  @AuthEndpointSchema({                               // CS4
    request: { body: createXxxSchema },
    response: { schema: xxxResponseSchema, status: HttpStatus.CREATED, description: 'Created' },
    errors: [ValidationError, BusinessLogicError],
    options: { operationType: 'create-xxx' },
  })
  async create(
    @Body() body: CreateXxxInput,
    @CurrentUser() user: UserContext,                 // CS2 — userId z JWT, NIE z body
  ): Promise<Result<XxxResponse>> {                  // CS5 — Result<z.infer<...>>
    const command = new CreateXxxCommand(body.title, body.targetId);
    // userId przekazywane przez RequestContextService w handlerze — NIE tu

    const result = await this.commandBus.execute<CreateXxxCommand, Result<XxxDto>>(command);

    if (result.isFailure) return Result.fail(result.error); // CS7, CS8 — bez throw (N4)

    const dto = result.value;
    return Result.ok({                               // CS6 — brak logiki domenowej
      id: dto.id,
      author: { userId: dto.authorId, displayName: dto.authorName, avatarUrl: dto.avatarUrl },
      title: dto.title,
      createdAt: dto.createdAt.toISOString(),
    });                                              // N5 — brak pola 'success'
  }
}
```

## Verifier — najczęstsze naruszenia → VETO

| Symptom w kodzie | Złamana reguła |
|---|---|
| `userId: z.string()` w schema body / `body.userId` w handlerze | N1 (CS2) |
| `if (trustLevel < 40)` lub walidacja reguły biznesowej w metodzie kontrolera | N2 (CS6) |
| Brak `@RateLimit(...)` na endpoincie | N3 (CS3) |
| `throw new Error(...)` lub `throw new XxxException(...)` | N4 (CS4) |
| `return Result.ok({ success: true, ... })` | N5 |
| `Promise<XxxDto>` zamiast `Promise<Result<XxxResponse>>` | N6 (CS5) |
| `Result.fail(new Error('msg'))` zamiast typed error | N7 (CS8) |
| Inline `z.string().email()` bez `commonValidators.email` | CS10 |
| `organizerId`, `organizerName` jako płaskie pola w response | CS11 |
| Brak `.strict()` na body schema | CS1 |

**Pełny wzorzec**: [`controller-schema-pattern.md`](./controller-schema-pattern.md)
