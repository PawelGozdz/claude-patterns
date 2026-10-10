# Safe Error Propagation Pattern (Python)

**Version**: 1.0
**Last Updated**: 2026-10-10
**Tags**: "api:security", "api:api-surface:errors"

**Status**: PRODUCTION
**Priority**: CRITICAL
**Layer**: Cross-Layer
**Primary Users**: layer implementers from runtime.yml, python-quality-verifier, final security gate

Python counterpart of `cross-layer/safe-error-propagation-pattern.md` (NestJS/Kysely).
Same intent: infrastructure error text never reaches a caller. Applies to HTTP
(FastAPI) and equally to CLIs, workers, subprocess wrappers and message consumers.

---

## When to Use

- Every task in a Python project (this pattern is on `patterns.always` of the `python` block).
- Writing repositories/adapters, domain exceptions, FastAPI exception handlers, or code that returns subprocess/worker/CLI results to a caller or an LLM.

---

## Problem

```
asyncpg.UniqueViolationError: duplicate key value violates constraint "profiles_user_id_key"
  -> repository wraps: RepositoryError(f"save failed: {exc}")
    -> service re-raises / returns it
      -> exception handler: JSONResponse({"detail": str(exc)})
        -> caller sees table, constraint and column names
```

Same chain for `redis.ConnectionError` (DSN), `httpx.HTTPStatusError` (upstream URL),
`subprocess.CalledProcessError` (argv, stderr).

---

## Rules

### Rule 1 - Repositories/adapters: generic message, raw error only as `__cause__`

Translate driver exceptions into a small project exception hierarchy at the adapter
boundary. Message is static; the original is chained with `from exc` (log-only).

```python
# CORRECT
class PersistenceError(Exception):
    """Infrastructure failure. Message is static and safe; detail lives in __cause__."""
    def __init__(self, operation: str) -> None:
        super().__init__("Operation could not be completed")
        self.operation = operation            # fixed vocabulary: "save", "find", ...

async def save(self, profile: Profile) -> None:
    try:
        await self._session.merge(ProfileRow.from_entity(profile))
        await self._session.flush()
    except IntegrityError as exc:             # sqlalchemy.exc / asyncpg: unique, FK
        raise ConflictError("profile") from exc
    except (SQLAlchemyError, asyncpg.PostgresError, OSError) as exc:
        raise PersistenceError("save") from exc

# WRONG: raise PersistenceError(f"Failed to save: {exc}") / RuntimeError(str(exc))
```

Catch specific exception families, not bare `except Exception` (that hides programmer
errors as "persistence"). Never `except: pass`. No logging in repositories - the layer
that decides the outcome logs it (Rule 3).

### Rule 2 - Domain exceptions: fixed `code`, static message, no `details` parameter

```python
class DomainError(Exception):
    code: str = "DOMAIN_ERROR"
    user_message: str = "Request could not be processed"
    def __init__(self) -> None:
        super().__init__(self.user_message)

class ProfileNotFoundError(DomainError):
    code, user_message = "PROFILE_NOT_FOUND", "Profile not found"

# WRONG: def __init__(self, details: str): super().__init__(f"Profile error: {details}")
```

Variable data a client needs (field name, limit) is a typed attribute from a closed set.

### Rule 3 - Services: log the raw error, raise a generic domain error

```python
# CORRECT
try:
    await self._repo.save(profile)
except PersistenceError as exc:
    logger.error("profile_persist_failed", operation=exc.operation, exc_info=exc)
    raise ProfileUnavailableError() from exc       # static, code=PROFILE_UNAVAILABLE

# WRONG: bare `raise` (unlogged, reaches mapper) / raise ProfileError(f"Failed: {exc}")
```

Log once at the decision point, not at every layer.

---

### Rule 4 - `except` blocks: never put `str(exc)` into a returned/raised value

Applies to every return channel, not only exceptions:

```python
# CORRECT - external service / subprocess wrapper returning a result object
try:
    proc = await asyncio.wait_for(run_tool(argv), timeout=60)
except (OSError, asyncio.TimeoutError) as exc:
    logger.error("tool_run_failed", tool=tool_name, exc_info=exc)
    return ToolResult(ok=False, error_code="TOOL_FAILED")          # no stderr, no argv

# WRONG
return ToolResult(ok=False, error=f"{tool_name} failed: {exc}")    # exc may embed argv/paths/secrets
return {"error": proc.stderr.decode()}                              # raw stderr to caller/LLM
```

Same for CLI output, Celery/RQ task results (stored in the result backend, readable by
API callers) and message replies. Log with `exc_info`, return a code.

### Rule 5 - HTTP exception handlers: static messages, never `str(exc)` / `exc.args`

Register handlers once in the app factory; they are the last line of defense.

```python
# CORRECT
@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(status_code=STATUS_BY_CODE.get(exc.code, 400),
                        content={"error": exc.code, "message": exc.user_message})

@app.exception_handler(Exception)
async def fallback_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error("unhandled_error", exc_info=exc, path=request.url.path)
    return JSONResponse(status_code=500,
                        content={"error": "INTERNAL_ERROR", "message": "An unexpected error occurred"})

# WRONG
raise HTTPException(status_code=500, detail=str(exc))
content={"error": exc.code, "message": str(exc) or "Operation not permitted"}   # dynamic fallback
```

`HTTPException(detail=...)` takes a literal or a constant, never an exception-derived
value. For `RequestValidationError` return field paths + Pydantic `msg` type, and drop
`input`/`ctx` (they echo submitted values, including passwords and tokens).

### Rule 5b - Code-keyed mappers: `case _:` has its own generic message

In `match exc.code:` never write `case "PAY_INVALID_CURRENCY" | _:` or share its text
with the fallback; a future third code would silently be reported as a currency error.
Use `case _: return ApiError(422, "Invalid payment request")`.

### Rule 6 - Mechanical guardian test (discipline decays)

Any project with HTTP handlers / error mappers MUST have a test that fails when a
leak shape reappears; review alone regresses (the TS original re-leaked for four months).

- **SEP6** - a guardian test exists and runs on every PR (source-text AST/regex scan).
- **SEP7** - discover target files by walking the tree (`Path("src").rglob("*.py")`
  filtered by name/content), never a hand-maintained list.
- **SEP8** - scan root covers every location of handlers/mappers (global fallback too).
- **SEP9** - detect all shapes: `str(exc)`, `repr(exc)`, `exc.args`, `f"...{exc}..."`,
  `.format(exc)`, `traceback.format_exc()`, `exc.__cause__` flowing into
  `HTTPException(detail=...)`, `JSONResponse(content=...)`, returned result objects,
  directly or via an intermediate variable or dict key. Prefer an `ast` walk
  (names bound by `except ... as exc` used in f-strings/calls) over a single regex.
- **SEP10** - anti-vacuous pass: assert discovered file count >= floor and that one
  named reference file is in the set; otherwise a broken scan root is 0 tests, 100% green.


---

## Classification

Safe to propagate as-is: `DomainError` subclasses (fixed code + static message) and
closed-set validation errors. Everything else (`PersistenceError`, any driver / HTTP
client / subprocess exception, external service or tool output) is logged at the
decision point and replaced by a generic domain error. Defense in depth: adapter
(static message, `__cause__` only) -> service (log once, generic domain error) ->
handler/CLI (code + static message).

## Anti-patterns to flag in review

| Pattern | Verdict |
|---|---|
| `detail=str(exc)` / `content={"error": str(exc)}` | BLOCK |
| `raise XError(f"...: {exc}")` / `XError(str(exc))` | BLOCK |
| `return {"error": exc.args[0]}` / `stderr` forwarded to caller | BLOCK |
| `except Exception: pass` or `except Exception: return None` | BLOCK (silent swallow) |
| Celery/RQ task returns `str(exc)` into result backend | BLOCK |
| `case X \| _:` / shared `default` message with a named case | BLOCK |
| Handlers exist, no guardian test or list-based guardian | BLOCK (SEP6/SEP7) |

## Quick reference

- ✅ `raise RepoError("query failed") from exc` — raw error only in `__cause__`
- ✅ Log raw error server-side, then raise a generic domain error with a fixed `code`
- ✅ Exception handlers map `code` → static message; `case _:` has its own message
- ❌ `DomainError(str(exc))`, `f"... {exc}"` in a raised or returned value
- ❌ `HTTPException(detail=str(exc))`
- ❌ Returning subprocess `stderr` to the caller or to an LLM without redaction

## Related

- `python/security-invariants-pattern.md` - SI4, SI5
- `python/fastapi-patterns.md` - exception handler registration
- `cross-layer/safe-error-propagation-pattern.md` - TypeScript/NestJS original (SEP6-SEP10 origin)

## Implementation Checklist

- [ ] Adapters map driver exceptions to project exceptions with static messages, `raise ... from exc`
- [ ] No exception-derived text in exception messages, result objects, task results, CLI output
- [ ] Services log the raw error once (`exc_info`) and raise/return a generic domain error
- [ ] Handlers return `code` + static message; fallback handler returns `INTERNAL_ERROR`
- [ ] Validation error responses drop `input`/`ctx`
- [ ] Code-keyed mappers: `default` has its own neutral message
- [ ] Guardian test present: tree-walk discovery, all leak shapes, floor + reference-file control
