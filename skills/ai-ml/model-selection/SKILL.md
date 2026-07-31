---
name: model-selection
description: Decision framework for choosing how to solve an NLP/ML task — rules vs small encoder vs zero-shot vs LLM — and which serving runtime fits. Use before adding any model to a service, to avoid paying LLM cost and VRAM for work a 400MB encoder does better.
origin: claude-patterns
---

# Model Selection Skill

The default failure in ML services is reaching for the largest available model.
A 14B LLM doing named-entity extraction is slower, less accurate and 30× more
expensive in VRAM than a 400 MB encoder trained for exactly that.

## When to Use

- Adding any model-backed capability to a service
- An endpoint is slow or VRAM-hungry and you suspect it is over-specified
- Deciding between fine-tuning, zero-shot, and prompting

## The Ladder

Climb only as far as the task requires. Each rung costs roughly an order of
magnitude more VRAM and latency than the one below.

| Rung | Approach | Latency | VRAM | Use when |
|------|----------|---------|------|----------|
| 0 | Rules / regex / lookup | µs | 0 | Format is defined (IPs, CVEs, hashes, dates, IBANs) |
| 1 | Classical ML (fasttext, sklearn) | <5 ms | <200 MB | Language ID, simple topic routing, spam |
| 2 | Small encoder (MiniLM, DistilBERT) | 5–30 ms | 100–500 MB | Embeddings, similarity, sentiment, fixed-label classification |
| 3 | Task encoder (mDeBERTa-MNLI, GLiNER, SpanMarker) | 30–150 ms | 0.5–2 GB | Zero-shot classification, zero-shot NER, reranking |
| 4 | Seq2seq (mBART, NLLB, T5, Whisper) | 0.1–5 s | 1–4 GB | Translation, summarization, STT |
| 5 | Local LLM (7B–24B) | 1–30 s | 6–20 GB | Open-ended reasoning, agents, tool use, generation |
| 6 | Frontier API LLM | 1–60 s | 0 (remote) | Hardest reasoning; data may leave the network |

**Rule: do not skip rungs without a measurement.** "An LLM will be more accurate"
is a hypothesis. Test it against rung 2–3 on your own data first — for extraction
and classification, the smaller model usually wins on accuracy *and* cost.

## Decision Questions, In Order

**1. Is the output format defined?**
IPs, CVE IDs, hashes, URLs, dates, currency amounts → rung 0. Regex is exact,
free and auditable. An LLM will hallucinate a plausible CVE number; a regex
cannot.

**2. Is the label set fixed and known in advance?**
Fixed → rung 2 with a fine-tuned or off-the-shelf classifier.
Changes per request → rung 3 zero-shot (mDeBERTa-MNLI, GLiNER).

**3. Is the input multilingual?**
Prefer one multilingual model over N per-language models. It saves VRAM, removes
routing logic, and usually beats a weak per-language model. Verified in practice:
GLiNER (multilingual, GPU) replaced two spaCy pipelines — one of which was
CPU-only — with better latency and one model instead of two.

**4. Does the task need generation, or only understanding?**
Understanding (classify, extract, rank, embed) → rungs 2–3, never rung 5.
Generation (summarize, translate, answer, converse) → rungs 4–5.

**5. Does it need reasoning across the whole input?**
Multi-step inference, tool use, open-ended synthesis → rung 5+. This is the only
category where an LLM is the *right* answer rather than the convenient one.

**6. Can the data leave the network?**
No → rung 6 is excluded regardless of quality. Decide this before benchmarking,
not after.

## Runtime Selection

| Runtime | Use for | Do not use for |
|---------|---------|----------------|
| In-process (FastAPI + transformers) | Encoders, rungs 1–4; mixed multi-model workloads | Generative serving at scale |
| Ollama | Local chat/completion, easy model swapping, dev | High-throughput concurrent generation |
| vLLM / TGI | Generative throughput, continuous batching, many concurrent users | A single encoder model |
| ONNX Runtime / CTranslate2 | CPU deployment, or 2–4× speedup on rung 4 | Anything needing PyTorch-only ops |

CTranslate2 for translation and faster-whisper for STT are consistently ~2× the
throughput of the plain transformers path for the same quality — worth the
conversion step on any hot rung-4 endpoint.

## Sizing Within a Rung

1. **Start at the smallest credible checkpoint.** Measure on your data.
2. **Move up only on a measured gap.** "Feels better" is not a measurement.
3. **Quantize before upgrading.** int8 on a larger model often beats fp16 on a
   smaller one at the same VRAM.
4. **Check the license** before it reaches production.
5. **Check multilingual support explicitly** — many English models degrade
   silently rather than failing on other languages.

## Anti-Patterns

| Anti-pattern | Why it fails |
|--------------|--------------|
| LLM for entity extraction | Slower, hallucinates entities, 30× the VRAM of GLiNER |
| LLM for classification into fixed labels | A zero-shot encoder is faster and calibrated |
| Fine-tuning before trying zero-shot | Weeks of work for what mDeBERTa-MNLI may already do |
| One model per language | N× VRAM, N× maintenance, worse than one multilingual model |
| Choosing by leaderboard rank | Benchmarks rarely match your domain, language, or input length |
| Prompting an LLM to emit JSON without constrained decoding | Parse failures in production; use schema-constrained decoding |
| Never re-evaluating | The field moves fast — a smaller model may now beat what you deployed |

## Related

- `skills/decision-frameworks/regex-vs-llm` — the rung 0 vs rung 5 decision in depth
- `patterns/ai-ml/llm-integration-pattern.md` — once rung 5 is chosen
- `skills/ai-ml/gpu-memory-budget` — whether the choice fits the card
- Agent `ml-inference-architect` — runtime and serving trade-offs
