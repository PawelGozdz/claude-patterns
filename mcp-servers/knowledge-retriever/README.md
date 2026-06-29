# knowledge-retriever — MCP server (Advanced RAG)

Semantyczny retrieval **wewnętrznej** wiedzy (patterns, rules, kod projektu) dla agentów.
TypeScript · MCP provider · local-first (lokalne embeddingi, GDPR-safe). Status: **MVP scaffold**.

## Relacja do ECC (jawna — nie do zgadywania)

Ten serwer jest częścią modelu **claude-patterns = overlay na ECC** (patrz
`../../docs/REFACTOR-ANALYSIS.md`, `../../docs/ECC-USAGE.md`). Świadomie **komplementarny**, nie duplikat:

| Wiedza | Narzędzie | Źródło |
|---|---|---|
| **Zewnętrzna** (biblioteki, web, docs) | ECC: `documentation-lookup` (Context7), `exa-search`, `deep-research` | plugin ECC |
| **Wewnętrzna** (nasze patterns + kod projektu) | **knowledge-retriever** (ten serwer) | claude-patterns overlay |

- **Brak twardej zależności** od pluginu ECC — działa standalone.
- **Konsumowany** przez komendy overlay: `/analyze-ddd` (Codebase Facts + grounding) i `/orchestrate-ddd` (implementer).
- Zastępuje statyczne wstrzykiwanie wzorców semantycznym retrievalem (mniej kontekstu = niższy koszt; lepszy recall).

## Setup
```bash
cd mcp-servers/knowledge-retriever
npm install                 # pobiera SDK + transformers.js
npm run build
npm run index -- --patterns ../../patterns --rules ../../rules   # zbuduj indeks (1. raz pobiera model embeddingów)
```
Rejestracja w projekcie (`.mcp.json`):
```json
{ "mcpServers": { "knowledge-retriever": {
  "type": "stdio", "command": "node",
  "args": ["<abs>/mcp-servers/knowledge-retriever/dist/index.js"],
  "env": { "KR_INDEX": "<abs>/.knowledge/index.json" } } } }
```

## Narzędzia MCP
- `retrieve_patterns(task, k=5)` → top-K Rule Cards/sekcji wzorców wg podobieństwa do zadania.
- `knowledge_reindex(scope?)` → przebuduj indeks.
- (TODO) `retrieve_code`, `retrieve_decisions` — Faza 2 (killer use-case: kod).

## Status / roadmap
- ✅ MVP: flat store (JSON + cosine), lokalne embeddingi (multilingual e5), chunking markdown, retrieve_patterns.
- ⏳ Faza 2: retrieval kodu (AST + sqlite-vec), hybrid (BM25) + rerank, inkrementalny indeks (hook), eval harness.

> Po scaffoldzie nie uruchamiany end-to-end — wymaga `npm install` + pierwsze pobranie modelu.
