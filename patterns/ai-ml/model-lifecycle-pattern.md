# Pattern: Model Lifecycle (Lazy Load + TTL + VRAM Budget)

**Layer**: AI/ML
**Status**: production

## What This Is

A central registry that owns *when* every ML model enters and leaves VRAM.
Models load on first request, refresh a `last_used` timestamp on every call, and
are evicted by a background sweep after a per-model TTL. Before any load, the
manager checks free VRAM and evicts least-recently-used models rather than
letting CUDA raise OOM mid-load.

The registry is the **single source of truth** about what is resident. Nothing
else may load or free a model.

## When to Use

- Any service hosting more than one model where all models together exceed VRAM
- GPU shared with other processes (Ollama, ComfyUI, training jobs, another service)
- Models with very different usage frequency (embeddings every second, Whisper twice a day)
- Cold-start cost is acceptable but permanent residency is not

**Do NOT use** when you host exactly one small model that always fits — a module-level
singleton loaded at startup is simpler and has no eviction failure modes.

---

## Implementation

### Registry with per-model TTL tiers

```python
# model_manager.py
import asyncio
import gc
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

CHECK_INTERVAL_SECONDS: int = 60

# TTL tiers — tune by (frequency of use) x (cost of reload)
TTL_CORE: int = 1800      # 30 min — small, hot models (embeddings, language id)
TTL_STANDARD: int = 600   # 10 min — moderate usage
TTL_HEAVY: int = 300      #  5 min — multi-GB, rarely used (STT, seq2seq)

VRAM_SAFETY_MARGIN_MB: int = 1024


@dataclass
class ManagedModel:
    name: str
    loader: Callable[[], Awaitable[None]]
    unloader: Callable[[], None]
    vram_mb: int                       # declared footprint — drives eviction
    ttl: int = TTL_STANDARD
    last_used: float = 0.0
    loaded: bool = False
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_models: dict[str, ManagedModel] = {}


def register(
    name: str,
    loader: Callable[[], Awaitable[None]],
    unloader: Callable[[], None],
    *,
    vram_mb: int,
    ttl: int = TTL_STANDARD,
) -> None:
    _models[name] = ManagedModel(
        name=name, loader=loader, unloader=unloader, vram_mb=vram_mb, ttl=ttl
    )
    logger.info("Registered model: %s (TTL=%ds, ~%d MB)", name, ttl, vram_mb)
```

### VRAM preflight with LRU eviction

The critical part: **make room before loading**, and fail with a readable error
rather than a CUDA OOM traceback.

```python
def free_vram_mb() -> int:
    """Free VRAM in MB. Cheaper than shelling out to nvidia-smi."""
    import torch
    if not torch.cuda.is_available():
        return 0
    free_bytes, _total = torch.cuda.mem_get_info()
    return free_bytes // (1024 * 1024)


async def _make_room_for(needed_mb: int, exclude: str) -> None:
    """Evict least-recently-used models until needed_mb is free."""
    target = needed_mb + VRAM_SAFETY_MARGIN_MB
    while free_vram_mb() < target:
        candidates = [
            m for m in _models.values()
            if m.loaded and m.name != exclude
        ]
        if not candidates:
            raise RuntimeError(
                f"Cannot free {target} MB — need {needed_mb} MB + margin, "
                f"{free_vram_mb()} MB free, no evictable models left. "
                f"Another process may be holding VRAM."
            )
        victim = min(candidates, key=lambda m: m.last_used)
        logger.info(
            "VRAM pressure: evicting %s (idle %.0fs) to make room for %s",
            victim.name, time.time() - victim.last_used, exclude,
        )
        await unload(victim.name)


async def ensure_loaded(name: str) -> None:
    """Load if needed, refresh last_used. The ONLY way a model enters VRAM."""
    model = _models.get(name)
    if model is None:
        raise ValueError(f"Unknown managed model: {name}")

    async with model._lock:
        if not model.loaded:
            await _make_room_for(model.vram_mb, exclude=name)
            before = free_vram_mb()
            t0 = time.monotonic()
            await model.loader()
            model.loaded = True
            after = free_vram_mb()
            logger.info(
                "Loaded %s in %.1fs (VRAM %d → %d MB, delta %d MB)",
                name, time.monotonic() - t0, before, after, before - after,
            )
        model.last_used = time.time()
```

### Unload frees for real

`del` is not enough. Python must drop the reference, the garbage collector must
run, and the CUDA caching allocator must be told to release blocks.

```python
async def unload(name: str) -> None:
    model = _models.get(name)
    if model is None or not model.loaded:
        return

    async with model._lock:
        if not model.loaded:
            return
        before = free_vram_mb()
        model.unloader()          # drops references to the model object
        model.loaded = False

    gc.collect()                  # must run BEFORE empty_cache()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass
    logger.info("Unloaded %s (VRAM %d → %d MB)", name, before, free_vram_mb())
```

### Background sweep

```python
async def _sweep() -> None:
    while True:
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
        now = time.time()
        # snapshot: unload() mutates state while we iterate
        for name in list(_models):
            m = _models[name]
            if m.loaded and m.last_used > 0 and (now - m.last_used) > m.ttl:
                await unload(name)
```

### Registration is declarative, at import time

```python
# server.py
model_manager.register(
    "embeddings", emb.load, emb.unload,
    vram_mb=500, ttl=model_manager.TTL_CORE,
)
model_manager.register(
    "whisper", whisper.load, whisper.unload,
    vram_mb=3200, ttl=model_manager.TTL_HEAVY,
)
```

---

## Anti-Patterns

### Loading behind the manager's back

The single most damaging bug in this pattern. A module lazy-loads its own model
in a getter, so VRAM is occupied while the registry believes the model is unloaded:

```python
# WRONG — self-healing getter that desyncs the registry
def encode(texts: list[str]) -> list[list[float]]:
    model_manager.touch("embeddings")     # only refreshes the timestamp
    model = _get_model()                   # ...and this quietly re-loads it
    return model.encode(texts).tolist()

def _get_model():
    if _instance is None:
        _load()          # registry never learns about this
    return _instance
```

Consequences, all silent:
- `/health` reports `loaded: false` for a model sitting in VRAM
- the sweep skips it forever (`if model.loaded` is False) → VRAM leaks until restart
- eviction math is wrong, so preflight under-counts and OOMs later

```python
# CORRECT — the manager is the only loader
async def encode_async(texts: list[str]) -> list[list[float]]:
    await model_manager.ensure_loaded("embeddings")   # idempotent, cheap when warm
    return await asyncio.to_thread(_encode_sync, texts)
```

If a sync path genuinely cannot await, make the getter *raise* instead of loading:

```python
def _get_model():
    if _instance is None:
        raise RuntimeError("embeddings not loaded — call ensure_loaded() first")
    return _instance
```

Loud failure in a test beats a silent VRAM leak in production.

### One global TTL

A 10-minute TTL is simultaneously too short for a 50 MB model used every minute
and too long for a 3 GB model used twice a day. Tier the TTL by
`reload_cost / usage_frequency`.

### Unloading without `gc.collect()`

`torch.cuda.empty_cache()` only releases blocks with no live references. Skipping
the collection makes unload look like a no-op — VRAM never drops, and the next
preflight evicts more models chasing memory that was never freed.

### Eviction without a safety margin

Loading a 3 GB model into exactly 3 GB of free VRAM fails: allocators need
headroom for workspace and fragmentation. Always reserve a margin.

### Trusting `nvidia-smi` in the hot path

Spawning a subprocess per request costs 30–80 ms — often more than the inference
itself. Use `torch.cuda.mem_get_info()` in code; reserve `nvidia-smi` for the
human-facing health endpoint.

---

## Related Patterns

- [gpu-concurrency-pattern](gpu-concurrency-pattern.md) — running the loaded model without blocking the event loop
- [dynamic-batching-pattern](dynamic-batching-pattern.md) — coalescing requests once the model is resident
- [ml-observability-pattern](ml-observability-pattern.md) — exposing load/evict events as metrics
