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

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

cd "$KR_DIR"

echo -e "${BLUE}[reseed-patterns] 1/3 dedicated Qdrant up (docker compose, :6401)${NC}"
docker compose up -d qdrant >/dev/null

echo -e "${BLUE}[reseed-patterns] 2/3 build${NC}"
npm run build >/dev/null

echo -e "${BLUE}[reseed-patterns] 3/3 reseed patterns_global + library_reference_global${NC}"
npm run seed:global -- --all 2>&1 | grep -E '^\[global-indexer\]|error|Error' || true

echo -e "${GREEN}[reseed-patterns] OK${NC} — retrieve_patterns now reflects the current patterns/**+rules/** tree."
echo -e "${YELLOW}Note:${NC} this is a full recreate() of both global collections — safe, but batch multiple"
echo -e "pattern edits into one reseed rather than running this after every single file change."
