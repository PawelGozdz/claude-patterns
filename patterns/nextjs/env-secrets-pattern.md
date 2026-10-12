# Env & Secrets Pattern

**Tags**: "web:security", "web:platform:nextjs"
**Layer**: Cross-Layer
**Level**: core
**Status**: production

> Verified against nextjs.org/docs (Environment Variables, Data Security guides) for Next.js 16.4, 2026-10.

## What This Is

Next.js lets server code read `process.env` and ships any variable named `NEXT_PUBLIC_*` to the
browser, frozen at build time. Mistakes here are quiet: a secret in a public variable, a "runtime"
value that was baked into the bundle, a missing variable discovered in production. This pattern
makes the server/client split explicit and validates configuration in one place.

## When to Use

**Use this pattern for:**
- ✅ Any app that reads configuration or secrets (database URL, API keys, session secret)
- ✅ Deciding whether a value may be public (`NEXT_PUBLIC_`) or must stay server-only
- ✅ Building one Docker image promoted through several environments (build-time vs runtime values)
- ✅ Failing fast on missing or malformed configuration

**Do NOT use for:**
- ❌ Choosing a secrets manager or rotating keys — that is infrastructure; this pattern only covers how the app reads them
- ❌ Authentication design — see `auth-boundaries-pattern.md`

---

## Implementation

### Server vs public

| Variable | Visible to | When the value is fixed |
|---|---|---|
| `DATABASE_URL`, `SESSION_SECRET`, API keys | server only | read at runtime in dynamic rendering |
| `NEXT_PUBLIC_*` | server AND browser bundle | inlined at `next build`, frozen afterwards |

`NEXT_PUBLIC_` means "published to every visitor". Never put a secret, an internal URL or a key with
write power behind that prefix. After the build, changing a `NEXT_PUBLIC_` variable has no effect;
one image promoted from staging to production keeps the staging value. If the browser needs a
runtime value, serve it from your own endpoint or pass it from a Server Component as a prop.

Inlining is a textual replacement, so dynamic lookups are NOT inlined:

```ts
const ok = process.env.NEXT_PUBLIC_ANALYTICS_ID;     // inlined
const key = 'NEXT_PUBLIC_ANALYTICS_ID';
const broken = process.env[key];                     // undefined in the browser
const env = process.env; const alsoBroken = env.NEXT_PUBLIC_ANALYTICS_ID; // undefined in the browser
```

### One validated, server-only config module

```ts
// lib/env.server.ts
import 'server-only'; // build error if a Client Component imports this
import { z } from 'zod';

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32), // e.g. generated with: openssl rand -base64 32
  PAYMENTS_WEBHOOK_SECRET: z.string().min(1),
});

const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  // Names only. Never print values.
  const names = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  throw new Error(`Invalid server environment: ${names}`);
}

export const env = parsed.data;
```

```ts
// lib/env.public.ts — only NEXT_PUBLIC_ values, each referenced statically so it is inlined
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
  analyticsId: process.env.NEXT_PUBLIC_ANALYTICS_ID ?? '',
} as const;
```

Only the DAL and server adapters import `env.server`. Keeping secret access in one layer stops
other modules from reading or leaking it.

### Reading a runtime value in a prerendered app

A statically rendered page evaluates `process.env` at build time. To read a value per request,
opt into dynamic rendering first:

```tsx
import { connection } from 'next/server';

export default async function Page() {
  await connection(); // cookies(), headers() and other request-time APIs also opt in
  const region = process.env.DEPLOY_REGION; // evaluated at request time
  return <p>{region}</p>;
}
```

### Files and load order

Lookup order, first match wins: `process.env`, `.env.$(NODE_ENV).local`, `.env.local` (skipped when
`NODE_ENV=test`), `.env.$(NODE_ENV)`, `.env`. With a `src/` folder, `.env*` files still live in the
project root.

- `.env*.local` and any file with real secrets are gitignored. `.env.test` (no secrets) may be committed.
- Commit an `.env.example` listing every variable name with empty or fake values.
- Outside the Next runtime (ORM config, test setup) load the same files with `loadEnvConfig` from `@next/env`.

### Keeping server data off the client

- `import 'server-only'` on every module that holds secrets or business logic.
- Pass Client Components minimal props, never whole records (see `auth-boundaries-pattern.md`, DTOs).
- React taint APIs (`experimental_taintObjectReference`, `experimental_taintUniqueValue`, behind
  `experimental.taint`) are an extra, experimental layer. They do not replace filtering in the DAL.

---

## Key Rules

1. Secrets never carry the `NEXT_PUBLIC_` prefix. If a browser needs it, it is not a secret.
2. Validate all server variables once at startup in one `server-only` module; fail fast with names, never values.
3. Reference `NEXT_PUBLIC_*` statically (`process.env.NEXT_PUBLIC_X`), never through a variable or alias.
4. Build-time values are frozen: one image for many environments means no environment-specific `NEXT_PUBLIC_` values.
5. Real secrets are never committed; `.env.example` documents the contract.
6. Only the data layer reads secrets; everything else gets already-safe values.

## Anti-Patterns

| Anti-pattern | Why it hurts | Instead |
|---|---|---|
| `NEXT_PUBLIC_API_SECRET` | published to every visitor | server-only variable, call the API from the server |
| `process.env[name]` for a public value | not inlined, `undefined` in the browser | static reference |
| Same image promoted with env-specific `NEXT_PUBLIC_` | value from the build environment sticks | per-env build, or serve the value at runtime |
| `process.env.X!` scattered across modules | missing config surfaces as a runtime crash deep in a request | one validated `env.server.ts` |
| Logging the env object or its values | secrets in logs | log variable names only |
| Importing the DB client in a Client Component | build error at best, bundled secret at worst | `server-only` + DAL |
