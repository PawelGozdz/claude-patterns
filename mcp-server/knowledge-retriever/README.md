# knowledge-retriever — MCP server (code + patterns + library examples retrieval)

Semantyczny retrieval dla agentów, trzy toole: **kod projektu** (`retrieve_code`, per-projekt),
**wzorce/reguły claude-patterns** (`retrieve_patterns`, globalne), **przykłady biblioteki
@vytches/ddd** (`retrieve_examples`, globalne, poziom simple/medium/complex). TypeScript · MCP
provider. Część claude-patterns overlay-on-ECC. Historia decyzji: `docs/DECISIONS-LOG.md`,
`docs/rag-design.md`, `docs/tasks/TASK-RAG-002.md`.

## Relacja do ECC
Komplement do skilli zewnętrznej wiedzy ECC (Context7/exa/deep-research) — tu **wewnętrzna wiedza**
(kod projektu + wzorce/reguły claude-patterns + biblioteka @vytches/ddd).
Konsumowany przez `/analyze-ddd` (Codebase Facts + grounding) i `/orchestrate-ddd`
(implementer: `retrieve_code` przed pisaniem — patrz `agents/stacks/nestjs-ddd/implementers/`).

## Architektura
```
embedder (pluggable) ──→ chunk (kod: TS AST per-symbol | Dart: heurystyczny skaner per-symbol | md: H2/H3 per-sekcja) ──→ Qdrant (dedykowany)
```
- **Embedder** (swappable wg env): `KR_EMBED_PROVIDER` = `ct301` (GPU e5-large 1024, domyślny) | `openai` (dowolny /v1/embeddings — vLLM/Ollama/zewn.). `KR_EMBED_URL`, `KR_EMBED_MODEL`.
  Odporność: `KR_EMBED_TIMEOUT_MS` (domyślnie 60000 — pierwszy request po bezczynności płaci cold load modelu na współdzielonym GPU) oraz `KR_EMBED_RETRIES` (domyślnie 2, backoff wykładniczy; 4xx nie jest ponawiane, bo to błąd po naszej stronie). Bez timeoutu zwis serwera embeddingów zawieszał cały reseed.
- **Store:** **dedykowany** Qdrant (docker-compose, port **6401**) — izolowany od współdzielonego prod-Qdrant. Kolekcje: `code_<project>` / `best_practices_<project>` (per-projekt), `patterns_global` / `library_reference_global` (globalne) — rejestr w `src/schema.ts`.
- **Diversity:** wyszukiwanie domyślnie grupuje po `source` (Qdrant `searchPointGroups`, max 2 trafienia z jednego pliku) — unika N wariantów tego samego pliku w wynikach.
- **Transport:** `KR_TRANSPORT=http` (domyślny — współdzielony daemon, docker-compose, port **6403**, każdy caller MUSI podać `collection` jawnie) | `stdio` (legacy, per-sesja subproces).
- **Prywatność:** embed na waszej infra (LAN), nic nie wychodzi.

## Setup + migracja + seed
Migracja (schemat: kolekcja + payload indeksy) jest **rozdzielona** od seedu (chunk+embed+upsert) —
patrz `docs/tasks/TASK-RAG-002.md` sekcja 0.
```bash
cd mcp-server/knowledge-retriever
npm install && npm run build
docker compose up -d                                   # Qdrant :6401 + daemon :6403

# migracja (idempotentna — bezpieczna do wielokrotnego uruchomienia)
node dist/migrate.js --collection patterns_global --dim 1024
node dist/migrate.js --collection library_reference_global --dim 1024
node dist/migrate.js --collection code_<project> --dim 1024    # per projekt, przed pierwszym reindex

# seed (globalne kolekcje — z patterns/, rules/, @vytches/ddd examples)
node dist/global-indexer.js --all                       # albo --patterns / --examples osobno
# kod per-projekt: reseed.config.json (collection → dirs) + ./reseed.sh, lub knowledge_reindex (MCP tool)
```
**Swap modelu** (np. gdy CT 301 leży): ustaw env i rerun `migrate.js --force` + seed — nowy wymiar wymaga recreate.

Rejestracja w projekcie (`.mcp.json`):
```json
{ "mcpServers": { "knowledge-retriever": {
  "type": "http", "url": "http://localhost:6403/mcp" } } }
```
Per-projektowy `.claude/config/knowledge.json` (wymagany dla `collection` domyślnego i freshness hooka):
`{ "collection": "code_myproject", "watchDirs": ["src"] }`.

## Narzędzia MCP
- `retrieve_code(query, k=8, collection)` → top-K istniejących symboli projektu (plik+symbol+linie). `collection` obowiązkowy (shared daemon).
- `retrieve_patterns(query, k=5, kind?, tags?)` → Rule Cards / pełne `*-pattern.md` / anti-patterny z `patterns_global`.
- `retrieve_examples(query, k=5, level?, kind?)` → przykłady `@vytches/ddd` (simple/medium/complex) z `library_reference_global`.
- `knowledge_reindex(dirs, collection)` → przebuduj kolekcję KODU (recreate + re-embed + upsert).
- `POST /reindex-file {file, collection}` (REST, NIE MCP tool) → inkrementalny re-embed jednego pliku; konsument = opt-in hook `hooks/knowledge-freshness-postwrite.js` (patrz `hooks/README.md`).

## Manifest
`mirror/collections.json` (git-committed, tiny) — zapisuje `model`/`dim`/`indexedAt` per kolekcja → wykrywanie driftu modelu.

## Status / roadmap
- ✅ Code retrieval (TS AST + dedykowany Qdrant + swappable embedder + diversity + freshness).
- ✅ Patterns/examples retrieval (`patterns_global`, `library_reference_global`) — TASK-RAG-002 Faza C.
- ⏳ `best_practices_<project>` zarejestrowana w schemacie, NIE zaseedowana (brak danych kuracji w tym repo — per-projekt).
- ⏳ Faza 3: hybrid (BM25) + rerank (CT 301 reranker), `retrieve_decisions`, eval harness.
