# Observability Pattern

**Tags**: "web:observability", "web:platform:nextjs"
**Layer**: Cross-Layer
**Level**: core
**Status**: production

> Verified against nextjs.org/docs (Instrumentation guide, instrumentation.js reference) for Next.js 16.4, 2026-10.
> The redaction and logging rules are general practice layered on the documented API.

## What This Is

Next.js has one supported hook for production observability: `instrumentation.ts` at the project
root. It exports `register()` (runs once when a server instance starts, before it serves requests)
and `onRequestError()` (called when the server captures an error). Everything else — traces,
structured logs, error reporting — plugs into those two functions. This pattern shows the wiring
and, importantly, what must NOT leave your process when you forward an error.

## When to Use

**Use this pattern for:**
- ✅ Sending server errors (render, route handler, Server Action, proxy) to an error tracker
- ✅ Starting OpenTelemetry tracing for a Next.js app
- ✅ Running one-time server start-up code (a library with side effects, a metrics client)
- ✅ Deciding what is safe to log or report from a request

**Do NOT use for:**
- ❌ Browser-side error tracking — that is a client SDK, not `instrumentation.ts`
- ❌ Business audit trails (who did what) — that is domain data, not telemetry
- ❌ Per-request logic or auth — use the DAL, `proxy.ts` or a handler

---

## Implementation

### File placement

`instrumentation.ts` goes in the project root, or in `src/` next to `app/` when you use a `src`
folder. It must not be inside `app/` or `pages/`. If you set `pageExtensions` with a suffix,
rename the file to match.

### `register()` — once per server instance

```ts
// instrumentation.ts
export async function register() {
  // Called in every runtime, so guard anything that is runtime-specific.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node'); // OTel SDK, metrics client, ...
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./instrumentation.edge');
  }
}
```

Import side-effect modules from inside `register()`, not at the top of the file, so all start-up
side effects live in one place. `register()` must finish before the server is ready, so keep it fast.

OpenTelemetry with the Vercel helper (works anywhere, not only on Vercel):

```ts
// instrumentation.node.ts
import { registerOTel } from '@vercel/otel';

registerOTel('my-service'); // service name shown in your tracing backend
```

If you need full control, set up the OpenTelemetry Node SDK in the same `nodejs` branch, following
the OpenTelemetry documentation.

### `onRequestError()` — report, redacting first

```ts
// instrumentation.ts (continued)
import type { Instrumentation } from 'next';

const SENSITIVE_HEADERS = new Set(['cookie', 'set-cookie', 'authorization', 'x-api-key']);

function safeHeaders(headers: Record<string, string | string[]>) {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !SENSITIVE_HEADERS.has(name.toLowerCase())),
  );
}

function stripQuery(path: string) {
  return path.split('?')[0]; // query strings can carry tokens and PII
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const message = err instanceof Error ? err.message : String(err);
  const digest =
    typeof err === 'object' && err !== null && 'digest' in err ? String(err.digest) : undefined;

  // Await async work: onRequestError is triggered when the server captures the error.
  await reportError({
    message,
    digest, // React may wrap errors thrown while rendering Server Components; the digest identifies the original
    path: stripQuery(request.path),
    method: request.method,
    headers: safeHeaders(request.headers),
    routePath: context.routePath,        // e.g. /app/blog/[slug]
    routeType: context.routeType,        // 'render' | 'route' | 'action' | 'proxy'
    routerKind: context.routerKind,
    revalidateReason: context.revalidateReason,
  });
};
```

`reportError` is your tracker's client (Sentry, OpenTelemetry logs, an internal endpoint). Its
failure must never throw back into the request: wrap it so an outage in telemetry cannot cause
an outage in the app.

The documented example forwards the whole `request` and `context` objects. In production that
means cookies, authorization headers and query strings leave your process, so filter them as above.

### Logging

- One structured (JSON) logger module for the server, writing to stdout; the platform collects it.
- Log an event name plus identifiers (request id, route, user id), not payloads.
- Never log: passwords, session tokens, cookies, authorization headers, full request bodies, secrets.
- Use `routeType` and `routePath` from `context` as fields to group errors by where they happened
  (`'action'` errors are Server Actions, `'proxy'` errors come from `proxy.ts`).
- Do not use `console.log` for application events in production code; use the logger.

### Correlating

Generate or accept a request id in `proxy.ts`, forward it as a header, and put it on every log
line and on the reported error, so one user report maps to one trace.

---

## Key Rules

1. One `instrumentation.ts` at the root; `register()` once, fast, runtime-guarded.
2. Branch on `process.env.NEXT_RUNTIME`; do not import Node-only code unconditionally.
3. `onRequestError` awaits its async work and never throws.
4. Redact cookies, authorization headers and query strings before anything leaves the process.
5. Treat the `err` as `unknown`; narrow it, and use `digest` to identify errors wrapped by React.
6. Structured logger, no raw `console.*` in production paths, no secrets or payloads in logs.

## Anti-Patterns

| Anti-pattern | Why it hurts | Instead |
|---|---|---|
| Forwarding `request` + `context` verbatim | cookies and tokens reach a third party | allow-list or strip sensitive fields |
| Top-level `import 'node-only-lib'` in `instrumentation.ts` | breaks the edge runtime build | import inside the `nodejs` branch |
| Slow work in `register()` | delays server readiness | keep it to wiring; defer heavy work |
| Reporter throws inside `onRequestError` | telemetry outage becomes app outage | catch and swallow with a local log |
| `console.log(JSON.stringify(req))` | unstructured and leaks | structured logger with chosen fields |
| Putting `instrumentation.ts` under `app/` | never picked up | project root or `src/` |
