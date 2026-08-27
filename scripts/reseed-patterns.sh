#!/usr/bin/env bash
# reseed-patterns.sh — one-command reseed of patterns_global (+ library_reference_global)
# after editing/adding pattern-docs under patterns/** or rules/**.
#
# Purely mechanical (no LLM): builds knowledge-retriever, ensures the dedicated Qdrant is up,
# then runs the global-indexer (recreate() — full drop+rebuild of both collections, not
# incremental). Safe to re-run any time; idempotent.
#
# Usage: ./scripts/reseed-patterns.sh   (from anywhere — resolves its own path)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KR_DIR="$SCRIPT_DIR/../mcp-server/knowledge-retriever"

source "$SCRIPT_DIR/lib/common.sh"

cd "$KR_DIR"

echo -e "${BLUE}[reseed-patterns] 1/4 dedicated Qdrant up (docker compose, :6401)${NC}"
docker compose up -d qdrant >/dev/null

echo -e "${BLUE}[reseed-patterns] 2/4 build${NC}"
npm run build >/dev/null

echo -e "${BLUE}[reseed-patterns] 3/4 reseed patterns_global + library_reference_global${NC}"
npm run seed:global -- --all 2>&1 | grep -E '^\[global-indexer\]|error|Error' || true

# Zapis stanu drzewa: od tego momentu scripts/rag-freshness.mjs potrafi powiedzieć,
# czy kolekcje odpowiadają dyskowi. Bez tego kroku rozjazd jest niewykrywalny — a to
# on stał za incydentem z kartą geo (kolekcja z GEO17 przy dysku z GEO19).
node "$SCRIPT_DIR/rag-freshness.mjs" --record

# Świeżość ≠ trafność: freshness mówi "kolekcja odpowiada dyskowi", nie "retrieval
# nadal trafia właściwe wzorce po tej zmianie treści/chunkingu". Oba tanie do sprawdzenia
# w tym samym miejscu, skoro Qdrant i tak już żyje z reseedu powyżej (TASK-GUARDRAILS-001
# Sekcja 2).
echo -e "${BLUE}[reseed-patterns] 4/4 eval retrievalu (golden-set, bramka hit@5)${NC}"
node "$SCRIPT_DIR/../tests/flow-evals/retrieval/run.js"

echo -e "${GREEN}[reseed-patterns] OK${NC} — retrieve_patterns now reflects the current patterns/**+rules/** tree."
echo -e "${YELLOW}Note:${NC} this is a full recreate() of both global collections — safe, but batch multiple"
echo -e "pattern edits into one reseed rather than running this after every single file change."
