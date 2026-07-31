---
name: ml-inference-patterns
description: GPU inference service patterns — model lifecycle with TTL/VRAM budgeting, dynamic request batching, async/GPU concurrency rules, LLM integration, observability, GPU-free testing. For Python services serving local models.
origin: claude-patterns
paths:
  - "**/models/**/*.py"
  - "**/routers/**/*.py"
  - "**/model_manager.py"
  - "**/server.py"
  - "**/inference/**/*.py"
---

# ML Inference Patterns Skill

Production-tested patterns for Python services serving local ML models
(PyTorch, transformers, sentence-transformers, GLiNER, Whisper, Ollama).

## Activation

Auto-activates when editing model modules, routers, or lifecycle code.
Reference for:
- Model lifecycle — lazy load, TTL tiers, VRAM preflight, LRU eviction
- Dynamic batching — coalescing concurrent requests into GPU batches
- GPU concurrency — `to_thread`, thread pools, semaphores, thread-unsafe libraries
- Inference API structure — `routers/` vs `models/` split
- LLM integration — streaming, OpenAI compatibility, greedy decoding
- Observability — cold vs warm latency, VRAM, batch efficiency
- Testing — what can be tested without a GPU (most of it)

## Core Patterns

| Pattern | When to Use |
|---------|-------------|
| Model lifecycle | More than one model, or a GPU shared with other processes |
| Dynamic batching | Concurrent requests to the same model, latency budget ≥ 20 ms |
| GPU concurrency | Any `import torch` inside an async service |
| Inference API structure | More than two model-backed endpoints |
| LLM integration | Proxying or wrapping Ollama / vLLM / llama.cpp |
| ML observability | Any lazily-loaded or TTL-evicted model |
| GPU-free testing | Always |

## Quick Rules

1. **The lifecycle manager is the only loader** — a getter that lazy-loads behind
   its back desyncs state and leaks VRAM until restart
2. **Every inference call goes through `asyncio.to_thread`** — an unwrapped call
   in `async def` freezes the whole server
3. **`gc.collect()` before `torch.cuda.empty_cache()`** — reversed, unload is a no-op
4. **Preflight VRAM, then evict LRU** — never let CUDA OOM decide
5. **Tier the TTL** by `reload_cost / usage_frequency`, never one global value
6. **Batch instead of parallelize** — the GPU serializes; `gather` only multiplies VRAM
7. **Small thread pool (~4)** — threads free the event loop, they don't parallelize a GPU
8. **One worker process** — `--workers N` means N full copies of the weights
9. **Serialize thread-unsafe libraries** (spaCy GPU, faster-whisper) with a semaphore
10. **Batch functions preserve order and length** — verify, or callers get each other's results
11. **Bound every input** — list `max_length`, text caps, upload size checked before read
12. **Separate cold from warm latency** — the average describes neither
13. **`routers/` never imports torch; `models/` never imports fastapi**
14. **Composite endpoints degrade per task** — one failed model must not fail the request
15. **Greedy decoding (`temperature=0`, `top_k=1`) for tool calls and structured output**

## Reference

Full patterns with production code:
`.claude/knowledge/patterns/ai-ml/`

| File | Covers |
|------|--------|
| `model-lifecycle-pattern.md` | Registry, TTL tiers, VRAM preflight, LRU eviction, unload |
| `dynamic-batching-pattern.md` | Coalescer, flush policy, partial failure isolation, tuning |
| `gpu-concurrency-pattern.md` | `to_thread`, pool sizing, semaphores, init order |
| `inference-api-pattern.md` | Module contract, routers, composite endpoints, health |
| `llm-integration-pattern.md` | Streaming, OpenAI compat, greedy decoding, timeouts |
| `ml-observability-pattern.md` | Cold/warm split, histograms, GPU gauges, alerts |
| `ml-testing-pattern.md` | Markers, stubbing, batcher tests, lifecycle tests |

## Diagnostic Shortcuts

| Symptom | First thing to check |
|---------|---------------------|
| Server freezes under load | Unwrapped inference call in `async def` (rule 2) |
| VRAM climbs, never returns | Model loaded outside the manager (rule 1), or missing `gc.collect()` (rule 3) |
| p99 spikes periodically | Eviction thrashing — TTL too low for the working set |
| Batching added latency, no throughput | avg batch size ≈ 1 — check flush reason and batcher key granularity |
| Wrong results only under load | Batch reordering (rule 10), or a thread-unsafe library (rule 9) |
| Health says model unloaded, `nvidia-smi` disagrees | Registry desync (rule 1) |
| OOM after adding a second worker | `--workers N` duplicates weights (rule 8) |
