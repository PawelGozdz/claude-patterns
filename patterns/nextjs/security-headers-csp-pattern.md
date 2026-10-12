# Security Headers & CSP Pattern

**Tags**: "web:security", "web:platform:nextjs"
**Layer**: Cross-Layer
**Level**: core
**Status**: production

> Verified against nextjs.org/docs (Content Security Policy guide) for Next.js 16.4, 2026-10.
> Only the CSP and `headers()` mechanics are Next.js-specific; the other headers listed are
> general web practice and are marked as such.

## What This Is

A Content Security Policy tells the browser which origins may supply scripts, styles, images,
frames and form targets, which limits the damage of an XSS bug. In Next.js there are exactly two
ways to ship it, and they have opposite consequences for rendering: a **static** policy set in
`next.config` (keeps static generation, needs `'unsafe-inline'`), or a **per-request nonce** set
in `proxy.ts` (strict, forces dynamic rendering). This pattern helps choose and wire one.

## When to Use

**Use this pattern for:**
- ✅ Adding a CSP and baseline security headers to a Next.js app
- ✅ Deciding between a static CSP and a nonce-based strict CSP
- ✅ Allowing third-party scripts (analytics, tag managers) under a strict CSP
- ✅ Debugging "blocked by CSP" errors in dev or production

**Do NOT use for:**
- ❌ Input sanitisation or output escaping — CSP is a second line of defence, not a replacement
  (see `auth-boundaries-pattern.md` for access control, your validation layer for input)
- ❌ CORS for API consumers — see `route-handlers-pattern.md`

---

## Implementation

### Choosing the mode

| | Static CSP (`next.config`) | Nonce CSP (`proxy.ts`) |
|---|---|---|
| Inline scripts | `'unsafe-inline'` allowed | blocked, only nonce-tagged run |
| Rendering | static generation, ISR, CDN caching kept | **all pages dynamic**: no static optimisation, no ISR, no CDN caching without extra setup |
| Partial Prerendering | works | **incompatible** (static shell has no access to the nonce) |
| Strength | weaker against XSS | strict |
| Choose when | content sites, performance first | sensitive data, compliance, no `'unsafe-inline'` allowed |

Experimental alternative: Subresource Integrity (`experimental.sri`, algorithm `sha256`|`sha384`|
`sha512`) adds hashes to scripts at build time so a strict CSP can keep static generation. It is
App Router only, build-time only and may change, so treat it as an option to evaluate, not a default.

### A. Static CSP in `next.config.ts`

```ts
// next.config.ts
import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

const csp = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, ' ').trim();

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          // general web practice, not Next.js-specific:
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
```

`'unsafe-eval'` is needed in development only (React uses `eval` for debugging information such as
server error stacks); neither React nor Next.js use `eval` in production.

### B. Nonce CSP in `proxy.ts`

```ts
// proxy.ts
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64'); // fresh per request
  const isDev = process.env.NODE_ENV === 'development';

  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''};
    style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`};
    img-src 'self' blob: data:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp); // Next.js reads the nonce from THIS header

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

// Skip prefetches and static assets: they do not need a nonce.
export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
```

How it works: Next.js parses the `Content-Security-Policy` header during server rendering,
extracts the `'nonce-…'` value and applies it to framework scripts, page bundles, inline scripts
and styles it generates, and any `<Script nonce>`. You do not tag each element by hand.

Pages must be dynamically rendered or the nonce never reaches them. Pages that read request data
are already dynamic; for the others, opt in:

```tsx
import { connection } from 'next/server';

export default async function Page() {
  await connection(); // wait for an incoming request, so a nonce exists
  // ...
}
```

### Third-party scripts under a nonce

```tsx
// app/layout.tsx
import { headers } from 'next/headers';
import { GoogleTagManager } from '@next/third-parties/google';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en">
      <body>
        {children}
        <GoogleTagManager gtmId="GTM-XXXX" nonce={nonce} />
      </body>
    </html>
  );
}
```

Then add that vendor's hosts to `script-src` / `connect-src` / `img-src`. Reading `headers()` in the
root layout makes every page dynamic, which a nonce CSP already requires.

### Other headers (general web practice)

| Header | Value | Note |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | only when the site is always served over HTTPS; add `preload` deliberately |
| `X-Content-Type-Options` | `nosniff` | |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | |
| `Permissions-Policy` | disable features you do not use | |
| `frame-ancestors` (in CSP) | `'none'` or an allow-list | supersedes `X-Frame-Options` |

If a reverse proxy or CDN already sets a header, set it in one place only.

---

## Key Rules

1. Pick the mode on purpose: static CSP keeps static rendering, nonce CSP gives strictness and costs caching.
2. A nonce is unique per request and unpredictable; never reuse or hard-code one.
3. Nonce CSP means every page is dynamic; do not combine it with Partial Prerendering.
4. `'unsafe-eval'` only in development.
5. Keep `object-src 'none'`, `base-uri 'self'`, `frame-ancestors` and `form-action` explicit.
6. Add CSP to the test checklist: load key pages in a browser and assert no CSP violations in the console.

## Anti-Patterns

| Anti-pattern | Why it hurts | Instead |
|---|---|---|
| Nonce CSP on pages that are statically generated | build succeeds, runtime scripts blocked | `await connection()` or dynamic APIs; or choose the static CSP |
| One nonce generated at build time | defeats the purpose | per-request nonce in `proxy.ts` |
| `'unsafe-inline'` AND a nonce expecting strictness | nonce-aware browsers ignore `'unsafe-inline'`, others fall back to it — confusing | decide one mode |
| `script-src *` or a CDN wildcard | any script on that host runs | exact hosts, `'strict-dynamic'` with a nonce |
| Matcher runs on every prefetch and static file | wasted work | exclude prefetch headers and static paths |
| CSP set both in `next.config` and `proxy.ts` | two policies intersect unpredictably | one mechanism |
