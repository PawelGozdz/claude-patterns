# Pattern: ML Service Observability

**Layer**: AI/ML
**Status**: production

## What This Is

The metrics an inference service needs that a normal web service does not: cold
versus warm latency, VRAM over time, model residency, batch efficiency, and
per-stage timings inside composite endpoints.

Average request latency is close to meaningless here. The same endpoint answers
in 40 ms warm and 25 s cold; the mean describes neither, and an alert on it fires
at random.

## When to Use

Any service running local models — especially with lazy loading, TTL eviction or
a shared GPU, where the interesting failures are resource failures.

---

## Implementation

### Separate cold from warm

The single highest-value split. Emit them as different metrics, not one histogram.

```python
@contextmanager
def track_inference(endpoint: str, model: str):
    was_loaded = model_manager.is_loaded(model)
    t0 = time.monotonic()
    try:
        yield
    finally:
        elapsed = time.monotonic() - t0
        label = "warm" if was_loaded else "cold"
        _latency[(endpoint, label)].observe(elapsed)
```

Now "p99 is 25 seconds" resolves into "p99 warm is 180 ms, and 3% of requests are
cold" — which points at TTL tuning rather than at the model.

### Histograms, not averages

```python
# Buckets chosen for GPU inference: sub-100ms warm calls through 60s cold loads
BUCKETS = (0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60)

inference_latency = Histogram(
    "inference_latency_seconds",
    "Inference latency by endpoint and warm/cold state",
    labelnames=("endpoint", "state"),
    buckets=BUCKETS,
)
```

Use the standard bucket layout so `histogram_quantile()` works. Hand-rolled
`avg`/`max` pairs cannot answer p95 and cannot be aggregated across instances.

### Emit valid Prometheus text

`# HELP` and `# TYPE` are not decoration — without `# TYPE`, `rate()` over a
counter is undefined behaviour and Grafana's metric browser shows nothing.

```
# HELP inference_requests_total Total inference requests
# TYPE inference_requests_total counter
inference_requests_total{endpoint="/v1/embeddings/generate"} 14203
```

Prefer `prometheus-client` over string concatenation: it handles label escaping,
histogram bucket accumulation and exposition format correctly.

### GPU and residency as gauges

```python
gpu_memory_used = Gauge("gpu_memory_used_bytes", "VRAM in use")
gpu_memory_total = Gauge("gpu_memory_total_bytes", "VRAM installed")
model_loaded = Gauge("model_loaded", "1 if resident", ["model"])
model_idle_seconds = Gauge("model_idle_seconds", "Time since last use", ["model"])
model_load_duration = Histogram("model_load_duration_seconds", "Cold load cost", ["model"])
model_evictions = Counter("model_evictions_total", "TTL/LRU evictions", ["model", "reason"])
```

`model_evictions_total{reason="vram_pressure"}` climbing is the earliest signal
that the GPU is oversubscribed — it appears well before the first OOM.

### Batch efficiency

For a [dynamic batcher](dynamic-batching-pattern.md), three counters tell you
whether batching is earning its latency cost:

```python
batcher_items_total{name}          # items processed
batcher_flushes_total{name}        # flushes → avg batch = items / flushes
batcher_flush_reason_total{name, reason="size|timeout"}
batcher_queue_depth{name}          # gauge — backpressure
```

**Average batch size near 1 with nearly all flushes on timeout means batching is
pure added latency.** Either concurrency is too low, or the batcher key is too
granular. Both are actionable; neither is visible without these counters.

### Per-stage timings in composite endpoints

A single structured log line beats five metrics for debugging a multi-stage
endpoint:

```python
logger.info(
    "process_document %dms text=%d lang=%s | %s%s",
    elapsed_ms, len(req.text), req.language or "?",
    " ".join(f"{k}={v}" for k, v in timings.items()),   # lang=12 ner=340 cls=88 emb=41
    f" ERR={list(errors)}" if errors else "",
)
```

### Do not measure yourself

```python
EXCLUDED = ("/v1/metrics", "/v1/metrics/json", "/v1/health", "/health")

class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.url.path in EXCLUDED:
            return await call_next(request)
        ...
```

A Prometheus scrape every 15 s plus a health probe every 10 s adds ~14 000
phantom requests a day. On a service handling a few thousand real requests, the
dashboard becomes mostly noise.

Read request size from `Content-Length` rather than `await request.body()` —
buffering the body in middleware doubles peak memory for every upload and gains
nothing.

---

## What to Alert On

| Alert | Condition | Why |
|-------|-----------|-----|
| VRAM exhausted | `gpu_memory_used / total > 0.95` for 5 min | OOM is imminent, and recovery needs a restart |
| Eviction thrashing | `rate(model_evictions_total{reason="vram_pressure"}[15m]) > 0.2` | Models fight for VRAM; every request pays a cold load |
| Cold-load spike | `rate(model_load_duration_seconds_count[15m])` above baseline | TTL too aggressive, or traffic pattern changed |
| Batch degenerate | `avg_batch_size < 1.5` sustained | Batching adds latency without benefit |
| Queue backpressure | `batcher_queue_depth > 50` | Clients are already timing out |
| Error ratio | `rate(errors_total[5m]) / rate(requests_total[5m]) > 0.05` | Standard, still needed |

Do **not** alert on raw average latency. It merges cold and warm and will page
you for a normal cache miss.

---

## Anti-Patterns

### Metrics only in memory

In-process `defaultdict` counters vanish on restart, and restarts are exactly
when you want the history. Expose an endpoint and let Prometheus own retention.

### Unbounded label cardinality

```python
requests_total.labels(endpoint=path, text_hash=sha).inc()   # unbounded series
```

Model name, endpoint and status are fine. User IDs, text hashes and full prompts
will kill the time-series database.

### Logging prompts and completions at INFO

Log lengths, token counts and latency. Content belongs behind a debug flag —
it is user data, sometimes with credentials in it.

### Health that only says "ok"

For a GPU service, health must report device, resident models, idle time and free
VRAM. Otherwise the first question in every incident needs an SSH session.

---

## Related Patterns

- [model-lifecycle-pattern](model-lifecycle-pattern.md) — the load/evict events being measured
- [dynamic-batching-pattern](dynamic-batching-pattern.md) — where batch counters come from
- [inference-api-pattern](inference-api-pattern.md) — health endpoint shape
