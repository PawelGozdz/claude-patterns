# Routing & Loading Pattern

## When to Use

- Every SvelteKit 2 application — file-based routing is the core navigation model
- When fetching data before a page renders (SSR or client-side navigation)
- When sharing layout data (auth, config) across nested routes
- When building dynamic routes with URL parameters
- When grouping routes without affecting the URL structure

**Do NOT** fetch data inside components with `$effect` + `fetch`. Use load functions — they run on both server and client, handle SSR correctly, and integrate with SvelteKit's invalidation system.

---

## Implementation

### Basic Route with Load Function

```
src/routes/
  +layout.svelte          # Root layout (nav, footer)
  +layout.ts              # Shared data for all routes
  +page.svelte            # Home page (/)
  +error.svelte           # Root error boundary
  products/
    +page.svelte          # /products
    +page.ts              # Load function for /products
    [slug]/
      +page.svelte        # /products/:slug
      +page.server.ts     # Server-only load (DB access)
    [[category]]/
      +page.svelte        # /products or /products/:category (optional param)
  blog/
    [...path]/
      +page.svelte        # /blog/* (catch-all)
      +page.ts
  (marketing)/
    about/+page.svelte    # /about (grouped, no /marketing in URL)
    pricing/+page.svelte  # /pricing
```

### Universal Load Function (+page.ts)

```typescript
// src/routes/products/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
  const page = Number(url.searchParams.get('page')) || 1;
  const limit = 20;

  // SvelteKit's `fetch` handles relative URLs, cookies, and SSR
  const response = await fetch(`/api/products?page=${page}&limit=${limit}`);

  if (!response.ok) {
    throw new Error('Failed to load products');
  }

  const { products, total } = await response.json();

  return {
    products,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
};
```

### Page Component Consuming Load Data

```svelte
<!-- src/routes/products/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types';
  import ProductCard from '$lib/components/ProductCard.svelte';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Products - Page {data.page}</title>
</svelte:head>

<main class="max-w-7xl mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold text-gray-900 mb-8">Products</h1>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    {#each data.products as product (product.id)}
      <ProductCard {product} />
    {/each}
  </div>

  <nav class="mt-8 flex justify-center gap-2">
    {#each Array(data.totalPages) as _, i}
      <a
        href="/products?page={i + 1}"
        class="px-4 py-2 rounded {i + 1 === data.page
          ? 'bg-blue-600 text-white'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}"
      >
        {i + 1}
      </a>
    {/each}
  </nav>
</main>
```

### Server-Only Load (+page.server.ts) with Dynamic Route

```typescript
// src/routes/products/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export const load: PageServerLoad = async ({ params }) => {
  const product = await db.product.findUnique({
    where: { slug: params.slug },
    include: { reviews: true, category: true },
  });

  if (!product) {
    error(404, { message: 'Product not found' });
  }

  return {
    product,
  };
};
```

### Layout with Shared Data

```typescript
// src/routes/+layout.ts
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch }) => {
  const response = await fetch('/api/auth/session');
  const session = await response.json();

  return {
    user: session.user ?? null,
  };
};
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import type { LayoutData } from './$types';
  import Nav from '$lib/components/Nav.svelte';

  let { data, children }: { data: LayoutData; children: any } = $props();
</script>

<div class="min-h-screen flex flex-col">
  <Nav user={data.user} />

  <main class="flex-1">
    {@render children()}
  </main>

  <footer class="bg-gray-100 py-6 text-center text-sm text-gray-500">
    &copy; 2026 My App
  </footer>
</div>
```

### Error Page

```svelte
<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
</script>

<div class="min-h-screen flex items-center justify-center">
  <div class="text-center">
    <h1 class="text-6xl font-bold text-gray-900">{$page.status}</h1>
    <p class="mt-4 text-xl text-gray-600">{$page.error?.message ?? 'Something went wrong'}</p>
    <a href="/" class="mt-8 inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
      Go Home
    </a>
  </div>
</div>
```

### Catch-All Route

```typescript
// src/routes/blog/[...path]/+page.ts
import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params, fetch }) => {
  // params.path = "2026/03/my-post" for /blog/2026/03/my-post
  const response = await fetch(`/api/blog/${params.path}`);

  if (!response.ok) {
    error(404, { message: 'Blog post not found' });
  }

  return {
    post: await response.json(),
  };
};
```

---

## Key Rules

1. **+page.ts runs on server AND client** — during SSR it runs on the server, during client-side navigation it runs in the browser. Never access `process.env`, DB, or file system here.
2. **+page.server.ts runs on the server ONLY** — use for DB queries, API keys, secrets, file system access. Data is serialized to the client automatically.
3. **Always use SvelteKit's `fetch`** from the load function argument — it handles cookies, relative URLs, and SSR correctly. Never import `fetch` or use `globalThis.fetch`.
4. **Use `error()` helper** to throw typed errors that `+error.svelte` catches. Do not throw raw Error objects.
5. **Layout data cascades** — child routes access parent layout data through their `data` prop. No need to re-fetch.
6. **Route groups `(name)`** organize files without affecting URLs — use for auth gates, marketing sections, or layout variants.
7. **`$props()`** to receive `data` in Svelte 5 — not `export let data`.

---

## Anti-Patterns

```svelte
<!-- WRONG: Fetching in component with $effect -->
<script lang="ts">
  let products = $state([]);
  $effect(() => {
    fetch('/api/products').then(r => r.json()).then(d => products = d);
  });
</script>

<!-- RIGHT: Use +page.ts load function, receive via $props -->
<script lang="ts">
  let { data } = $props();
  // data.products is already loaded, SSR'd, and type-safe
</script>
```

```typescript
// WRONG: Using process.env in +page.ts (runs on client too!)
export const load: PageLoad = async () => {
  const res = await fetch(process.env.SECRET_API_URL);
};

// RIGHT: Use +page.server.ts for secrets
export const load: PageServerLoad = async () => {
  const res = await fetch(env.SECRET_API_URL); // import { env } from '$env/dynamic/private'
};
```

```svelte
<!-- WRONG (Svelte 4): export let data -->
<script lang="ts">
  export let data: PageData;
</script>

<!-- RIGHT (Svelte 5): $props() -->
<script lang="ts">
  let { data }: { data: PageData } = $props();
</script>
```
