// Local embeddings via Transformers.js (ONNX in-process) — code/PII never leaves the machine (GDPR).
// Default model: multilingual-e5-small (handles Polish docs + code identifiers).
// e5 convention: prefix passages with "passage: " and queries with "query: ".
import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

export interface Embedder {
  embedPassages(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

const MODEL = process.env.KR_EMBED_MODEL ?? "Xenova/multilingual-e5-small";

export class TransformersEmbedder implements Embedder {
  private extractor: FeatureExtractionPipeline | null = null;

  private async pipe(): Promise<FeatureExtractionPipeline> {
    if (!this.extractor) {
      this.extractor = await pipeline("feature-extraction", MODEL);
    }
    return this.extractor;
  }

  private async embed(inputs: string[]): Promise<number[][]> {
    const extractor = await this.pipe();
    const out = await extractor(inputs, { pooling: "mean", normalize: true });
    // out.tolist() → number[][] (one normalized vector per input)
    return out.tolist() as number[][];
  }

  async embedPassages(texts: string[]): Promise<number[][]> {
    return this.embed(texts.map((t) => `passage: ${t}`));
  }

  async embedQuery(text: string): Promise<number[]> {
    const [v] = await this.embed([`query: ${text}`]);
    return v;
  }
}
