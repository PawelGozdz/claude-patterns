// Markdown chunker — split by H2/H3 headings into semantic units.
// Each chunk carries its governing heading (section) for context in retrieval.
import type { Chunk } from "./types.js";

const HEADING = /^(#{2,3})\s+(.*)$/;
const MIN_LEN = 40;     // skip near-empty chunks
const MAX_LEN = 2000;   // hard-split oversized sections

export function chunkMarkdown(content: string, source: string): Chunk[] {
  const lines = content.split("\n");
  const chunks: Chunk[] = [];
  let section = "(intro)";
  let buf: string[] = [];

  const flush = () => {
    const text = buf.join("\n").trim();
    buf = [];
    if (text.length < MIN_LEN) return;
    // hard-split very long sections by length to keep embeddings focused
    for (let i = 0; i < text.length; i += MAX_LEN) {
      const slice = text.slice(i, i + MAX_LEN);
      chunks.push({ id: `${source}#${chunks.length}`, source, section, text: slice });
    }
  };

  for (const line of lines) {
    const m = line.match(HEADING);
    if (m) {
      flush();
      section = m[2].trim();
    }
    buf.push(line);
  }
  flush();
  return chunks;
}
