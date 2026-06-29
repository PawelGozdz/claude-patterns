# TASK-RAG-001 — knowledge-retriever MCP server (Advanced RAG, MVP)

**Branch:** feat/rag-knowledge-retriever · **Design:** `docs/rag-design.md` · **Decyzja:** `docs/DECISIONS-LOG.md` (2026-06-29)

## Cel
MCP server (TypeScript) wystawiający semantyczny retrieval wzorców i kodu — zastępuje statyczne
wstrzykiwanie wzorców w `/analyze-ddd` i `/orchestrate-ddd`. Local-first (sqlite-vec/flat, lokalne
embeddingi, GDPR-safe). Killer use-case = retrieval KODU.

## Relacja do ECC (jawna — nie do zgadywania)
Część modelu **claude-patterns overlay na ECC**. Komplementarny do skilli ECC:
- ECC `documentation-lookup` (Context7), `exa-search`, `deep-research` → wiedza **zewnętrzna** (biblioteki, web).
- nasz `knowledge-retriever` → wiedza **wewnętrzna** (nasze patterns + kod projektu).
Nie ma twardej zależności od pluginu ECC — działa standalone; konsumowany przez nasze komendy overlay.

## Zakres MVP (Faza 1-2 z rag-design)
- [ ] Scaffold MCP server (package.json, tsconfig, src) — TS, ESM
- [ ] Embedder (lokalny, multilingual e5 przez @xenova/transformers) z interfejsem pluggable
- [ ] Chunker markdown (per sekcja H2/H3)
- [ ] Flat store (JSON + cosine) — MVP; sqlite-vec = Faza 2
- [ ] Indexer (walk patterns/ + rules/ → chunk → embed → store)
- [ ] Narzędzia MCP: `retrieve_patterns`, `knowledge_reindex`
- [ ] README z setupem + jawną relacją ECC

## Poza MVP (TODO kolejne fazy)
- Retrieval kodu (AST chunking, duży korpus → sqlite-vec) — killer use-case
- Hybrid (BM25) + rerank
- Inkrementalny indeks (hook PostToolUse)
- Eval harness (precision/recall@K)

## Uwaga
Wymaga `npm install` + pierwsze pobranie modelu embeddingów. Po scaffoldzie NIE przetestowany
end-to-end w sesji budującej — to realny starting point do uruchomienia/dostrojenia.
