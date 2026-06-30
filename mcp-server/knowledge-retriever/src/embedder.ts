// Pluggable embeddings — swap the model/backend via env, then reseed (changing the model
// changes dim/space, so a full reseed is required anyway; the indexer recreates the collection
// with the detected dim, so model swap "just works" after reseed).
//
//   KR_EMBED_PROVIDER = ct301 (default) | openai
//   KR_EMBED_URL      = endpoint
//   KR_EMBED_MODEL    = model name
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

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`embed ${res.status} ${res.statusText} @ ${url}`);
  return res.json();
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
