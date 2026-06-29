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
### Faza 1 — patterns (DONE)
- [x] Scaffold MCP server (package.json, tsconfig, src) — TS, ESM
- [x] Embedder (lokalny, multilingual e5 przez @xenova/transformers), interfejs pluggable
- [x] Chunker markdown (per sekcja H2/H3)
- [x] Flat store (JSON + cosine)
- [x] Indexer (patterns/rules → chunk → embed → store)
- [x] Narzędzia MCP: `retrieve_patterns`, `knowledge_reindex`
- [x] README z jawną relacją ECC

### Faza 2 — kod + sqlite-vec (DONE) — killer use-case
- [x] Chunker kodu (TS compiler AST → per-symbol method/function/type, z liniami)
- [x] SqliteVecStore (better-sqlite3 + sqlite-vec, KNN cosine)
- [x] Indexer tryb `code` (*.ts/*.tsx → chunkCode → sqlite-vec)
- [x] `retrieve_code` (file+symbol+linie) + `knowledge_reindex mode=code`

## Faza 3 (TODO)
- [ ] Hybrid (BM25 dla dokładnych identyfikatorów) + rerank
- [ ] `retrieve_decisions` (ADR/threat-model/BUSINESS_RULES)
- [ ] Inkrementalny indeks (hook PostToolUse na Write/Edit)
- [ ] Eval harness (precision/recall@K, A/B vs statyczne wstrzykiwanie)

## Uwaga
Wymaga `npm install` + pierwsze pobranie modelu embeddingów. Po scaffoldzie NIE przetestowany
end-to-end w sesji budującej — to realny starting point do uruchomienia/dostrojenia.
