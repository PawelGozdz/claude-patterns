# Data Fetching Pattern

**Tags**: "web:data-access", "web:platform:nextjs"
**Layer**: Cross-Layer
**Level**: core
**Status**: production

> ORM-neutral: every data call below goes through a named function of a server-only Data Access
> Layer (DAL) under `data/`. What sits inside those functions (Kysely, Drizzle, a SQL client, an
> HTTP client…) is your choice. For per-user data, the session check lives inside the DAL
> function — see `auth-boundaries-pattern.md`.

## When to Use

**Use this pattern for:**
- ✅ Every Next.js 16 page that reads data from a database, API, or external service
- ✅ Static generation, incremental revalidation, or real-time data needs
- ✅ Server Actions that mutate data when the UI must reflect changes immediately
- ✅ Multiple independent data sources that should be fetched in parallel

**Do NOT use for:**
- ❌ `getStaticProps`, `getServerSideProps`, `getInitialProps` — Pages Router APIs removed from App Router; use async Server Components with "use cache"
- ❌ Deciding where identity and permission checks live — that is `auth-boundaries-pattern.md` (per-user data: call `verifySession` inside the DAL function)

---

## Implementation

### The DAL shape used by every example

```ts
// data/notifications.ts
import 'server-only';
import { verifySession } from '@/data/auth'; // see auth-boundaries-pattern.md

export type NotificationDto = { id: string; title: string; body: string };

// Plain arguments in, plain DTOs out. The body can use Kysely, Drizzle, a SQL client…
// — any data layer. The session is verified here, not in the page.
export async function getUnreadNotifications(): Promise<NotificationDto[]> {
  const session = await verifySession();
  return queryUnreadNotifications(session.userId); // your data layer, returns DTOs not rows
}
```

### Basic Server Component Fetch (Uncached / Dynamic)

```tsx
// app/notifications/page.tsx
// No "use cache" — fetched fresh on every request
import { getUnreadNotifications } from '@/data/notifications';

export default async function NotificationsPage() {
  const notifications = await getUnreadNotifications();

  return (
    <ul className="divide-y">
      {notifications.map((n) => (
        <li key={n.id} className="py-3 px-4">
          <p className="font-medium">{n.title}</p>
          <p className="text-sm text-gray-500">{n.body}</p>
        </li>
      ))}
    </ul>
  );
}
```

### Cached Component ("use cache" + cacheLife)

```tsx
// app/blog/page.tsx
'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { getPublishedPosts } from '@/data/posts'; // (limit: number) => Promise<PostSummaryDto[]>

export default async function BlogPage() {
  // Cache for 1 hour, serve stale while revalidating
  cacheLife('hours');
  cacheTag('blog-list');

  const posts = await getPublishedPosts({ limit: 20 });

  return (
    <main className="max-w-3xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Blog</h1>
      {posts.map((post) => (
        <article key={post.id} className="mb-8">
          <a href={`/blog/${post.slug}`} className="text-xl font-semibold hover:underline">
            {post.title}
          </a>
          <p className="text-gray-600 mt-1">{post.excerpt}</p>
          <time className="text-sm text-gray-400">
            {new Date(post.publishedAt).toLocaleDateString()}
          </time>
        </article>
      ))}
    </main>
  );
}
```

### Cached Function (Granular Caching)

```ts
// data/products.ts
'use cache';

import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { findProductById, findProductsByCategory } from '@/data/products-queries';
// ^ your data layer (Kysely, Drizzle, SQL client… — any data layer); returns plain DTOs

export async function getProduct(id: string) {
  cacheLife('days');
  cacheTag(`product-${id}`);

  return findProductById(id); // Promise<ProductDto | null>
}

export async function getProductsByCategory(categorySlug: string) {
  cacheLife('hours');
  cacheTag('products', `category-${categorySlug}`);

  return findProductsByCategory(categorySlug); // Promise<ProductSummaryDto[]>
}
```

### Revalidation with revalidateTag

```ts
// app/actions/blog.ts
'use server';

import { revalidateTag, updateTag } from 'next/cache';
import { createPost } from '@/data/posts'; // (input: NewPostInput) => Promise<{ slug: string }>; verifies the session inside
import { z } from 'zod';

const PostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
});

export async function publishPost(formData: FormData) {
  const parsed = PostSchema.safeParse({
    title: formData.get('title'),
    body: formData.get('body'),
    slug: formData.get('slug'),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  // The DAL function checks the session and the permission, then writes
  const post = await createPost({ ...parsed.data, publishedAt: new Date() });

  // updateTag: instantly purge and regenerate the cached data
  updateTag('blog-list');

  // revalidateTag with 'max' profile: SWR-style — serve stale, revalidate in background
  revalidateTag('blog-sidebar', 'max');

  return { success: true, slug: post.slug };
}
```

### Parallel Data Fetching

```tsx
// app/dashboard/page.tsx
import { getRevenueStats, getUserStats, getRecentOrders } from '@/data/dashboard';
// each DAL function verifies the session and scopes by the caller's org itself

export default async function DashboardPage() {
  // Parallel fetch — all three run simultaneously
  const [revenue, userStats, recentOrders] = await Promise.all([
    getRevenueStats(),
    getUserStats(),
    getRecentOrders({ limit: 10 }),
  ]);

  return (
    <div className="grid grid-cols-3 gap-6 p-6">
      <StatCard title="Revenue" value={`$${revenue.total.toLocaleString()}`} change={revenue.change} />
      <StatCard title="Active Users" value={userStats.active.toLocaleString()} change={userStats.change} />
      <StatCard title="Orders" value={recentOrders.total.toLocaleString()} change={recentOrders.change} />

      <div className="col-span-3">
        <h2 className="text-lg font-semibold mb-4">Recent Orders</h2>
        <OrderTable orders={recentOrders.items} />
      </div>
    </div>
  );
}

function StatCard({ title, value, change }: { title: string; value: string; change: number }) {
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      <p className={`text-sm mt-2 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
        {change >= 0 ? '+' : ''}{change}% vs last month
      </p>
    </div>
  );
}
```

### Client-Side Fetching (When Needed)

```tsx
// app/dashboard/live-metrics.tsx
'use client';

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Use client-side fetching ONLY for:
// - Real-time polling data
// - User-specific data that changes frequently after page load
// - Data that depends on client state (e.g., viewport, scroll position)
// The endpoint is a Route Handler that verifies the session itself (auth-boundaries-pattern.md).
export function LiveMetrics() {
  const { data, error, isLoading } = useSWR('/api/metrics/live', fetcher, {
    refreshInterval: 5000, // Poll every 5 seconds
  });

  if (isLoading) return <div className="animate-pulse h-32 bg-gray-100 rounded-lg" />;
  if (error) return <div className="text-red-600">Failed to load metrics</div>;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="p-4 bg-green-50 rounded-lg">
        <p className="text-sm text-gray-600">Active Users</p>
        <p className="text-3xl font-bold text-green-700">{data.activeUsers}</p>
      </div>
      <div className="p-4 bg-blue-50 rounded-lg">
        <p className="text-sm text-gray-600">Requests/sec</p>
        <p className="text-3xl font-bold text-blue-700">{data.rps}</p>
      </div>
    </div>
  );
}
```

### refresh() for Uncached Data

```tsx
// app/actions/cache.ts
'use server';

import { refresh } from 'next/cache';

// Force the current page to re-fetch all uncached data
// Useful after a mutation that affects multiple uncached queries
export async function refreshPage() {
  refresh();
}
```

---

## Key Rules

1. **Server Components fetch data directly** — no `useEffect`, no `useState`, no loading state for initial data
2. **Data access goes through a server-only DAL** — pages call named functions (`@/data/…`) that take plain arguments and return DTOs; no inline queries in components; for per-user data the DAL function verifies the session (`auth-boundaries-pattern.md`)
3. **"use cache" replaces old caching** — add it to components or functions that should be cached; use `cacheLife()` to set TTL (`'seconds'`, `'minutes'`, `'hours'`, `'days'`, `'weeks'`, `'max'`)
4. **`cacheTag()` enables targeted revalidation** — tag cached data so mutations can invalidate specific slices
5. **`updateTag()` for instant invalidation** — purges the cache entry immediately; next request gets fresh data
6. **`revalidateTag(tag, 'max')` for SWR** — serves stale while regenerating in the background
7. **`refresh()` re-runs the current route** — useful after mutations that affect data not covered by cache tags
8. **Use `Promise.all` for parallel fetches** — never await sequentially when requests are independent
9. **Client-side fetching is the exception** — use SWR/React Query only for real-time polling or post-load user-driven data

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| `useEffect` + `fetch` in every component | Creates waterfalls, shows loading spinners, worse SEO | Fetch in Server Components |
| Sequential awaits for independent data | Doubles/triples load time | `Promise.all([fetchA(), fetchB()])` |
| Inline queries / data-layer client imported in page components | Scatters access checks, leaks whole rows | Call a named DAL function that returns a DTO |
| Caching user-specific data without segmentation | Serves User A's data to User B | Use `cacheTag` with user/org ID, or skip caching for personalized data |
| `revalidateTag` without corresponding `cacheTag` | Nothing gets invalidated — the tag does not exist | Always pair `cacheTag('x')` in the data function with `revalidateTag('x')` in the action |
| `fetch()` with `{ cache: 'force-cache' }` on per-user or authenticated requests | `fetch` is not cached by default (since v15); `force-cache` is an explicit opt-in that caches ANY request, including `POST` and requests carrying `authorization` or `cookie` headers, so one user's response can be served to another | Cache on purpose with the `"use cache"` directive + `cacheLife()` on data that is safe to share; leave per-user fetches uncached |
| Calling `updateTag` for non-critical updates | Unnecessarily purges cache, causing a cold request | Use `revalidateTag(tag, 'max')` for SWR-style background revalidation |
| `getStaticProps` / `getServerSideProps` | Pages Router APIs — do not exist in App Router | Async Server Components with "use cache" |
