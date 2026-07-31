# Pattern: Dynamic Request Batching

**Layer**: AI/ML
**Status**: production

## What This Is

A coalescer that turns N concurrent single-item requests into one batched GPU
forward pass. Callers keep a simple `await submit(item) -> result` interface; a
background worker collects items from a queue and flushes when **either**
`max_batch` items are queued **or** `max_wait_ms` has elapsed since the first
item in the current batch.

GPUs are throughput devices. Sixteen sequential forward passes of batch size 1
cost roughly sixteen times one forward pass of batch size 16 — the fixed kernel
launch and memory transfer overhead dominates at small sizes. Batching converts
that overhead into near-free parallelism.

## When to Use

- Multiple clients hit the same model concurrently (embeddings, classification, NER)
- Per-request latency budget can absorb a small delay (10–50 ms) for a large throughput gain
- The underlying library already accepts a list (`model.encode(texts)`, `pipeline(list)`)

**Do NOT use** for:
- Single-user services with no concurrency — the wait timer is pure added latency
- Generative/streaming endpoints where each request has a different sequence length
  and the first token must arrive fast (use continuous batching in vLLM/TGI instead)
- Models whose batch API is slower than looping (rare, but measure before assuming)

---

## Implementation

### The coalescer

```python
# models/_batcher.py
from __future__ import annotations

import asyncio
import logging
import os
import time
from collections.abc import Callable
from typing import Generic, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")
R = TypeVar("R")

ENABLED: bool = os.environ.get("INFERENCE_DYNAMIC_BATCH", "0") == "1"
DEFAULT_MAX_BATCH: int = int(os.environ.get("INFERENCE_BATCH_SIZE", "16"))
DEFAULT_MAX_WAIT_MS: int = int(os.environ.get("INFERENCE_BATCH_WAIT_MS", "15"))


class DynamicBatcher(Generic[T, R]):
    """Async batch coalescer for one underlying sync function.

    batch_fn must accept list[T] and return list[R] in the SAME ORDER.
    """

    def __init__(
        self,
        batch_fn: Callable[[list[T]], list[R]],
        *,
        name: str,
        max_batch: int = DEFAULT_MAX_BATCH,
        max_wait_ms: int = DEFAULT_MAX_WAIT_MS,
    ) -> None:
        if max_batch < 1:
            raise ValueError(f"max_batch must be >= 1, got {max_batch}")
        self._batch_fn = batch_fn
        self._name = name
        self._max_batch = max_batch
        self._max_wait = max_wait_ms / 1000.0
        self._queue: asyncio.Queue[tuple[T, asyncio.Future[R]]] = asyncio.Queue()
        self._worker_task: asyncio.Task[None] | None = None

    async def submit(self, item: T) -> R:
        self._ensure_worker()
        fut: asyncio.Future[R] = asyncio.get_running_loop().create_future()
        await self._queue.put((item, fut))
        return await fut

    def queue_depth(self) -> int:
        return self._queue.qsize()

    def _ensure_worker(self) -> None:
        # Lazy start: the worker must live on the running loop, not the import-time one
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(
                self._run_worker(), name=f"batcher:{self._name}"
            )
```

### The flush loop — size OR timeout

```python
    async def _drain_one_batch(self) -> None:
        # Block until the first item — no timer runs while the queue is empty
        first = await self._queue.get()
        batch = [first]
        deadline = time.monotonic() + self._max_wait
        flush_reason = "size"

        while len(batch) < self._max_batch:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                flush_reason = "timeout"
                break
            try:
                batch.append(await asyncio.wait_for(self._queue.get(), timeout=remaining))
            except asyncio.TimeoutError:
                flush_reason = "timeout"
                break

        items = [it for it, _ in batch]
        futs = [f for _, f in batch]
        _record_metrics(self._name, len(batch), flush_reason)

        try:
            results = await asyncio.to_thread(self._batch_fn, items)
        except Exception as err:
            await self._retry_as_singletons(items, futs, err)
            return

        if len(results) != len(futs):
            exc = RuntimeError(
                f"batcher {self._name}: batch_fn returned {len(results)} results "
                f"for {len(futs)} items — programming error"
            )
            for fut in futs:
                if not fut.done():
                    fut.set_exception(exc)
            return

        for fut, res in zip(futs, results):
            if not fut.done():
                fut.set_result(res)
```

### Partial failure isolation

Without this, one malformed input fails **every** request that happened to share
its batch. Retrying singly costs one slow pass and turns a batch-wide outage into
a single 4xx for the actual offender.

```python
    async def _retry_as_singletons(
        self, items: list[T], futs: list[asyncio.Future[R]], original_err: Exception
    ) -> None:
        if len(items) == 1:                    # already isolated — it really is broken
            if not futs[0].done():
                futs[0].set_exception(original_err)
            return

        logger.warning(
            "[batcher:%s] batch of %d failed (%s) — retrying as singletons",
            self._name, len(items), original_err,
        )
        for item, fut in zip(items, futs):
            if fut.done():
                continue
            try:
                result = await asyncio.to_thread(self._batch_fn, [item])
                fut.set_result(result[0])
            except Exception as e:
                fut.set_exception(e)
```

### Registry for non-mergeable variants

Requests only batch together when they hit the *same* weights with the *same*
preprocessing. Key a batcher per variant instead of forcing incompatible items
into one queue.

```python
class BatcherRegistry(Generic[T, R]):
    """One batcher per (model_key, prefix, ...) tuple."""

    def __init__(self, factory: Callable[[tuple], Callable[[list[T]], list[R]]], *, name_prefix: str) -> None:
        self._factory = factory
        self._name_prefix = name_prefix
        self._batchers: dict[tuple, DynamicBatcher[T, R]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: tuple) -> DynamicBatcher[T, R]:
        if (b := self._batchers.get(key)) is not None:
            return b
        async with self._lock:                       # double-check under lock
            if (b := self._batchers.get(key)) is not None:
                return b
            label = f"{self._name_prefix}:{':'.join(str(k) for k in key)}"
            b = DynamicBatcher(self._factory(key), name=label)
            self._batchers[key] = b
            return b
```

### Wiring a model, with a flag-off fallback

```python
# models/embeddings.py
_registry: BatcherRegistry[str, list[float]] = BatcherRegistry(
    factory=lambda key: _raw_encode_batch(model_key=key[0], prefix=key[1]),
    name_prefix="embeddings",
)

async def encode_async(
    texts: list[str], model_key: str = DEFAULT_MODEL, prefix: str | None = None
) -> list[list[float]]:
    await model_manager.ensure_loaded(MANAGER_KEY)

    if not is_enabled():                       # feature flag OFF → old sync path
        return await asyncio.to_thread(_encode_sync, texts, model_key, prefix)

    effective = _effective_prefix(model_key, prefix)
    batcher = await _registry.get((model_key, effective))
    return await asyncio.gather(*(batcher.submit(t) for t in texts))
```

Ship batching behind an env flag (`INFERENCE_DYNAMIC_BATCH=0/1`) so a production
rollback is a restart, not a revert-and-redeploy.

---

## Tuning

| Parameter | Start at | Raise when | Lower when |
|-----------|----------|------------|------------|
| `max_batch` | 16 | GPU utilization < 60% under load | OOM on long inputs, or p99 latency spikes |
| `max_wait_ms` | 10–20 | avg batch size stays near 1 | p50 latency budget is tight and traffic is bursty |

Instrument `flush_on_size` vs `flush_on_timeout`. **Nearly all flushes on timeout
with an average batch size near 1 means batching is doing nothing but adding
latency** — either concurrency is too low to benefit, or the variant key is too
granular and every request lands in its own batcher.

---

## Anti-Patterns

### Starting the worker at import time

`asyncio.create_task()` at module import either raises (no running loop) or binds
the worker to the wrong loop, and every `submit()` then hangs forever. Start the
worker lazily on first submit, as `_ensure_worker()` does.

### Assuming the batch function preserves order

Some libraries sort by sequence length internally to reduce padding. If results
come back reordered, every caller silently receives another caller's answer —
data corruption with no error. Verify order explicitly, and keep the
length-mismatch guard as a loud failure.

### Unbounded queue

Under overload the queue grows without limit: memory climbs and latency becomes
unbounded while clients have already timed out. Expose `queue_depth()` and reject
with 503 above a threshold.

### Batching across different weights or prefixes

Concatenating texts destined for different models — or an E5 model where some
inputs carry the `"passage: "` prefix and others do not — produces wrong
embeddings that pass every type check. Make the variant part of the batcher key.

### Cancellation left unhandled

When a client disconnects, its future is cancelled but the item stays in the
batch. Guard every completion with `if not fut.done()` (as above), or the worker
dies on `InvalidStateError`.

---

## Related Patterns

- [gpu-concurrency-pattern](gpu-concurrency-pattern.md) — why `asyncio.to_thread` wraps `batch_fn`
- [model-lifecycle-pattern](model-lifecycle-pattern.md) — ensuring weights are resident before the flush
- [ml-observability-pattern](ml-observability-pattern.md) — batch size and flush-reason metrics
