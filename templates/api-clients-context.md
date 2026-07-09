# API Clients Context

*Template — copy this file to `.claude/rules/api-clients-context.md` in the **backend**
project, then replace every `[TODO]` with real values. Used by the `api-contract-sync` skill
(`/api-schema-sync`) to know where the OpenAPI schema lives and which repos consume it.*

*Last updated: [YYYY-MM-DD]*

---

## Backend

- **shortcut**: `[TODO — short id, e.g. "backend"]`
- **path**: `[TODO — local path to this repo, usually "." if the config lives here]`
- **openapi_source**: `[TODO — one of:]`
  - a file path: `docs/openapi.json`
  - a URL: `http://localhost:3000/openapi.json` (server must be running)
  - a generation command: `npm run openapi:generate` (writes to a known path, given below)

---

## Consumers

*One entry per repo that consumes this API. Add as many as needed.*

- **shortcut**: `[TODO — e.g. "mobile"]`
  **path**: `[TODO — local path, e.g. "../my-mobile-app"]`
  **kind**: `mobile | web | other-backend`

- **shortcut**: `[TODO — e.g. "web"]`
  **path**: `[TODO — local path, e.g. "../my-web-app"]`
  **kind**: `mobile | web | other-backend`

---

## Task-id convention

*How to recognize that a branch in the backend repo and a branch in a consumer repo are the
SAME coordinated change, so `/api-schema-sync` can tag its report accordingly.*

- **branch pattern**: `[TODO — e.g. "TASK-<ID>-*" or "feature/<ticket>-*"]`

---

## Notes

- This file is **project-specific** — it is never committed to `claude-patterns`, only copied
  into the consuming (backend) project.
- The snapshot `/api-schema-sync` writes on each run lives outside this repo too:
  `~/.claude/api-schema-snapshots/<backend-shortcut>.json`.
- See `patterns/architecture/api-contract-sync-pattern.md` for the full mechanism.
