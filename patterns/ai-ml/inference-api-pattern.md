# Pattern: Inference API Structure

**Tags**: "data:api-surface", "data:app"

**Layer**: AI/ML
**Status**: production

## What This Is

A two-layer split for FastAPI services that serve local models:

```
routers/{task}.py    HTTP boundary — Pydantic schemas, validation, error mapping
models/{task}.py     Inference — load/unload, sync core, async wrapper
model_manager.py     Lifecycle — who is in VRAM, for how long
```

`routers/` never imports `torch`. `models/` never imports `fastapi`. The rule is
mechanical, so a hook can enforce it, and it is what makes the inference core
testable without an HTTP client and the HTTP layer testable without a GPU.

## When to Use

- FastAPI service exposing more than two model-backed endpoints
- Models reused across endpoints (embeddings feeding both `/embeddings` and `/similarity`)
- You expect to add models over time

**Do NOT use** for a single-model, single-endpoint microservice — one file is fine.

---

## Implementation

### Module contract

Every `models/{task}.py` exposes the same five names. Uniformity is what lets
`model_manager` treat them interchangeably and what makes new modules boring to add.

```python
# models/embeddings.py
MANAGER_KEY = "embeddings"

async def load() -> None: ...              # called by the manager only
def unload() -> None: ...                  # drop references; manager handles gc
async def ensure_ready() -> None:          # what routers call
    await model_manager.ensure_loaded(MANAGER_KEY)

def encode(texts: list[str]) -> list[list[float]]: ...          # sync core, testable
async def encode_async(texts: list[str]) -> list[list[float]]:  # async entry point
    await ensure_ready()
    return await asyncio.to_thread(encode, texts)
```

Keeping a **pure sync core** separate from the async wrapper matters: the sync
function is what gets batched (`batch_fn`), what gets unit-tested with a stub,
and what a CLI or notebook can call directly.

### Router: validation at the boundary, nothing else

```python
# routers/embeddings.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from models import embeddings

router = APIRouter(tags=["embeddings"])


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=256)
    model: str = Field("all-MiniLM-L6-v2")
    prefix: str | None = None


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    model: str
    dimensions: int


@router.post("/embeddings/generate")
async def generate(req: EmbedRequest) -> EmbedResponse:
    try:
        vectors = await embeddings.encode_async(req.texts, req.model, req.prefix)
    except ValueError as e:                       # unknown model → client error
        raise HTTPException(400, str(e)) from e
    except RuntimeError as e:                     # not loaded / OOM → server busy
        raise HTTPException(503, f"{type(e).__name__}: {e}") from e
    return EmbedResponse(
        embeddings=vectors, model=req.model, dimensions=len(vectors[0])
    )
```

Bound every list and every text length. An inference endpoint without
`max_length` is an OOM waiting for the first client that loops wrong.

### Composite endpoints degrade per task

An all-in-one endpoint must never fail wholesale because one of eight models
misbehaved. Collect errors per task and always return 200 with a partial result.

```python
@router.post("/process_document")
async def process_document(req: ProcessRequest) -> ProcessResponse:
    t0 = time.monotonic()
    result: dict = {}
    errors: dict[str, str] = {}
    timings: dict[str, int] = {}

    unknown = set(req.tasks) - ALL_TASKS
    if unknown:
        raise HTTPException(400, f"Unknown tasks: {unknown}. Available: {ALL_TASKS}")

    await _preload_models(set(req.tasks))          # parallel load, sequential inference

    for task in ORDERED_TASKS:                     # order encodes dependencies
        if task not in req.tasks:
            continue
        t = time.monotonic()
        try:
            result[task] = await RUNNERS[task](req)
        except Exception as e:
            errors[task] = str(e)                  # degrade, don't abort
        timings[task] = int((time.monotonic() - t) * 1000)

    result["processing_time_ms"] = int((time.monotonic() - t0) * 1000)
    if errors:
        result["errors"] = errors

    logger.info(
        "process_document %dms text=%d | %s%s",
        result["processing_time_ms"], len(req.text),
        " ".join(f"{k}={v}" for k, v in timings.items()),
        f" ERR={list(errors)}" if errors else "",
    )
    return ProcessResponse(**result)
```

Two details that pay for themselves: **per-task timings in one log line** (the
only cheap way to answer "which stage got slow?"), and **task ordering that
encodes dependencies** — language detection before translation, translation
before English-only models.

### Health tells the truth about the GPU

```python
@app.get("/v1/health")
async def health() -> dict:
    return {
        "status": "ok",
        "device": config.DEVICE,
        "uptime_seconds": round(time.time() - app.state.start_time, 1),
        "models": model_manager.status(),      # name, loaded, idle_s, ttl_remaining
        "gpu": await _gpu_info(),              # nvidia-smi, async subprocess
    }
```

Health that returns `{"status": "ok"}` and nothing else is worthless for a GPU
service. The two questions during an incident are *what is resident* and *how
much VRAM is left* — answer both.

### Composition in `server.py`

```python
# Registration is declarative and lives in one place
model_manager.register("embeddings", emb.load, emb.unload, vram_mb=500,  ttl=TTL_CORE)
model_manager.register("whisper",    whi.load, whi.unload, vram_mb=3200, ttl=TTL_HEAVY)

for r in (embeddings_router, classify_router, whisper_router, ...):
    app.include_router(r.router, prefix=config.API_V1_PREFIX)
```

Never hand-maintain a list of endpoints in the root response — it drifts within
weeks. Generate it:

```python
@app.get("/")
async def root() -> dict:
    return {
        "name": "ML Inference API",
        "version": config.VERSION,
        "endpoints": sorted(
            f"{','.join(sorted(r.methods - {'HEAD', 'OPTIONS'}))} {r.path}"
            for r in app.routes
            if getattr(r, "methods", None)
        ),
    }
```

---

## Anti-Patterns

### `torch` imported in a router

Couples the HTTP layer to the ML runtime, makes every router test require CUDA,
and guarantees the layer split erodes. Enforce with a hook.

### Unbounded request fields

`texts: list[str]` with no `max_length`, `text: str` with no cap. The first
runaway client takes the service down. Bound everything, and cap upload size
before reading the body.

### Model state as module globals mutated from routers

```python
# WRONG
from models import embeddings
embeddings._instance = None      # router reaching into module internals
```

Lifecycle belongs to the manager. Routers call `ensure_ready()` and nothing else.

### Returning 200 with an error body

```python
return {"error": "model failed"}          # HTTP 200
```

Clients retry on 5xx and alert on error rates; a 200 defeats both. Map failures
to real status codes: 400 unknown model or bad input, 413 too large, 422 validation,
503 not loaded / OOM / upstream down.

### Eager loading everything in `lifespan`

Startup takes minutes, orchestrators kill the container, and VRAM is pinned by
models nobody requested. Register lazily; offer `/models/preload` for callers
that want a warm start.

---

## Related Patterns

- [model-lifecycle-pattern](model-lifecycle-pattern.md) — the manager this structure depends on
- [gpu-concurrency-pattern](gpu-concurrency-pattern.md) — why the sync core stays sync
- [ml-testing-pattern](ml-testing-pattern.md) — testing this split without a GPU
