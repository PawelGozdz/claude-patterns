# Security Invariants Pattern (Python)

**Version**: 1.0
**Last Updated**: 2026-10-10
**Tags**: "api:security", "api:authz"

**Status**: PRODUCTION
**Priority**: CRITICAL
**Layer**: Cross-Layer
**Primary Users**: layer implementers from runtime.yml, python-quality-verifier, final security gate

Python counterpart of `cross-layer/security-invariants-pattern.md` (NestJS). Same five
invariants, Python idioms. HTTP invariants apply **where the project exposes an HTTP API
(FastAPI)**; invariants 1, 4, 5 also apply to CLIs, workers and message consumers.

---

## When to Use

- Every task in a Python project (this pattern is on `patterns.always` of the `python` block).
- Writing or reviewing FastAPI routes, auth dependencies, rate limits/allowlists, workers or queue consumers that act on behalf of an identity, and any logging of request data.

---

## Problem

Without a fixed checklist every task re-derives security expectations and the same
defect classes (IDOR, implicit-allow endpoints, fail-open limiters, leaked driver
errors, PII in logs) are found late, in review or in production.

---

## The 5 Invariants

### SI1 - Identity comes from the authenticated context, never from the input

Request models (Pydantic) at an HTTP boundary MUST NOT declare `user_id` / `actor` /
`owner_id`. The same holds for non-HTTP entry points: a CLI flag, queue message or job
payload does not get to name the acting identity - it comes from the authenticated
session / signed envelope / worker config.

```python
# WRONG - client chooses whose profile it is (IDOR)
class CreateProfileRequest(BaseModel):
    user_id: UUID                      # NEVER accept from the body
    display_name: str

# RIGHT - body has no identity; route takes it from auth dependency
class CreateProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")   # a smuggled user_id -> 422
    display_name: str = Field(min_length=1, max_length=100)

@router.post("/profiles", status_code=201)
async def create_profile(
    body: CreateProfileRequest,
    user: AuthenticatedUser = Depends(require_user),   # from verified token
    service: ProfileService = Depends(get_profile_service),
) -> ProfileResponse:
    return await service.create(user_id=user.id, display_name=body.display_name)
```

Non-HTTP: a consumer of `{"user_id": ..., "action": ...}` taken from the broker body is
the same bug; resolve identity from the verified envelope (signature / mTLS / queue ACL).
Audit "actor" fields likewise come from the authenticated identity, not env vars or input.

### SI2 - Every route declares its auth policy explicitly

Every FastAPI route is protected by an explicit auth dependency, or is explicitly public
with a justification. Prefer router-level `dependencies=[...]` so a new route cannot
forget it; public routes live on a separate, visibly named router.

```python
# WRONG - no dependency; policy depends on whatever middleware/default exists
@router.get("/profiles/{profile_id}")
async def get_profile(profile_id: UUID, service: ProfileService = Depends(get_profile_service)): ...

# RIGHT - protected router; permission is explicit per route
router = APIRouter(prefix="/profiles", dependencies=[Depends(require_user)])

@router.get("/{profile_id}")
async def get_profile(
    profile_id: UUID,
    user: AuthenticatedUser = Depends(require_permission("profile:read")),
    service: ProfileService = Depends(get_profile_service),
) -> ProfileResponse:
    # object-level check too: authenticated != authorized for THIS profile
    return await service.get_for(user_id=user.id, profile_id=profile_id)

public_router = APIRouter(tags=["public"])

@public_router.get("/healthz")   # PUBLIC: liveness probe for load balancer
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
```

`require_user` / `require_permission` MUST deny on missing, malformed or unverifiable
credentials (401/403) - never return an anonymous user as a default.

### SI3 - Rate limit / throttle / quota guards are fail-closed

When the limiter backend (Redis, in-memory store) is unavailable the guard answers 503 -
never "allow". Fail-open lets an attacker disable the limit by loading the backend.
Same for any gate (scope allowlist, feature flag for a risky action, license check):
cannot evaluate = deny.

```python
# WRONG - backend down = no rate limit
async def rate_limit(request: Request, limiter: Limiter = Depends(get_limiter)) -> None:
    try:
        if await limiter.hit(request.client.host):
            raise HTTPException(status_code=429)
    except Exception:
        return                                    # fail-open

# RIGHT
async def rate_limit(request: Request, limiter: Limiter = Depends(get_limiter)) -> None:
    try:
        exceeded = await limiter.hit(client_key(request))
    except (redis.RedisError, OSError, asyncio.TimeoutError):
        logger.error("rate_limit_backend_unavailable", exc_info=True)
        raise HTTPException(status_code=503, detail="Service temporarily unavailable")
    if exceeded:
        raise HTTPException(status_code=429, detail="Too many requests")
```

Catch the specific backend errors, and let `HTTPException` (429) pass through untouched -
a bare `except Exception` around the whole body would turn 429 into 503 or swallow it.

### SI4 - No raw `str(exc)` / traceback in any caller-visible output

HTTP bodies, CLI stdout/stderr meant for users, task results returned to an
orchestrator and message replies must not contain `str(exc)`, `repr(exc)`, `exc.args`,
`traceback.format_exc()` or `exc.__cause__` text. Driver errors embed table, column,
constraint names, SQL, DSNs and sometimes credentials. Map to a code + static message;
full detail goes to the log only. Full discipline: `python/safe-error-propagation-pattern.md`.

```python
# WRONG
@app.exception_handler(Exception)
async def handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"error": str(exc)})     # leaks internals

# RIGHT
@app.exception_handler(Exception)
async def handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("unhandled_error", exc_info=exc, path=request.url.path)
    return JSONResponse(status_code=500,
                        content={"error": "INTERNAL_ERROR", "message": "An unexpected error occurred"})
```

Also disable debug tracebacks outside local dev (`FastAPI(debug=False)`), and do not
expose validation `input` echo for secret-bearing fields (`RequestValidationError` bodies
repeat the submitted value - strip `input` / `ctx` for password/token fields).

### SI5 - No PII or secrets in log calls

Log fields MUST NOT contain e-mail, phone, full name, address, coordinates, IP,
payment data, government IDs, tokens, passwords, API keys, or raw tool/subprocess output
(which may contain any of these). Log opaque IDs; hash or truncate when correlation is
needed; select fields explicitly - never `**model.model_dump()` or `extra=vars(user)`.

```python
# WRONG
logger.info("user_login", email=user.email, ip=request.client.host, payload=body.model_dump())

# RIGHT
logger.info("user_login", user_id=str(user.id), email_hash=sha256_hex(user.email)[:16])
```

Use the project's structured logger (structlog / `logging` with a JSON formatter), never
`print()`. Declare secret fields as `SecretStr` in Pydantic models and settings so that
`repr()` / `model_dump()` / logs show `**********`. Raw output of external processes goes
through the project's redactor before it is logged or sent to an LLM.

---

## Anti-patterns

| Anti-pattern | Why bad | Correct approach |
|---|---|---|
| `user_id: UUID` in request model / queue payload | IDOR | Take identity from `Depends(require_user)` / verified envelope |
| Route with no auth dependency, relying on global middleware | Implicit policy drift | Router-level `dependencies=[...]`; explicit public router |
| `except Exception: return` in limiter / policy gate | Fail-open under stress | Catch backend errors, raise 503 |
| `detail=str(exc)` / `f"...{exc}"` in response | Leaks schema/DSN | Static message + code; log the detail |
| `logger.info("x", **user.model_dump())` | Spreads PII silently | Pick fields explicitly |
| `password: str` in a model that gets logged | Secret in `repr()` | `SecretStr` |
| `print(exc)` / `traceback.print_exc()` in service code | Bypasses redaction/log pipeline | Structured logger with `exc_info` |

---

## Quick reference

- ✅ Identity from `Depends(get_current_principal)` / verified message metadata
- ✅ Explicit auth dependency on every router; public routes marked with a reason
- ✅ Limiter/allowlist backend down → reject (503 / exception)
- ❌ `user_id` / `actor` field in a Pydantic input model used for authorization
- ❌ `except Exception: return True` in a guard (fail-open)
- ❌ `detail=str(exc)`, tracebacks or PII in responses and log fields

## Related

- `python/safe-error-propagation-pattern.md` - error hygiene (SI4 in depth)
- `python/fastapi-patterns.md` - Depends, exception handlers, app factory
- `cross-layer/security-invariants-pattern.md` - TypeScript/NestJS original

---

## Implementation Checklist

- [ ] No `user_id`/actor field in request models, queue payloads, CLI args; identity from auth dependency
- [ ] Pydantic input models use `extra="forbid"` on write endpoints
- [ ] Every route is covered by an auth dependency (router-level) or sits on an explicit public router with a reason
- [ ] Object-level authorization checked, not just "is logged in"
- [ ] Limiters / policy gates raise 503 (or deny) when their backend errors; 429 not swallowed
- [ ] No `str(exc)`, `repr(exc)`, traceback in responses, user-visible output or returned results
- [ ] Log calls use explicit fields: no PII, no secrets, no raw subprocess output; secrets typed `SecretStr`
