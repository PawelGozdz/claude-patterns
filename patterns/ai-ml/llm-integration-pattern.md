# Pattern: LLM Integration (Ollama, OpenAI-compatible)

**Layer**: AI/ML
**Status**: production

## What This Is

Patterns for calling local LLM runtimes (Ollama, llama.cpp, vLLM) from a service:
streaming, an OpenAI-compatible surface, deterministic decoding for tool-calling
agents, and honest failure handling.

The central decision: **speak the OpenAI protocol**. It costs one adapter module
and buys compatibility with every agent framework, IDE integration and client
library in existence. A bespoke request format costs an adapter in every consumer,
forever.

## When to Use

- Proxying or wrapping a local LLM runtime
- Serving an agent loop, IDE, or chat UI you do not control
- You need one place for metrics, caching, routing and rate limits across LLM calls

---

## Implementation

### Streaming is not optional

A 14B model generating 500 tokens takes 20–40 seconds. Without streaming the
client sees nothing, and intermediate proxies time out.

```python
@router.post("/api/generate")
async def generate(req: GenerateRequest) -> Response:
    payload = {"model": req.model, "prompt": req.prompt, "stream": req.stream}

    if not req.stream:
        r = await http.post(f"{OLLAMA_URL}/api/generate", json=payload)
        return JSONResponse(r.json(), status_code=r.status_code)

    async def relay() -> AsyncIterator[bytes]:
        async with http.stream("POST", f"{OLLAMA_URL}/api/generate", json=payload) as r:
            async for chunk in r.aiter_bytes():
                yield chunk

    return StreamingResponse(relay(), media_type="application/x-ndjson")
```

If the request model declares `stream: bool`, it must be honoured. A field that
is accepted and ignored is worse than no field — the client believes it is
streaming and builds a timeout budget on that belief.

### OpenAI-compatible surface

```python
@router.post("/v1/chat/completions")
async def chat_completions(req: ChatCompletionRequest) -> Response:
    payload = {
        "model": req.model,
        "messages": [m.model_dump() for m in req.messages],
        "stream": req.stream,
        "options": _map_options(req),       # temperature, top_p, max_tokens→num_predict, stop, seed
    }

    if req.stream:
        return StreamingResponse(_sse_relay(payload), media_type="text/event-stream")

    r = await http.post(f"{OLLAMA_URL}/api/chat", json=payload)
    data = r.json()
    return JSONResponse({
        "id": f"chatcmpl-{uuid4().hex[:24]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": req.model,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": data["message"]["content"]},
            "finish_reason": "stop" if data.get("done") else "length",
        }],
        "usage": {
            "prompt_tokens": data.get("prompt_eval_count", 0),
            "completion_tokens": data.get("eval_count", 0),
            "total_tokens": data.get("prompt_eval_count", 0) + data.get("eval_count", 0),
        },
    })
```

SSE framing has two requirements clients depend on: each event is
`data: {json}\n\n`, and the stream terminates with a literal `data: [DONE]\n\n`.
Omit the sentinel and well-behaved clients hang waiting for it.

```python
async def _sse_relay(payload: dict) -> AsyncIterator[str]:
    async with http.stream("POST", f"{OLLAMA_URL}/api/chat", json=payload) as r:
        async for line in r.aiter_lines():
            if not line:
                continue
            data = json.loads(line)
            chunk = {
                "id": chunk_id, "object": "chat.completion.chunk",
                "created": created, "model": payload["model"],
                "choices": [{
                    "index": 0,
                    "delta": {"content": data.get("message", {}).get("content", "")},
                    "finish_reason": "stop" if data.get("done") else None,
                }],
            }
            yield f"data: {json.dumps(chunk)}\n\n"
    yield "data: [DONE]\n\n"
```

### Greedy decoding for tool-calling agents

Hard-won and non-obvious: **agent loops need `temperature=0`, not the default
sampling.** At default temperature a model that tool-calls perfectly on turn 1
starts leaking control tokens into content and emitting prose instead of calls by
turn 3 — an agent loop misreads that as task completion and stops.

```dockerfile
# Modelfile — pentest/agent orchestrator
FROM devstral:24b
PARAMETER num_ctx 32768        # a full ReAct run must fit, or early turns are evicted
PARAMETER temperature 0        # greedy decoding
PARAMETER top_p 1
PARAMETER top_k 1              # temperature 0 alone is not always enough
```

Set all three. Some runtimes still sample when only `temperature` is zeroed.
Bake it into a Modelfile rather than passing per request — then every client gets
the correct behaviour, including ones you do not control.

Rule of thumb: **sampling for prose, greedy for structure.** Anything parsed by a
machine — tool calls, JSON, classification labels — wants greedy decoding.

### Structured output via schema-constrained decoding

Do not ask for JSON in the prompt and hope. Constrain it.

```python
payload = {
    "model": model,
    "prompt": prompt,
    "format": schema,        # Ollama: JSON Schema → constrained decoding
    "stream": False,
    "options": {"temperature": 0},
}
```

Validate anyway — constrained decoding guarantees shape, not semantics.

### One shared client, explicit timeouts

```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    app.state.http = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=5.0, read=LLM_READ_TIMEOUT, write=10.0, pool=5.0),
        limits=httpx.Limits(max_connections=32, max_keepalive_connections=8),
    )
    yield
    await app.state.http.aclose()
```

A new `AsyncClient` per request throws away the connection pool and pays a TCP
handshake every call. And a single scalar `timeout=120` is the wrong shape: a
streaming generation needs a long *read* timeout but should still fail fast on
*connect*.

### Propagate upstream failures

```python
r = await http.post(url, json=payload)
if r.status_code >= 400:
    raise HTTPException(502, f"LLM upstream {r.status_code}: {r.text[:200]}")
return r.json()
```

Calling `.json()` on an upstream 500 and returning it under HTTP 200 hides the
failure from every client-side retry and alert.

---

## Anti-Patterns

### Declaring a parameter you ignore

`stream`, `seed`, `temperature` accepted by the schema and dropped before the
upstream call. Either map it or remove it.

### Retrying non-idempotent generation blindly

An automatic retry on timeout can produce two completions, both billed and both
partially streamed. Retry on connect errors and 5xx before any tokens have been
emitted; never mid-stream.

### Prompt concatenation across untrusted input

```python
prompt = f"{system}\n\nUser: {user_input}"     # injection surface
```

Use the message array so the runtime applies the model's chat template. Treat
retrieved documents and tool output as untrusted content, not as instructions.

### Context window ignored

Silently truncating at the runtime boundary drops the system prompt or the
earliest turns — an agent forgets its instructions mid-run with no error. Count
tokens, and fail loudly or summarize deliberately.

### Logging full prompts and completions at INFO

Prompts carry user data and sometimes credentials. Log lengths, token counts and
latency; put content behind a debug flag.

---

## Related Patterns

- [inference-api-pattern](inference-api-pattern.md) — where the adapter lives
- [ml-observability-pattern](ml-observability-pattern.md) — token and latency metrics
- `skills/decision-frameworks/regex-vs-llm` — whether to call an LLM at all
