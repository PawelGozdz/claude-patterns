#!/usr/bin/env bash
# Reseed code retrieval: ensure dedicated Qdrant up → build → reindex collections from reseed.config.json.
# Lightweight + idempotent. Swap embed model: set KR_EMBED_PROVIDER/URL/MODEL then rerun.
#   KR_EMBED_PROVIDER=openai KR_EMBED_URL=http://host:port/v1/embeddings KR_EMBED_MODEL=nomic-embed-text ./reseed.sh
set -e
cd "$(dirname "$0")"

echo "[reseed] 1/3 dedicated Qdrant (docker-compose, :6401)"
docker compose up -d

echo "[reseed] 2/3 build"
npm run build >/dev/null

echo "[reseed] 3/3 reindex (embed model: ${KR_EMBED_PROVIDER:-ct301}/${KR_EMBED_MODEL:-multilingual-e5-large})"
node reseed.mjs

echo "[reseed] OK — KR_QDRANT_URL=${KR_QDRANT_URL:-http://localhost:6401}"
