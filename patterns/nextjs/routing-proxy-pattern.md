# Routing & Proxy Pattern

## When to Use

- Every Next.js 16 application with multiple pages, authentication, or internationalization
- When you need shared layouts, loading states, error boundaries, or not-found pages
- When requests must be intercepted for auth checks, redirects, geolocation, or header injection
- When implementing parallel routes (e.g., modals) or intercepting routes

**Do NOT** use `middleware.ts` — it has been replaced by `proxy.ts` in Next.js 16. Do NOT use Pages Router `_app.tsx` or `_document.tsx`.

---

## Implementation

### App Router File Structure

```
app/
  layout.tsx              # Root layout (required)
  page.tsx                # Home page (/)
  loading.tsx             # Root loading UI
  error.tsx               # Root error boundary
  not-found.tsx           # Root 404 page
  (marketing)/
    page.tsx              # / (same as root, route group for layout)
    about/page.tsx        # /about
    pricing/page.tsx      # /pricing
    layout.tsx            # Marketing layout (no sidebar)
  (app)/
    dashboard/
      page.tsx            # /dashboard
      loading.tsx         # Dashboard loading skeleton
    settings/
      page.tsx            # /settings
      profile/page.tsx    # /settings/profile
    layout.tsx            # App layout (with sidebar + auth)
  blog/
    page.tsx              # /blog
    [slug]/page.tsx       # /blog/:slug
  api/
    webhooks/route.ts     # API route: /api/webhooks
proxy.ts                  # Request interception (replaces middleware.ts)
```

### proxy.ts — Auth Guard + Redirects (Replaces middleware.ts)

```ts
// proxy.ts (root of the project, next to next.config.ts)
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Auth Guard ---
  const sessionToken = request.cookies.get('session-token')?.value;
  const protectedPaths = ['/dashboard', '/settings', '/api/private'];

  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected && !sessionToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // --- Redirect logged-in users away from auth pages ---
  const authPaths = ['/login', '/register'];
  if (authPaths.includes(pathname) && sessionToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // --- i18n: Detect locale and redirect ---
  const acceptLanguage = request.headers.get('accept-language') ?? '';
  const supportedLocales = ['en', 'es', 'fr', 'de'];
  const hasLocalePrefix = supportedLocales.some((l) => pathname.startsWith(`/${l}/`));

  if (!hasLocalePrefix && pathname === '/') {
    const preferred = acceptLanguage.split(',')[0]?.split('-')[0] ?? 'en';
    const locale = supportedLocales.includes(preferred) ? preferred : 'en';
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  // --- Security Headers ---
  const response = NextResponse.next();
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

// Define which paths proxy.ts should run on
export const config = {
  matcher: [
    // Match all paths except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
```

### Root Layout

```tsx
// app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'My App', template: '%s | My App' },
  description: 'Built with Next.js 16',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="min-h-screen bg-gray-50">{children}</body>
    </html>
  );
}
```

### Route Group Layout with Auth

```tsx
// app/(app)/layout.tsx
import { getUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/top-bar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  // Server-side auth check — proxy.ts handles redirects for cookie-level,
  // but this catches session expiry / invalid tokens
  if (!user) redirect('/login');

  return (
    <div className="flex h-screen">
      <Sidebar user={user} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar user={user} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
```

### Loading UI (Streaming Skeleton)

```tsx
// app/(app)/dashboard/loading.tsx
export default function DashboardLoading() {
  return (
    <div className="grid grid-cols-3 gap-6 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-32 bg-gray-200 rounded-xl" />
      ))}
      <div className="col-span-3 h-64 bg-gray-200 rounded-xl" />
    </div>
  );
}
```

### Error Boundary

```tsx
// app/(app)/dashboard/error.tsx
'use client'; // Error boundaries MUST be Client Components

import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error reporting service
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <h2 className="text-xl font-semibold text-red-600">Something went wrong</h2>
      <p className="text-gray-600">
        {error.digest ? `Error ID: ${error.digest}` : error.message}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Try Again
      </button>
    </div>
  );
}
```

### Dynamic Route with Async Params

```tsx
// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { getPostBySlug, getAllPostSlugs } from '@/lib/data/posts';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Generate static params for build-time generation
export async function generateStaticParams() {
  const slugs = await getAllPostSlugs();
  return slugs.map((slug) => ({ slug }));
}

// Dynamic metadata
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return { title: 'Not Found' };
  return { title: post.title, description: post.excerpt };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) notFound();

  return (
    <article className="max-w-2xl mx-auto py-8 prose prose-lg">
      <h1>{post.title}</h1>
      <time className="text-gray-500">{new Date(post.publishedAt).toLocaleDateString()}</time>
      <div dangerouslySetInnerHTML={{ __html: post.htmlContent }} />
    </article>
  );
}
```

### Not Found Page

```tsx
// app/not-found.tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-6xl font-bold text-gray-300">404</h1>
      <p className="text-xl text-gray-600">Page not found</p>
      <Link href="/" className="text-blue-600 hover:underline">
        Return home
      </Link>
    </div>
  );
}
```

---

## Key Rules

1. **`proxy.ts` replaces `middleware.ts`** — same API (`NextRequest`/`NextResponse`), new file name, placed at the project root
2. **`params` and `searchParams` are async** — always `const { slug } = await params`
3. **Route groups `(name)` do not affect the URL** — use them to share layouts without adding URL segments
4. **`loading.tsx` enables streaming** — React Suspense boundary; displayed while the page's async data loads
5. **`error.tsx` must be a Client Component** — error boundaries require `"use client"` for the `reset()` callback
6. **Layouts do not re-render on navigation** — they persist; do not put per-page data in layouts
7. **`generateStaticParams` replaces `getStaticPaths`** — returns an array of param objects for static generation

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| `middleware.ts` | Renamed to `proxy.ts` in Next.js 16 | Use `proxy.ts` at the project root |
| Heavy logic in `proxy.ts` | Runs on every matched request; must be fast | Keep proxy.ts thin — auth cookie check + redirects only; heavy logic in Server Components |
| Sync `params` destructuring | `params` is a Promise in Next.js 16 | `const { id } = await params` |
| Data fetching in layouts | Layout does not re-run on child navigation | Fetch data in page.tsx or in Server Components within the page |
| Nested `try/catch` instead of `error.tsx` | Loses the ability to `reset()` and retry the route segment | Use `error.tsx` for recoverable errors |
| `_app.tsx` / `_document.tsx` | Pages Router files — do not exist in App Router | Use `app/layout.tsx` for the root layout |
| Putting auth redirect only in proxy.ts | Cookie presence does not guarantee valid session | Double-check auth in Server Component layouts + proxy.ts |
