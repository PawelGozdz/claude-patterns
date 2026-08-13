# Pattern: GPU Concurrency in an Async Service

**Tags**: "data:app:concurrency", "data:platform:gpu"

**Layer**: AI/ML
**Status**: production

## What This Is

Rules for running synchronous, GPU-bound, frequently thread-unsafe ML libraries
inside an async web server without stalling the event loop or corrupting CUDA
state.

The core tension: FastAPI/uvicorn is single-threaded and cooperative, while
PyTorch inference is a blocking C call that holds the thread for the whole
forward pass. One unwrapped `model.encode(...)` in an `async def` freezes every
other request in the process — health checks included.

## When to Use

Any async service performing local model inference. If you `import torch` in a
FastAPI app, this pattern applies.

---

## Implementation

### Rule 1 — every inference call goes through a thread

```python
# WRONG — blocks the event loop for the entire forward pass
@router.post("/embeddings")
async def embed(req: EmbedRequest) -> EmbedResponse:
    vectors = model.encode(req.texts)          # 200 ms of frozen server
    return EmbedResponse(embeddings=vectors)

# CORRECT — the GPU call runs on a worker thread
@router.post("/embeddings")
async def embed(req: EmbedRequest) -> EmbedResponse:
    vectors = await asyncio.to_thread(model.encode, req.texts)
    return EmbedResponse(embeddings=vectors)
```

This works because PyTorch releases the GIL during CUDA operations, so the event
loop keeps serving other requests while the kernel runs.

### Rule 2 — size the thread pool small, on purpose

```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # 4 threads: the GPU serializes work anyway. Threads exist to free the
    # event loop, NOT to create parallelism that the hardware cannot deliver.
    loop = asyncio.get_event_loop()
    loop.set_default_executor(ThreadPoolExecutor(max_workers=4))
    yield
```

A 32-thread pool does not make a single GPU faster. It multiplies peak VRAM
(each in-flight forward pass holds its own activations), increases context
switching, and turns a queue that would be visible into an OOM that is not.

### Rule 3 — serialize models that are not thread-safe

Several popular libraries are not safe to call concurrently even from separate
threads. Guard them with a semaphore instead of hoping.

```python
_gliner_sem = asyncio.Semaphore(1)   # GLiNER: one call at a time

async def extract_async(text: str, labels: list[str]) -> list[dict]:
    await model_manager.ensure_loaded("gliner")
    async with _gliner_sem:
        return await asyncio.to_thread(_extract_sync, text, labels)
```

Known offenders, verified in production:

| Library | Behaviour | Mitigation |
|---------|-----------|------------|
| spaCy + `thinc`/CuPy GPU mode | Not thread-safe; corrupts state or segfaults | Run on CPU, or serialize with a semaphore |
| `faster-whisper` | One transcription per model instance | Semaphore(1) per instance |
| `transformers` pipelines | Generally safe for forward passes | Safe, but batch instead of parallelizing |
| `sentence-transformers` | Safe for `encode()` | Prefer batching over concurrency |

Where a library is not thread-safe, prefer
[dynamic batching](dynamic-batching-pattern.md) over concurrency: one thread,
larger batches, better GPU utilization and no lock contention.

### Rule 4 — initialize GPU context before importing model libraries

Frameworks that hook CUDA at import (CuPy, some `thinc` builds) must see a
configured device first. Otherwise they silently fall back to CPU and you
discover it as a mysterious 40× slowdown.

```python
# server.py — order matters
import config                        # calls torch.cuda.is_available(), sets DEVICE
import model_manager

from models import embeddings        # only now import model modules
from models import gliner
```

Where a native library needs its loader path set (CuPy against cuBLAS), export
`LD_LIBRARY_PATH` in the service environment rather than mutating `os.environ`
after import — by then the dynamic linker has already resolved.

### Rule 5 — never block in a lifespan handler

Eagerly loading five models at startup delays readiness by minutes and makes
orchestrators kill the container before it ever answers. Register lazily
(see [model-lifecycle-pattern](model-lifecycle-pattern.md)) and expose an
explicit warm-up endpoint for callers that want to pay the cost up front:

```python
@app.post("/v1/models/preload")
async def preload(req: PreloadRequest) -> dict:
    loaded, errors = [], {}
    for name in req.models:
        try:
            await model_manager.ensure_loaded(name)
            loaded.append(name)
        except Exception as e:
            errors[name] = str(e)
    return {"loaded": loaded, "errors": errors or None}
```

### Rule 6 — parallelize loading, serialize inference

When one request needs several models, loading can overlap (much of it is disk
I/O and host→device copy), but inference cannot — the GPU serializes regardless.

```python
async def process_document(req: ProcessRequest) -> ProcessResponse:
    # Cold-start cost overlaps across models
    await asyncio.gather(
        *(mod.ensure_ready() for mod in required_models(req.tasks)),
        return_exceptions=True,
    )

    # Inference stays sequential — gather here would only add contention
    result = {}
    if "entities" in req.tasks:
        result["entities"] = await gliner.extract_async(req.text, LABELS)
    if "classify" in req.tasks:
        result["classification"] = await classifier.classify_async(req.text, req.labels)
    return ProcessResponse(**result)
```

Note the `return_exceptions=True`: one model failing to load must not abort the
other loads. Record the failure per task and degrade gracefully.

---

## Anti-Patterns

### `async def` on a function that never awaits

```python
# WRONG — the async keyword is decoration; this blocks exactly as hard
async def extract(text: str) -> list[dict]:
    return model.predict(text)
```

If it does not `await`, it is not async. Either make it a plain `def` called via
`to_thread`, or await something inside.

### `asyncio.gather` over independent GPU calls

```python
# WRONG — no speedup, 6x peak VRAM, possible OOM
entities, sentiment, keywords = await asyncio.gather(
    ner_async(text), sentiment_async(text), keywords_async(text)
)
```

The GPU runs them one at a time anyway. All you have bought is simultaneous
activation memory for three models.

### Catching `Exception` around a CUDA OOM and continuing

After `torch.cuda.OutOfMemoryError` the allocator is fragmented and subsequent
requests fail unpredictably. Handle it explicitly: free memory, then either
retry once at a smaller batch or fail the request.

```python
try:
    return await asyncio.to_thread(model.encode, texts)
except torch.cuda.OutOfMemoryError:
    torch.cuda.empty_cache()
    logger.error("CUDA OOM on batch of %d — retrying smaller", len(texts))
    raise HTTPException(503, "GPU out of memory, retry with fewer items")
```

### Blocking the event loop with `subprocess.run("nvidia-smi")`

Use `asyncio.create_subprocess_exec`, or better `torch.cuda.mem_get_info()`.

### Sharing one model instance across worker processes

`uvicorn --workers 4` forks four processes, each loading its own full copy of the
weights — 4× VRAM for the same throughput. For GPU services run **one** worker
process and scale with threads and batching.

---

## Related Patterns

- [dynamic-batching-pattern](dynamic-batching-pattern.md) — the preferred alternative to concurrency
- [model-lifecycle-pattern](model-lifecycle-pattern.md) — who owns loading
- [inference-api-pattern](inference-api-pattern.md) — service structure around these rules
