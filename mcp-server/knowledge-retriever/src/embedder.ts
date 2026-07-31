// Pluggable embeddings — swap the model/backend via env, then reseed (changing the model
// changes dim/space, so a full reseed is required anyway; the indexer recreates the collection
// with the detected dim, so model swap "just works" after reseed).
//
//   KR_EMBED_PROVIDER   = ct301 (default) | openai
//   KR_EMBED_URL        = endpoint
//   KR_EMBED_MODEL      = model name
//   KR_EMBED_TIMEOUT_MS = per-request timeout (default 60000 — covers a cold
//                         model load on a shared GPU)
//   KR_EMBED_RETRIES    = retries on timeout / network error / 5xx (default 2)
//
// - ct301:  shared GPU server (e5-large 1024). Body {texts, model, prefix} → {embeddings:[[...]]}.
//           Server prepends the e5 prefix.
// - openai: any OpenAI-compatible /v1/embeddings (vLLM / Ollama-openai / external) if CT 301 is down.
//           Body {model, input:[...]} → {data:[{embedding}]}. No server prefix → we prepend it to the text.
const PROVIDER = (process.env.KR_EMBED_PROVIDER ?? "ct301").toLowerCase();
const URL = process.env.KR_EMBED_URL ?? "http://192.168.0.150:8301/v1/embeddings/generate";
const MODEL = process.env.KR_EMBED_MODEL ?? "multilingual-e5-large";

export interface Embedder {
  embedPassages(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
  describe(): string; // "provider:model" — recorded with the collection so we detect model drift
}

// A bare fetch() has no timeout: if the embedding server hangs, a reseed hangs
// with it, forever. And the first request after an idle period pays a cold model
// load (e5-large is ~15-20s on CT 301, more if the GPU is contended), so the
// timeout has to be generous and the first failure has to be retried rather than
// aborting a run that is halfway through a corpus.
const TIMEOUT_MS = Number(process.env.KR_EMBED_TIMEOUT_MS ?? 60_000);
const RETRIES = Number(process.env.KR_EMBED_RETRIES ?? 2); // total attempts = RETRIES + 1

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postJson(url: string, body: unknown): Promise<any> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      // 4xx is our bug (bad model name, oversized batch) — retrying cannot help.
      if (!res.ok) {
        const err = new Error(`embed ${res.status} ${res.statusText} @ ${url}`);
        if (res.status < 500) throw err;
        lastErr = err;
      } else {
        return await res.json();
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("embed 4")) throw e;
      lastErr = e;
    }

    if (attempt < RETRIES) {
      const backoff = 1000 * 2 ** attempt;
      console.error(`[embedder] attempt ${attempt + 1}/${RETRIES + 1} failed (${lastErr}) — retrying in ${backoff}ms`);
      await sleep(backoff);
    }
  }

  throw new Error(`embed failed after ${RETRIES + 1} attempts @ ${url}: ${lastErr}`);
}

export class HttpEmbedder implements Embedder {
  describe(): string {
    return `${PROVIDER}:${MODEL}`;
  }

  private async call(texts: string[], prefix: string): Promise<number[][]> {
    if (PROVIDER === "openai") {
      // OpenAI-compatible: no server prefix → prepend e5 prefix to each text ourselves.
      const json = await postJson(URL, { model: MODEL, input: texts.map((t) => `${prefix}${t}`) });
      return (json.data as { embedding: number[] }[]).map((d) => d.embedding);
    }
    // ct301 custom format (server prepends prefix)
    const json = await postJson(URL, { texts, model: MODEL, prefix });
    return json.embeddings as number[][];
  }

  embedPassages(texts: string[]): Promise<number[][]> {
    return this.call(texts, "passage: ");
  }

  async embedQuery(text: string): Promise<number[]> {
    const [v] = await this.call([text], "query: ");
    return v;
  }
}
