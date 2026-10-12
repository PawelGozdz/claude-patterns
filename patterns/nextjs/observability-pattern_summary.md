# Observability (Next.js instrumentation) — Rule Card

**Tags**: "web:observability", "web:platform:nextjs"

**Layer**: Cross-Layer · **Applies to**: `instrumentation.ts` (+ `instrumentation.node.ts` /
`.edge.ts`), server logger module, error-reporting code, request-id handling in `proxy.ts`

## MUST

- **OB1** — One `instrumentation.ts` at the project root (or `src/` beside `app/`), never
  inside `app/` or `pages/`; `register()` runs once, stays fast, and is runtime-guarded.
- **OB2** — Branch on `process.env.NEXT_RUNTIME`; Node-only code is imported inside the
  `nodejs` branch, never at the top of the file.
- **OB3** — `onRequestError` awaits its async work and never throws; a reporter failure is
  caught and logged locally.
- **OB4** — Cookies, authorization headers and query strings are redacted before anything
  leaves the process (allow-list or strip).
- **OB5** — `err` is treated as `unknown` and narrowed; `digest` identifies errors wrapped
  by React.
- **OB6** — One structured (JSON) server logger writing to stdout; log event name plus
  identifiers (request id, route, user id), not payloads.
- **OB7** — Errors are grouped by `context.routeType` and `context.routePath`.
- **OB8** — A request id is generated or accepted in `proxy.ts` and put on every log line and
  reported error.

## MUST NOT

- **N1** — ❌ Forwarding `request` + `context` verbatim to a third party.
- **N2** — ❌ Logging passwords, session tokens, cookies, authorization headers, full request
  bodies or secrets.
- **N3** — ❌ Raw `console.*` for application events in production code.
- **N4** — ❌ Slow or heavy work in `register()`.
- **N5** — ❌ Using `instrumentation.ts` for browser error tracking, business audit trails or
  per-request logic.

## Verifier — most common violations -> VETO

| Symptom | Rule |
|---|---|
| `onRequestError` passes `request.headers` / `request.path` unfiltered | OB4/N1 |
| Top-level `import` of a Node-only lib in `instrumentation.ts` | OB2 |
| `reportError` not wrapped, can throw into the request | OB3 |
| `console.log(JSON.stringify(req))` or logged tokens/cookies | N2/N3 |
| `instrumentation.ts` under `app/` | OB1 |
| Heavy awaits inside `register()` | N4/OB1 |
