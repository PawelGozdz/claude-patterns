# Server & Client Components Pattern

**Tags**: "web:ui", "web:platform:nextjs"
**Layer**: Cross-Layer
**Level**: core
**Status**: production

> ORM-neutral: data comes from named functions of a server-only Data Access Layer (`@/data/…`)
> that return plain DTOs. What is inside them (Kysely, Drizzle, SQL client… — any data layer) is
> your choice. For per-user data, the session check lives inside the DAL function — see
> `auth-boundaries-pattern.md`.

## When to Use

**Use this pattern for:**
- ✅ Every Next.js 16 page and feature — Server Components are the **default**
- ✅ Adding "use client" **only** where a component needs: `useState`, `useEffect`, event handlers (`onClick`, `onChange`), browser APIs (`window`, `localStorage`), or third-party client libraries
- ✅ Adding "use cache" when a Server Component's output should be cached across requests
- ✅ Composing interactive islands inside server-rendered pages

**Do NOT use for:**
- ❌ Components that only render data — no "use client"; keep them Server Components
- ❌ "use server" on Server Components — it marks Server Actions only; components already run on the server
- ❌ Deciding what a Client Component may receive about a user — pass DTOs, see `auth-boundaries-pattern.md`

---

## Implementation

### Server Component (Default — No Directive)

```tsx
// app/products/[id]/page.tsx
// Server Component — runs ONLY on the server, zero JS sent to browser
import { notFound } from 'next/navigation';
import { getProductWithReviews } from '@/data/products';
import { AddToCartButton } from './add-to-cart-button';
import { ProductGallery } from './product-gallery';

// data/products.ts (server-only DAL; body is any data layer — Kysely, Drizzle, SQL client…)
//   export type ProductPageDto = {
//     id: string; name: string; description: string; price: number;
//     imageUrls: string[];
//     reviews: { author: string; body: string; rating: number }[];
//   };
//   export async function getProductWithReviews(id: string): Promise<ProductPageDto | null>

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductPage({ params }: PageProps) {
  // Next.js 16: params is async
  const { id } = await params;

  const product = await getProductWithReviews(id);

  if (!product) notFound();

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold">{product.name}</h1>
      <p className="text-gray-600 mt-2">{product.description}</p>
      <span className="text-2xl font-semibold">${product.price}</span>

      {/* Client Component — receives serializable props from server */}
      <ProductGallery images={product.imageUrls} />

      {/* Client Component — needs onClick handler */}
      <AddToCartButton productId={product.id} />

      {/* Server Component — no directive needed */}
      <ReviewList reviews={product.reviews} />
    </main>
  );
}

function ReviewList({ reviews }: { reviews: { author: string; body: string; rating: number }[] }) {
  return (
    <section className="mt-8 space-y-4">
      <h2 className="text-xl font-semibold">Reviews ({reviews.length})</h2>
      {reviews.map((review, i) => (
        <div key={i} className="border rounded-lg p-4">
          <p className="font-medium">{review.author}</p>
          <p className="text-yellow-500">{'★'.repeat(review.rating)}</p>
          <p>{review.body}</p>
        </div>
      ))}
    </section>
  );
}
```

### Client Component ("use client" Directive)

```tsx
// app/products/[id]/add-to-cart-button.tsx
'use client';

import { useState, useTransition } from 'react';
import { addToCart } from '@/app/actions/cart';

interface AddToCartButtonProps {
  productId: string;
}

export function AddToCartButton({ productId }: AddToCartButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);

  function handleClick() {
    startTransition(async () => {
      await addToCart(productId);
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg disabled:opacity-50"
    >
      {isPending ? 'Adding...' : added ? 'Added!' : 'Add to Cart'}
    </button>
  );
}
```

### Client Component with Browser API

```tsx
// app/products/[id]/product-gallery.tsx
'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface ProductGalleryProps {
  images: string[];
}

export function ProductGallery({ images }: ProductGalleryProps) {
  const [selected, setSelected] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Browser API — requires "use client"
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsFullscreen(false);
      if (e.key === 'ArrowRight') setSelected((s) => Math.min(s + 1, images.length - 1));
      if (e.key === 'ArrowLeft') setSelected((s) => Math.max(s - 1, 0));
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length]);

  return (
    <div className="mt-6">
      <Image
        src={images[selected]}
        alt="Product"
        width={600}
        height={400}
        className="rounded-lg cursor-pointer"
        onClick={() => setIsFullscreen(true)}
      />
      <div className="flex gap-2 mt-3">
        {images.map((src, i) => (
          <button key={i} onClick={() => setSelected(i)}>
            <Image
              src={src}
              alt={`Thumbnail ${i + 1}`}
              width={80}
              height={80}
              className={`rounded border-2 ${i === selected ? 'border-blue-600' : 'border-transparent'}`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Cache Component ("use cache" Directive)

```tsx
// app/components/featured-products.tsx
'use cache';

import { cacheLife } from 'next/cache';
import { getFeaturedProducts } from '@/data/products'; // (limit: number) => Promise<ProductCardDto[]>

// Cached Server Component — output is cached and reused across requests
export async function FeaturedProducts() {
  // Cache this component's output for 1 hour
  cacheLife('hours');

  const products = await getFeaturedProducts({ limit: 8 });

  return (
    <section className="grid grid-cols-4 gap-6">
      {products.map((product) => (
        <a key={product.id} href={`/products/${product.id}`} className="group">
          <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
          </div>
          <h3 className="mt-2 font-medium">{product.name}</h3>
          <p className="text-gray-600">${product.price}</p>
        </a>
      ))}
    </section>
  );
}
```

### Composition Pattern: Server Wrapping Client

```tsx
// app/dashboard/page.tsx
import { getDashboardStats, getRecentActivity } from '@/data/dashboard';
// Both DAL functions call verifySession() themselves and return DTOs for the current user
// (auth-boundaries-pattern.md); the page never passes a client-supplied user id.
import { DashboardCharts } from './dashboard-charts'; // Client Component
import { ActivityFeed } from './activity-feed';         // Server Component

export default async function DashboardPage() {
  // Fetch data on the server — no waterfalls, no loading spinners
  const [stats, recentActivity] = await Promise.all([
    getDashboardStats(),
    getRecentActivity({ limit: 20 }),
  ]);

  return (
    <div className="grid grid-cols-3 gap-6 p-6">
      {/* Server data passed as serializable props to Client Component */}
      <div className="col-span-2">
        <DashboardCharts
          revenue={stats.revenueByMonth}
          users={stats.usersByMonth}
        />
      </div>

      {/* Pure Server Component — no JS shipped */}
      <aside>
        <ActivityFeed activities={recentActivity} />
      </aside>
    </div>
  );
}
```

---

## Key Rules

1. **Server Components are the default** — never add "use server" to a page or component
2. **"use client" is a boundary** — every module imported by a Client Component becomes client code; keep the boundary as low as possible in the tree
3. **Props across the boundary must be serializable** — no functions, Dates, Maps, or class instances; convert to plain objects/strings before passing
4. **Pass DTOs, not whole rows** — whatever crosses into a Client Component ships to the browser; for per-user data see `auth-boundaries-pattern.md`
5. **"use cache" replaces old implicit caching** — opt in explicitly; use `cacheLife()` to control TTL
6. **async/await is valid in Server Components** — use it directly; no `useEffect` + `useState` fetch pattern
7. **Params and searchParams are async in Next.js 16** — always `await params`, never destructure synchronously
8. **React Compiler handles memoization** — do not manually wrap with `useMemo`/`useCallback` unless profiling proves it necessary

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| `"use client"` on every component | Ships unnecessary JS to browser, kills performance | Default to Server Components; add "use client" only when needed |
| Fetching data in Client Components via `useEffect` | Creates waterfalls, shows loading spinners, duplicates logic | Fetch in Server Components, pass data as props |
| Passing non-serializable props across boundary | Runtime error — functions/classes cannot cross server-client boundary | Pass plain objects; use Server Actions for mutations |
| `"use server"` on a component file | "use server" is for Server Actions only, not components | Remove the directive — components are server by default |
| Manual `useMemo`/`useCallback` everywhere | React Compiler auto-memoizes; manual wrappers add noise | Let the compiler optimize; profile before manual memos |
| `getStaticProps` / `getServerSideProps` | Removed in App Router; these are Pages Router APIs | Use async Server Components with "use cache" |
| Synchronous `params` destructuring | Next.js 16 params are async Promises | Always `const { id } = await params` |
