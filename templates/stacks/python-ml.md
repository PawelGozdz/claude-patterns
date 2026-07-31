## Agent Ecosystem

**3 tiers** (all auto-discovered via symlinks):

| Tier | Agents | Model |
|------|--------|-------|
| Advisory | ml-inference-architect, python-architecture-expert | Sonnet |
| Verification | gpu-resource-verifier (VETO), python-quality-verifier (VETO) | Sonnet |
| Utility | codebase-explorer, test-generator | Haiku |

**Cost targets**:

| Model | Target |
|-------|--------|
| Opus | %%COST_OPUS%% |
| Sonnet | %%COST_SONNET%% |
| Haiku | %%COST_HAIKU%% |

---

## Architecture: Two-Layer Inference Split

```
routers/{task}.py     HTTP boundary — Pydantic schemas, validation, error mapping
models/{task}.py      Inference — load/unload, sync core, async wrapper
model_manager.py      Lifecycle — residency, TTL, VRAM budget, eviction
```

**The rule is mechanical and enforced by hooks**:
- `routers/` NEVER imports `torch`, `transformers`, or any model library
- `models/` NEVER imports `fastapi`

This is what makes the inference core testable without an HTTP client, and the
HTTP layer testable without a GPU.

### Uniform module contract

Every `models/{task}.py` exposes the same five names, so `model_manager` can
treat them interchangeably:

```python
MANAGER_KEY = "embeddings"

async def load() -> None: ...              # called by the manager ONLY
def unload() -> None: ...                  # drop references; manager runs gc
async def ensure_ready() -> None:          # what routers call
    await model_manager.ensure_loaded(MANAGER_KEY)

def encode(texts: list[str]) -> list[list[float]]: ...          # sync core — batchable, testable
async def encode_async(texts: list[str]) -> list[list[float]]:  # async entry point
    await ensure_ready()
    return await asyncio.to_thread(encode, texts)
```

---

## GPU Rules (CRITICAL)

These are the failure modes that type checkers and ordinary review do not catch.

1. **The lifecycle manager is the only loader.** A getter that lazy-loads behind
   its back desyncs `loaded`, defeats the TTL sweep, and leaks VRAM until restart.
2. **Every inference call goes through `asyncio.to_thread`.** One unwrapped call
   in `async def` freezes every concurrent request, health checks included.
3. **`gc.collect()` before `torch.cuda.empty_cache()`.** Reversed, unload frees nothing.
4. **Preflight VRAM, then evict LRU.** Never let CUDA OOM decide.
5. **Batch, don't parallelize.** The GPU serializes; `asyncio.gather` over
   inference calls only multiplies peak VRAM.
6. **One worker process.** `uvicorn --workers N` means N full copies of the weights.
7. **Small thread pool (~4).** Threads free the event loop; they do not
   parallelize a single GPU.
8. **Serialize thread-unsafe libraries** (spaCy GPU, faster-whisper) with a semaphore.

**Enforced by**: `check-gpu-patterns.js` (blocking calls, `empty_cache` without
`gc.collect`, `gather` fan-out) and `check-python-layers.js` (torch in routers).

---

## Model Lifecycle: Lazy + TTL Tiers

Models load on first request and are evicted after per-model inactivity TTL.
Tier by `reload_cost / usage_frequency` — a single global TTL is wrong for both
the smallest and the largest model at once.

```python
TTL_CORE     = 1800   # 30 min — small, hot (embeddings, language id)
TTL_STANDARD = 600    # 10 min — moderate usage
TTL_HEAVY    = 300    #  5 min — multi-GB, rare (STT, seq2seq)

model_manager.register("embeddings", emb.load, emb.unload, vram_mb=500,  ttl=TTL_CORE)
model_manager.register("whisper",    whi.load, whi.unload, vram_mb=3200, ttl=TTL_HEAVY)
```

Declared `vram_mb` drives preflight and LRU eviction. Measure it — peak usage is
routinely 1.5–3× the weights (see skill `ai-ml/gpu-memory-budget`).

---

## Dynamic Batching

Coalesce concurrent single-item requests into one GPU forward pass. Flush when
`max_batch` items are queued **or** `max_wait_ms` elapsed.

```python
async def encode_async(texts: list[str]) -> list[list[float]]:
    await model_manager.ensure_loaded(MANAGER_KEY)
    if not is_enabled():                            # env flag → instant rollback
        return await asyncio.to_thread(_encode_sync, texts)
    batcher = await _registry.get((model_key, prefix))
    return await asyncio.gather(*(batcher.submit(t) for t in texts))
```

Requirements: `batch_fn` preserves **order and length** (verify it — reordering
silently returns another caller's result), partial failures retry as singletons,
and the feature ships behind `INFERENCE_DYNAMIC_BATCH=0/1`.

Watch `avg_batch_size` and flush reason. Average near 1 with all flushes on
timeout means batching is pure added latency.

---

## Request Validation

Every field is bounded. An inference endpoint without limits is an OOM waiting
for the first client that loops wrong.

```python
class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=256)
    model: str = Field("all-MiniLM-L6-v2")

class ProcessRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=100_000)
```

Uploads: check `Content-Length` **before** reading the body, stream to a temp
file, never `await file.read()` unbounded.

---

## Error Mapping

| Condition | Status |
|-----------|--------|
| Unknown model / unknown task | 400 |
| Upload too large | 413 |
| Unsupported media type | 415 |
| Pydantic validation | 422 |
| Model not loaded / CUDA OOM / upstream down | 503 |

Composite endpoints degrade per task — collect errors per stage and return 200
with a partial result plus an `errors` map. One failed model must never fail the
whole request.

---

## Observability

Cold and warm latency are different metrics, not one distribution. The same
endpoint answers in 40 ms warm and 25 s cold; the average describes neither.

```python
inference_latency_seconds{endpoint, state="cold|warm"}   # histogram
gpu_memory_used_bytes                                    # gauge
model_loaded{model}                                      # gauge
model_evictions_total{model, reason="ttl|vram_pressure"} # counter
batcher_flush_reason_total{name, reason="size|timeout"}  # counter
```

Never alert on average latency. Alert on VRAM > 95%, eviction thrashing, and
queue depth. Exclude `/health` and `/metrics` from request counters — a 15 s
scrape adds ~14 000 phantom requests a day.

---

## Testing Strategy

**GPU tests are integration tests** — slow, hardware-bound, not CI-runnable.
Everything testable without CUDA must be, or the suite never runs.

| Type | Coverage | GPU | What |
|------|----------|-----|------|
| **Unit** | ~60% | No | Batcher, lifecycle, chunking, validation, cache |
| **API** | ~25% | No | Routes with stubbed model modules |
| **Integration** | ~15% | Yes | Real weights, marked and excluded by default |

```toml
[tool.pytest.ini_options]
markers = ["unit", "api", "gpu", "integration"]
addopts = "-m 'not gpu and not integration' --strict-markers"
```

Stub at the model module, never at `torch` — patching `torch` produces green
tests over code that could never run. Assert invariants (shape, relative
similarity ordering), not exact float values that break on the next checkpoint.

Use **pytest** + **pytest-asyncio** + **pytest-cov**. Coverage target: 80%+ on
control logic.
