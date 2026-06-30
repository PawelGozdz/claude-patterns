# knowledge-retriever — MCP server (code retrieval)

Semantyczny retrieval **istniejącego kodu projektu** dla agentów: „znajdź podobną implementację po
intencji" (plik+symbol+linie). TypeScript · MCP provider. Część claude-patterns overlay-on-ECC.

**Zakres = TYLKO kod.** Wzorce/decyzje serwujemy jako markdown (decision cards + README), NIE embedujemy
(mały, kuratorski zbiór — semantyka nie potrzebna). Patrz `docs/DECISIONS-LOG.md`.

## Relacja do ECC
Komplement do skilli zewnętrznej wiedzy ECC (Context7/exa/deep-research) — tu **wewnętrzny kod projektu**.
Konsumowany przez `/analyze-ddd` (Codebase Facts) i `/orchestrate-ddd` (implementer: znajdź istniejące zanim napiszesz).

## Architektura
```
embedder (pluggable) ──→ chunk kodu (TS AST, per-symbol) ──→ Qdrant (dedykowany, izolowany)
```
- **Embedder** (swappable wg env): `KR_EMBED_PROVIDER` = `ct301` (GPU e5-large 1024, domyślny) | `openai` (dowolny /v1/embeddings — vLLM/Ollama/zewn.). `KR_EMBED_URL`, `KR_EMBED_MODEL`.
- **Store:** **dedykowany** Qdrant (docker-compose, port **6401**) — izolowany od współdzielonego prod-Qdrant. Kolekcje per projekt (`code_<projekt>`).
- **Prywatność:** embed na waszej infra (LAN), nic nie wychodzi.

## Setup + reseed (lekki)
```bash
cd mcp-server/knowledge-retriever
npm install
./reseed.sh                 # docker up (Qdrant :6401) → build → reindex z reseed.config.json
```
**Swap modelu** (np. gdy CT 301 leży): ustaw env i rerun — `reseed` recreate'uje kolekcje z nowym wymiarem:
```bash
KR_EMBED_PROVIDER=openai KR_EMBED_URL=http://host:port/v1/embeddings KR_EMBED_MODEL=nomic-embed-text ./reseed.sh
```
Co indeksować: `reseed.config.json` (`collection → dirs`).

Rejestracja w projekcie (`.mcp.json`):
```json
{ "mcpServers": { "knowledge-retriever": {
  "type": "stdio", "command": "node",
  "args": ["<abs>/mcp-server/knowledge-retriever/dist/index.js"],
  "env": { "KR_QDRANT_URL": "http://localhost:6401", "KR_CODE_COLLECTION": "code_juzide1" } } } }
```

## Narzędzia MCP
- `retrieve_code(query, k=8, collection?)` → top-K istniejących symboli (plik+symbol+linie).
- `knowledge_reindex(dirs, collection)` → przebuduj kolekcję (recreate + re-embed + upsert).

## Manifest
`mirror/collections.json` (git-committed, tiny) — zapisuje `model+dim` per kolekcja → wykrywanie driftu modelu.

## Status / roadmap
- ✅ Code retrieval (TS AST + dedykowany Qdrant + swappable embedder) — zwalidowane e2e na `mentions`.
- ⏳ Faza 3: hybrid (BM25) + rerank (CT 301 reranker), retrieve_decisions, inkrementalny reindex (hook), eval.
