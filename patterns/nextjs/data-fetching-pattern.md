# Data Fetching Pattern

## When to Use

- Every Next.js 16 page that reads data from a database, API, or external service
- When you need static generation, incremental revalidation, or real-time data
- When Server Actions mutate data and the UI must reflect changes immediately
- When multiple independent data sources should be fetched in parallel

**Do NOT** use `getStaticProps`, `getServerSideProps`, or `getInitialProps` — these are Pages Router APIs removed from App Router.

---

## Implementation

### Basic Server Component Fetch (Uncached / Dynamic)

```tsx
// app/notifications/page.tsx
// No "use cache" — fetched fresh on every request
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';

export default async function NotificationsPage() {
  const user = await getUser();
  const notifications = await db.notification.findMany({
    where: { userId: user.id, read: false },
    orderBy: { createdAt: 'desc' },
  });

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
import { db } from '@/lib/db';

export default async function BlogPage() {
  // Cache for 1 hour, serve stale while revalidating
  cacheLife('hours');
  cacheTag('blog-list');

  const posts = await db.post.findMany({
    where: { published: true },
    orderBy: { publishedAt: 'desc' },
    take: 20,
  });

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

```tsx
// lib/data/products.ts
'use cache';

import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/lib/db';

export async function getProduct(id: string) {
  cacheLife('days');
  cacheTag(`product-${id}`);

  return db.product.findUnique({
    where: { id },
    include: { images: true, category: true },
  });
}

export async function getProductsByCategory(categorySlug: string) {
  cacheLife('hours');
  cacheTag('products', `category-${categorySlug}`);

  return db.product.findMany({
    where: { category: { slug: categorySlug } },
    orderBy: { createdAt: 'desc' },
  });
}
```

### Revalidation with revalidateTag

```tsx
// app/actions/blog.ts
'use server';

import { revalidateTag, updateTag } from 'next/cache';
import { db } from '@/lib/db';
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

  const post = await db.post.create({
    data: { ...parsed.data, published: true, publishedAt: new Date() },
  });

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
import { getUser } from '@/lib/auth';
import { getRevenueStats, getUserStats, getRecentOrders } from '@/lib/data/dashboard';

export default async function DashboardPage() {
  const user = await getUser();

  // Parallel fetch — all three run simultaneously
  const [revenue, userStats, recentOrders] = await Promise.all([
    getRevenueStats(user.orgId),
    getUserStats(user.orgId),
    getRecentOrders(user.orgId, { limit: 10 }),
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
2. **"use cache" replaces old caching** — add it to components or functions that should be cached; use `cacheLife()` to set TTL (`'seconds'`, `'minutes'`, `'hours'`, `'days'`, `'weeks'`, `'max'`)
3. **`cacheTag()` enables targeted revalidation** — tag cached data so mutations can invalidate specific slices
4. **`updateTag()` for instant invalidation** — purges the cache entry immediately; next request gets fresh data
5. **`revalidateTag(tag, 'max')` for SWR** — serves stale while regenerating in the background
6. **`refresh()` re-runs the current route** — useful after mutations that affect data not covered by cache tags
7. **Use `Promise.all` for parallel fetches** — never await sequentially when requests are independent
8. **Client-side fetching is the exception** — use SWR/React Query only for real-time polling or post-load user-driven data

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| `useEffect` + `fetch` in every component | Creates waterfalls, shows loading spinners, worse SEO | Fetch in Server Components |
| Sequential awaits for independent data | Doubles/triples load time | `Promise.all([fetchA(), fetchB()])` |
| Caching user-specific data without segmentation | Serves User A's data to User B | Use `cacheTag` with user/org ID, or skip caching for personalized data |
| `revalidateTag` without corresponding `cacheTag` | Nothing gets invalidated — the tag does not exist | Always pair `cacheTag('x')` in the data function with `revalidateTag('x')` in the action |
| `fetch()` with `{ cache: 'force-cache' }` | Next.js 16 removed implicit fetch caching; this is now a no-op | Use "use cache" directive with `cacheLife()` |
| Calling `updateTag` for non-critical updates | Unnecessarily purges cache, causing a cold request | Use `revalidateTag(tag, 'max')` for SWR-style background revalidation |
| `getStaticProps` / `getServerSideProps` | Pages Router APIs — do not exist in App Router | Async Server Components with "use cache" |
