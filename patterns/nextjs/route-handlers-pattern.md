# Route Handlers Pattern

**Tags**: "web:api-surface", "web:platform:nextjs"
**Layer**: Cross-Layer
**Level**: core
**Status**: production

> Verified against nextjs.org/docs (route.js reference, Server Actions guide) for Next.js 16.4, 2026-10.

## What This Is

Next.js has two ways for a client to reach the server: **Server Actions** (UI mutations from your
own app) and **Route Handlers** (`route.ts`, plain HTTP endpoints). They are not interchangeable.
This pattern says which to pick, and how to write a Route Handler that is safe to expose.

## When to Use

**Use a Route Handler for:**
- ✅ Webhooks from third parties (payments, git hosts, auth providers)
- ✅ Endpoints called by something that is not your React tree: mobile apps, other services, cron
- ✅ Auth-library callback and API routes (e.g. a catch-all `app/api/auth/[...all]/route.ts`)
- ✅ Non-UI or non-HTML responses: RSS, feeds, file downloads, streaming
- ✅ Anything needing custom status codes, headers, CORS or a stable public URL contract

**Use a Server Action instead for:**
- ❌ A form or button in your own app that mutates data — see `forms-actions-pattern.md`.
  Server Actions integrate with revalidation and re-render the page in the same round trip.
- ❌ A `GET` that only feeds a Server Component — fetch in the component or through the DAL;
  an internal HTTP hop adds latency and a second place to forget the auth check.

**Not a Route Handler:** `GET` data for your own pages (use Server Components); client-side
fan-out of several mutations in parallel (Server Actions are dispatched one at a time per
client — do the parallel work inside one action).

---

## Implementation

### Anatomy

```ts
// app/api/items/[id]/route.ts
import type { NextRequest } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { getItem } from '@/data/items';

// `params` is a Promise. `RouteContext` is a globally available typed helper; types are
// generated during `next dev`, `next build` or `next typegen`.
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/items/[id]'>) {
  const session = await readSession();
  if (!session) return new Response(null, { status: 401 });

  const { id } = await ctx.params;
  const item = await getItem(id); // DAL: authorization + DTO live there
  if (!item) return new Response(null, { status: 404 });
  return Response.json(item);
}
```

Supported methods: `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`. If you do not
define `OPTIONS`, Next.js answers it and sets `Allow` from the methods you did define.

### Validate input at the boundary

```ts
// app/api/items/route.ts
import { z } from 'zod';
import { readSession } from '@/lib/auth/session';
import { createItem } from '@/data/items';

const CreateItem = z.object({ title: z.string().min(1).max(120) });

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return new Response(null, { status: 401 });

  const parsed = CreateItem.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'invalid_input' }, { status: 400 });
  }
  const item = await createItem(parsed.data); // identity comes from the session inside the DAL
  return Response.json(item, { status: 201 });
}
```

Route Handlers are public endpoints: authenticate, authorize, validate. Do not echo `error.message`
from internals to the client.

### Webhooks — read the raw body, verify the signature

```ts
// app/api/webhooks/payments/route.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env.server';

export async function POST(request: Request) {
  const raw = await request.text(); // raw text: signatures are computed over exact bytes
  const received = request.headers.get('x-signature') ?? '';

  const expected = createHmac('sha256', env.PAYMENTS_WEBHOOK_SECRET).update(raw).digest('hex');
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return new Response(null, { status: 401 });
  }

  const event = JSON.parse(raw);
  // Idempotency: providers retry. Store the event id and skip duplicates.
  // Acknowledge fast, do heavy work asynchronously (queue / background job).
  return new Response(null, { status: 200 });
}
```

No `bodyParser` config is needed (that was the Pages Router). The signature scheme is the
provider's; this one is a generic HMAC example. A webhook has no user session — the signature IS
its authentication.

If the webhook must refresh cached data, `updateTag` is not available (it works in Server
Actions only). Call `revalidateTag` with its second argument, which is required:

```ts
import { revalidateTag } from 'next/cache';

revalidateTag('orders', { expire: 0 }); // next request blocks on fresh data
revalidateTag('catalog', 'max');        // serve stale while revalidating in the background
```

`revalidateTag` works in Server Functions and Route Handlers, not in Client Components or
`proxy.ts`. The single-argument form is deprecated. Pick `{ expire: 0 }` when the caller needs the
data gone immediately, `'max'` when a slightly stale page is acceptable.

### Caching

`GET` Route Handlers are NOT cached by default (dynamic) since Next.js 15. To cache one, opt in
explicitly (route segment config or, with Cache Components, `'use cache'` in the code it calls).
Never assume a handler is static: a handler that reads cookies, headers or per-user data must
stay dynamic.

### CORS

```ts
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://app.example.com', // an origin, not '*', for credentialed APIs
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
```

To add CORS headers to many handlers, use `proxy.ts` or `headers()` in `next.config`.

---

## Key Rules

1. Own-UI mutation → Server Action. Outside caller, webhook, or custom HTTP contract → Route Handler.
2. Every handler authenticates (session or signature), authorizes the resource, and validates input.
3. Return explicit status codes: 401 unauthenticated, 403 forbidden, 404, 400 invalid, 429 limited.
4. Webhooks: raw body, constant-time signature check, idempotency, fast acknowledgement.
5. `GET` is dynamic by default; do not rely on implicit caching, and do not cache per-user data.
6. Route Handlers call DAL functions instead of querying directly.

## Anti-Patterns

| Anti-pattern | Why it hurts | Instead |
|---|---|---|
| `route.ts` just to submit your own form | loses revalidation and progressive enhancement | Server Action |
| Server Component calling its own `/api/...` over HTTP | extra hop, duplicated auth check | call the DAL function directly |
| Webhook parses JSON, then verifies a signature over the re-serialized body | bytes differ, signature fails or can be forged around | `request.text()` first, verify, then parse |
| `===` on signatures | timing side channel | `timingSafeEqual` on equal-length buffers |
| `Access-Control-Allow-Origin: *` with cookies | credentialed cross-origin access | explicit origin allow-list |
| Returning `error.message` / stack | leaks internals | stable error codes, log the detail server-side |
| Assuming `GET` handlers are cached | per-user data may be shared or stale | decide caching explicitly |
