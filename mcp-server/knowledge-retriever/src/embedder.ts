// Embeddings via the shared inference server (CT 301, GPU e5-large 1024-dim).
// No local model download — code/PII stays on the LAN (GDPR). e5 prefix convention:
// "passage: " for indexed text, "query: " for search (server prepends it).
const URL = process.env.KR_EMBED_URL ?? "http://192.168.0.150:8301/v1/embeddings/generate";
const MODEL = process.env.KR_EMBED_MODEL ?? "multilingual-e5-large";

export interface Embedder {
  embedPassages(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

export class HttpEmbedder implements Embedder {
  private async call(texts: string[], prefix: string): Promise<number[][]> {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, model: MODEL, prefix }),
    });
    if (!res.ok) throw new Error(`embed endpoint ${res.status} ${res.statusText}`);
    const json = (await res.json()) as { embeddings: number[][] };
    return json.embeddings;
  }

  embedPassages(texts: string[]): Promise<number[][]> {
    return this.call(texts, "passage: ");
  }

  async embedQuery(text: string): Promise<number[]> {
    const [v] = await this.call([text], "query: ");
    return v;
  }
}
