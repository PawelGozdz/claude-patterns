---
name: gpu-memory-budget
description: Procedure for measuring real VRAM footprint per model, building a working-set budget for a shared GPU, and choosing TTL tiers and eviction policy from the numbers. Use before adding a model or when diagnosing OOM and eviction thrashing.
origin: claude-patterns
---

# GPU Memory Budget Skill

VRAM is the hard constraint in every multi-model service. This is the procedure
for replacing guesses with measurements.

## When to Use

- Adding a model to a service that already hosts others
- The GPU is shared with processes you do not control (Ollama, ComfyUI, training)
- Diagnosing CUDA OOM, eviction thrashing, or periodic p99 latency spikes
- Choosing TTL tiers, or deciding whether the working set fits at all

## Why Model Cards Lie

A published parameter count describes weights at rest. Actual peak usage is
routinely **1.5–3×** that:

| Component | Typical cost |
|-----------|-------------|
| Weights | params × bytes/param (fp16 = 2, fp32 = 4, int8 = 1) |
| Activations | Scales with batch size × sequence length — often dominant |
| CUDA context | ~300–600 MB per process, once |
| Allocator fragmentation | 5–15% after churn |
| Framework workspace | cuDNN/cuBLAS scratch, varies by kernel |

Always measure. Never budget from the model card.

## Procedure

### 1. Measure one model in isolation

```python
import torch

torch.cuda.empty_cache()
torch.cuda.reset_peak_memory_stats()
base = torch.cuda.memory_allocated()

model = load_model()                       # the real loader
after_load = torch.cuda.memory_allocated()

_ = run_inference(model, realistic_max_batch_input)   # worst realistic case
peak = torch.cuda.max_memory_allocated()

print(f"weights   {(after_load - base) / 2**20:.0f} MB")
print(f"peak      {(peak - base) / 2**20:.0f} MB")   # ← budget with THIS number
```

Use a realistic worst case: the longest input and largest batch the endpoint
actually accepts. Measuring with one short string under-reports by an order of
magnitude.

### 2. Record the working set

The working set is what must be resident **simultaneously**, not the sum of
everything registered.

| Model | Peak MB | Load time | Req/day | Reload cost × freq | Tier |
|-------|---------|-----------|---------|--------------------|------|
| embeddings | 480 | 3 s | 40 000 | high | CORE (30 min) |
| classifier | 1 100 | 8 s | 6 000 | high | CORE |
| gliner | 900 | 6 s | 8 000 | high | CORE |
| summarizer | 1 800 | 12 s | 300 | medium | STANDARD (10 min) |
| whisper | 3 200 | 20 s | 40 | low | HEAVY (5 min) |

### 3. Budget the card

```
Total VRAM                    32 768 MB
- Other processes (measured)  12 000 MB    ← Ollama with a 24B model loaded
- CUDA context                   500 MB
- Safety margin (≥1 GB)        1 024 MB
─────────────────────────────────────────
Available to this service     19 244 MB
Working set (CORE tier)        2 480 MB    ← must always fit
Headroom for on-demand tiers  16 764 MB
```

**Rule: the CORE tier must fit permanently with room for the largest HEAVY model
on top.** If it does not, the service will thrash — every request pays a cold
load, and p99 becomes unusable.

### 4. Derive TTL tiers

```
TTL ∝ reload_cost × usage_frequency
```

| Tier | TTL | Profile |
|------|-----|---------|
| CORE | 30 min | Small, hot. Reloading costs more than the VRAM it holds |
| STANDARD | 10 min | Moderate on both axes |
| HEAVY | 5 min | Multi-GB, rare. VRAM is worth more than the reload |

A single global TTL is wrong for both extremes simultaneously.

### 5. When it does not fit

In order of preference:

1. **Quantize** — int8/4-bit often costs 1–3% accuracy for 2–4× VRAM reduction
2. **Smaller checkpoint** — measure quality on your data before assuming a loss
3. **Consolidate** — one multilingual model instead of one per language;
   one zero-shot NER instead of several fine-tuned NERs
4. **Tighter eviction** — LRU with preflight; accept cold starts on cold paths
5. **Move a workload out** — Ollama or vLLM in a separate process with its own budget
6. **Second GPU** — pin by workload, not round-robin

## Verification

```bash
# Real usage, all processes
nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader

# Per-process attribution — which one is actually holding it
nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv

# What the service believes is resident
curl -s localhost:8301/v1/health | jq '.models[] | select(.loaded)'
```

**A model reported `loaded: false` while VRAM is occupied means a lifecycle bug** —
something loaded outside the manager. See `ai-ml/ml-inference-patterns` rule 1.

## Warning Signs

| Signal | Meaning |
|--------|---------|
| `model_evictions_total{reason="vram_pressure"}` rising | Oversubscribed — this precedes the first OOM |
| Cold-load rate climbing at steady traffic | TTL below the real inter-arrival time |
| Free VRAM never returns after unload | Missing `gc.collect()` before `empty_cache()` |
| OOM at a batch size that worked yesterday | Another process grew — re-measure the shared budget |
| Sawtooth VRAM graph | Eviction thrashing; the working set does not fit |

## Related

- `patterns/ai-ml/model-lifecycle-pattern.md` — preflight and eviction implementation
- `patterns/ai-ml/ml-observability-pattern.md` — the gauges and alerts above
- Agent `ml-inference-architect` — advisory on the resulting trade-offs
