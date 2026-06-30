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
cd mcp-server/knowledge-retriever
npm install                 # pobiera SDK + transformers.js
npm run build
npm run index -- --patterns ../../patterns --rules ../../rules   # zbuduj indeks (1. raz pobiera model embeddingów)
```
Rejestracja w projekcie (`.mcp.json`):
```bash
# indeks KODU (killer use-case) — sqlite-vec
npm run index:code -- --dir <abs>/juz-ide-api-1/src
```
Rejestracja w projekcie (`.mcp.json`):
```json
{ "mcpServers": { "knowledge-retriever": {
  "type": "stdio", "command": "node",
  "args": ["<abs>/mcp-server/knowledge-retriever/dist/index.js"],
  "env": {
    "KR_INDEX": "<abs>/.knowledge/index.json",
    "KR_CODE_INDEX": "<abs>/.knowledge/code.db"
  } } } }
```

## Narzędzia MCP
- `retrieve_patterns(task, k=5)` → top-K sekcji wzorców/reguł (FlatStore, JSON+cosine).
- `retrieve_code(query, k=8)` → top-K **istniejących symboli kodu** (metody/funkcje/typy) z file+symbol+linie
  (SqliteVecStore). **Killer use-case:** znajdź podobną istniejącą implementację zanim napiszesz nową
  (eliminuje halucynacje „to nie istnieje" + złe sygnatury — bug z ANTI-SPOOF).
- `knowledge_reindex(mode, dirs)` → przebuduj indeks (`patterns` = flat md / `code` = sqlite-vec ts/tsx).

## Architektura store'ów
| Korpus | Store | Czemu |
|---|---|---|
| patterns/rules (mały) | FlatStore (JSON + brute-force cosine) | prosto, zero infra |
| kod (6800+ plików, duży) | SqliteVecStore (sqlite-vec, KNN cosine) | indeks ANN, szybkie query |

Chunking kodu: TS compiler AST → per-symbol (`ClassName.method (L12-40)`). Embeddingi lokalne (e5), L2-normalized.

## Status / roadmap
- ✅ Faza 1: flat store, lokalne embeddingi (multilingual e5), chunking markdown, `retrieve_patterns`.
- ✅ Faza 2: **retrieval kodu** (TS AST chunking + sqlite-vec), `retrieve_code`, dwa store'y.
- ⏳ Faza 3: hybrid (BM25) + rerank, `retrieve_decisions` (ADR/threat-model/BUSINESS_RULES),
  inkrementalny indeks (hook PostToolUse), eval harness (precision/recall@K).

> ⚠️ Wymaga `npm install` + pierwsze pobranie modelu embeddingów. better-sqlite3 to natywny moduł
> (kompilacja przy install). **Nie uruchamiany end-to-end w sesji budującej** — realny starting point.
