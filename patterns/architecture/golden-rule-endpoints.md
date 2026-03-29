# Golden Rule — Public/Private Endpoint Separation

> ADR-0071

## 🎯 Problem

**Niespójne URL conventions powodują błędy frontendu i wycieki danych.**

Bez ustalonej reguły każdy kontekst wymyśla własny pattern:
- `GET /service-offerings` — zwraca prywatne dane (wymaga auth) ← BŁĄD
- `GET /events?organizerId=<id>` — query param zamiast `/my/` ← BŁĄD
- Frontend nie wie co jest publiczne, co prywatne — wywołuje złe endpointy

## ✅ Reguła (Golden Rule)

> "Endpointy bez `/my` są publiczne (tylko posted/approved).
> Endpointy z `/my` zwracają wszystkie moje zasoby (wszystkie statusy)."

| Pattern | Auth | Widoczność | Filtry DB |
|---------|------|-----------|-----------|
| `GET /{resource}` | Opcjonalna | Publiczna | `moderation_status='approved'` + `status IN (posted/active)` |
| `GET /{resource}/my` | **Wymagana** | Właściciela | `owner_id=userId` — **wszystkie statusy** (DRAFT, PENDING, REJECTED) |
| `GET /{resource}/my/{sub}` | **Wymagana** | Właściciela | Jak `/my` |
| `GET /{resource}/search` | Opcjonalna | Publiczna | Jak main endpoint |

## ✅ Wzorzec — Controller

```typescript
// PUBLIC endpoint — @Public() LUB bez auth guard
@Get()
@Public()
async listPublic(@Query() query: ListPublicQueryParams): Promise<Result<...>> {
  const result = await this.queryBus.execute(new ListPublicQuery(query.page, query.limit));
  if (result.isFailure) return Result.fail(result.error);
  return result.map(dto => mapToListResponse(dto));
}

// PRIVATE /my endpoint — wymaga auth
@Get('my')
// WAŻNE: PRZED @Get(':id') — inaczej NestJS dopasuje 'my' jako :id param
@RequirePermissions({ action: Action.READ, subject: Subject.RESOURCE })
async listMy(
  @Query() query: ListMyQueryParams,
  @CurrentUser() user: UserContext
): Promise<Result<...>> {
  const result = await this.queryBus.execute(new ListMyQuery(query.page, query.limit));
  if (result.isFailure) return Result.fail(result.error);
  return result.map(dto => mapToListResponse(dto));
}

// PARAMETRIC endpoint — PO /my
@Get(':resourceId')
async getOne(@Param('resourceId') id: string): Promise<Result<...>> { ... }
```

## ✅ Wzorzec — Repository

```typescript
// Public: zawsze filtruje po approved + active
async findPublic(pagination: IPagination): Promise<Result<...>> {
  let query = this.db.selectFrom('resources')
    .where('moderation_status', '=', 'approved')
    .where('status', '=', 'active');  // lub 'posted', 'published'
  // ... pagination
}

// Owner: filtruje TYLKO po owner_id — żadnych innych ograniczeń
async findByUserId(userId: string, pagination: IPagination): Promise<Result<...>> {
  let query = this.db.selectFrom('resources')
    .where('owner_id', '=', userId);
  // NIE dodawaj filtra moderation_status ani status
  // ... pagination
}
```

## ✅ Wzorzec — Handler

```typescript
// Public handler — bez userId
@QueryHandler(ListPublicQuery)
export class ListPublicHandler extends BaseQueryHandler<...> {
  protected async executeBusinessLogic(query: ListPublicQuery) {
    // Brak userId — to endpoint publiczny
    return this.repo.findPublic({ page: query.page, limit: query.limit });
  }
}

// My handler — userId z kontekstu (Dual Identity)
@QueryHandler(ListMyQuery)
export class ListMyHandler extends BaseQueryHandler<...> {
  protected async executeBusinessLogic(query: ListMyQuery) {
    const userId = this.requestContext.getUserIdOrFail(); // NIE z query params
    return this.repo.findByUserId(userId, { page: query.page, limit: query.limit });
  }
}
```

## ❌ Anti-patterns

```typescript
// ❌ BŁĄD: /my handler NIE stosuje visibility spec
// Visibility spec jest TYLKO dla public endpoints
const isVisible = visibilitySpec.isSatisfiedBy(item, context); // ← USUŃ z /my

// ❌ BŁĄD: public endpoint z user ID z kontekstu
const userId = this.requestContext.getUserId(); // ← USUŃ z public handler

// ❌ BŁĄD: query param zamiast /my/ route
GET /events?organizerId=<userId>  // ← UŻYJ GET /events/my

// ❌ BŁĄD: @Get(':id') przed @Get('my')
@Get(':resourceId')  // NestJS dopasuje 'my' jako resourceId!
@Get('my')           // Ta trasa nigdy nie zostanie wywołana
```

## Stan zgodności w projekcie

| Context | Endpoint | Status |
|---------|---------|--------|
| Quick Jobs | `GET /quick-jobs/job-requests` + `/my/job-requests` | ✅ |
| Local Shares | `GET /local-shares` + `/my/shares` | ✅ |
| Service Offerings | `GET /service-offerings` + `/my` | ✅ |
| Events | `GET /events` + `/my` + `/my/attending` | ✅ |

## Dwuwarstwowe bezpieczeństwo (public endpoints)

```
Layer 1 (DB): WHERE moderation_status='approved' AND status='active'
Layer 2 (Spec): EventVisibilitySpecification.isSatisfiedBy(item, context)
  Rule 0: draft → false        ← obrona w głąb
  Rule 1: moderator → true
  Rule 2: deleted → false
  Rule 3: approved → true
  Rule 4: owner → true
```

## Powiązane patterns

- `dual-identity-pattern.md` — userId z JWT, nie z request body
- `integration-event-pattern.md` — zdarzenia między kontekstami
- ADR-0071 — Golden Rule (decyzja architektoniczna)
