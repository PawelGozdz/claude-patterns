# Pattern: Testing ML Services Without a GPU

**Tags**: "data:tests"

**Layer**: AI/ML
**Status**: production

## What This Is

A test strategy for inference services where most of the code is not the model.
Batching, lifecycle, chunking, validation, error mapping, and routing are all
ordinary logic — they carry most of the bugs and need none of the hardware.

The premise: **GPU tests are integration tests.** They are slow, need exclusive
hardware, and cannot run in CI. Everything that can be tested without CUDA must
be, or the suite never runs and the coverage target becomes decorative.

## When to Use

Any ML service. The pattern matters most where the GPU is shared with other
workloads, so a test run competes with production for VRAM.

---

## Implementation

### Test pyramid, adjusted

| Layer | Share | GPU | What |
|-------|-------|-----|------|
| Unit | ~60% | No | Batcher, lifecycle, chunking, IOC/regex, cache, config |
| API | ~25% | No | Routes with stubbed model modules — validation, status codes, error mapping |
| Integration | ~15% | Yes | Real weights, marked and excluded by default |

### Markers that keep GPU tests out of the default run

```toml
# pyproject.toml
[tool.pytest.ini_options]
markers = [
    "unit: no GPU, no network, no model weights",
    "api: FastAPI TestClient with stubbed models",
    "gpu: requires CUDA and real weights — excluded by default",
    "integration: requires a running service",
]
addopts = "-m 'not gpu and not integration' --strict-markers"
```

`pytest` runs the fast suite. `pytest -m gpu` runs the slow one deliberately.

```python
requires_gpu = pytest.mark.skipif(
    not torch.cuda.is_available(), reason="no CUDA device"
)

@pytest.mark.gpu
@requires_gpu
def test_embeddings_dimensions_real_model() -> None:
    vectors = embeddings.encode(["hello"])
    assert len(vectors[0]) == 384
```

Both the marker and the skipif: the marker keeps it out of the default run, the
skipif keeps `-m gpu` from failing on a machine without a card.

### Stub model modules, not the HTTP layer

The uniform module contract (`load`/`unload`/`ensure_ready`/sync core/async
wrapper) makes stubbing mechanical.

```python
# tests/conftest.py
@pytest.fixture
def stub_embeddings(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_encode_async(texts, model_key="all-MiniLM-L6-v2", prefix=None):
        return [[0.1] * 384 for _ in texts]      # correct shape, no GPU

    monkeypatch.setattr(embeddings, "encode_async", fake_encode_async)
    monkeypatch.setattr(embeddings, "ensure_ready", AsyncMock())


@pytest.fixture
async def client(stub_embeddings) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.api
async def test_embeddings_rejects_oversized_batch(client: AsyncClient) -> None:
    r = await client.post("/v1/embeddings/generate", json={"texts": ["x"] * 500})
    assert r.status_code == 422        # max_length=256 enforced at the boundary
```

Stub at the model module, not at `torch`. Patching `torch` produces tests that
pass against code that could never run.

### The batcher is pure logic — test it hard

No GPU, no models, fully deterministic. This is where the concurrency bugs live.

```python
@pytest.mark.unit
async def test_flushes_on_max_batch() -> None:
    seen: list[list[int]] = []

    def batch_fn(items: list[int]) -> list[int]:
        seen.append(items)
        return [i * 2 for i in items]

    b = DynamicBatcher(batch_fn, name="t", max_batch=4, max_wait_ms=1000)
    results = await asyncio.gather(*(b.submit(i) for i in range(4)))

    assert results == [0, 2, 4, 6]
    assert seen == [[0, 1, 2, 3]]          # exactly one flush, triggered by size


@pytest.mark.unit
async def test_flushes_on_timeout_when_batch_not_full() -> None:
    b = DynamicBatcher(lambda xs: xs, name="t", max_batch=16, max_wait_ms=20)
    t0 = time.monotonic()
    assert await b.submit(1) == 1
    assert 0.015 < time.monotonic() - t0 < 0.2     # waited, then flushed short


@pytest.mark.unit
async def test_bad_item_fails_alone() -> None:
    def batch_fn(items: list[int]) -> list[int]:
        if len(items) > 1 and 3 in items:
            raise ValueError("batch poisoned by 3")
        if items == [3]:
            raise ValueError("3 is genuinely bad")
        return [i * 2 for i in items]

    b = DynamicBatcher(batch_fn, name="t", max_batch=4, max_wait_ms=50)
    results = await asyncio.gather(
        *(b.submit(i) for i in (1, 2, 3, 4)), return_exceptions=True
    )

    assert results[0] == 2 and results[1] == 4 and results[3] == 8
    assert isinstance(results[2], ValueError)      # only the offender fails
```

### Lifecycle with a fake loader

```python
@pytest.mark.unit
async def test_sweep_unloads_after_ttl() -> None:
    loaded = {"v": False}
    model_manager.register(
        "fake",
        loader=AsyncMock(side_effect=lambda: loaded.__setitem__("v", True)),
        unloader=lambda: loaded.__setitem__("v", False),
        vram_mb=1, ttl=1,
    )

    await model_manager.ensure_loaded("fake")
    assert loaded["v"] is True

    await asyncio.sleep(1.1)
    await model_manager._sweep_once()          # call the sweep body directly
    assert loaded["v"] is False


@pytest.mark.unit
async def test_status_reflects_reload_after_unload() -> None:
    """Regression: a model reloaded outside the manager desyncs `loaded`."""
    await model_manager.ensure_loaded("fake")
    await model_manager.unload("fake")
    await model_manager.ensure_loaded("fake")

    status = {m["name"]: m for m in model_manager.status()}
    assert status["fake"]["loaded"] is True     # or the sweep never evicts it again
```

Expose the sweep body as `_sweep_once()` so tests exercise it without waiting on
a `while True` loop.

### Golden-value tests, not exact-value tests

Model outputs shift across versions. Assert invariants:

```python
@pytest.mark.gpu
def test_embeddings_are_semantically_ordered() -> None:
    v = embeddings.encode(["a cat sat on a mat", "a feline rested on a rug", "quarterly revenue"])
    assert cosine(v[0], v[1]) > cosine(v[0], v[2])       # relative, version-stable
    assert len(v[0]) == 384                              # shape is contractual
```

`assert vector[0] == 0.0234117` breaks on the next weights release and teaches
the team to delete tests.

---

## Anti-Patterns

### "It needs a GPU so we cannot test it"

Most of the code is not the model. Batching, TTL, chunking, validation and error
mapping are ordinary logic. This claim is usually a statement about the layer
split, not about the hardware — fix the split
([inference-api-pattern](inference-api-pattern.md)).

### Downloading weights in CI

A test that fetches 2 GB from HuggingFace is a network test with a model
attached. It will be flaky, slow, and eventually rate-limited. Mark it `gpu` or
`integration`, and pin a local cache for the runs that need it.

### Tests that mutate shared GPU state

Loading real models in unit tests leaks VRAM across the session and makes results
order-dependent — worse when the GPU is shared with production. Keep the default
suite hardware-free.

### Asserting on wall-clock inference time

`assert elapsed < 0.1` passes on a warm GPU and fails on a cold one, in CI, or
when another process is busy. Assert correctness; track latency with metrics.

### Stubbing `torch` instead of the model module

Produces green tests over code that cannot run. Stub at your own boundary.

---

## Related Patterns

- [inference-api-pattern](inference-api-pattern.md) — the split that makes stubbing possible
- [dynamic-batching-pattern](dynamic-batching-pattern.md) — the component with the most testable logic
- `skills/testing/tdd-workflow` — general TDD workflow
