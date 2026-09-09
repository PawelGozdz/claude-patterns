# knowledge-retriever — HTTP MCP daemon (shared across projects). See docker-compose.yml.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# Needed at RUNTIME, not just for reseeding: indexer.ts::pinnedCollections reads it to refuse
# per-file reindex on a collection pinned to a canonical git ref (TASK-RAG-004 R2.3). Without the
# file in the image the guard finds nothing pinned and silently lets contamination back in.
COPY reseed.config.json ./
EXPOSE 6403
CMD ["node", "dist/index.js"]
