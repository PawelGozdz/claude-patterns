# Data Fetching & Mutations Pattern

## When to Use

- Fetching data for page rendering — always use load functions, not in-component fetching
- Handling form submissions and data mutations with form actions
- When data needs revalidation after a mutation
- When streaming slow data alongside fast data
- When using progressive enhancement for forms that work without JavaScript

**Do NOT** use API routes (`+server.ts`) for data a page needs — use load functions. Do NOT call load functions manually — SvelteKit manages their lifecycle.

---

## Implementation

### Server Load with Database Access

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals, depends }) => {
  if (!locals.user) error(401, { message: 'Unauthorized' });

  // Custom dependency key for targeted invalidation
  depends('app:dashboard');

  const [orders, stats] = await Promise.all([
    db.order.findMany({
      where: { userId: locals.user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.$queryRaw<[{ revenue: number; count: number }]>`
      SELECT SUM(total) as revenue, COUNT(*) as count
      FROM orders WHERE user_id = ${locals.user.id}
    `,
  ]);

  return { orders, revenue: stats[0]?.revenue ?? 0, orderCount: stats[0]?.count ?? 0 };
};
```

### Streaming with Promises in Load

```typescript
// src/routes/analytics/+page.server.ts
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  // Fast query — awaited, included in initial SSR
  const summary = await db.analytics.getSummary(locals.user.id);

  // Slow queries — NOT awaited, streamed to client after initial render
  const chartData = db.analytics.getChartData(locals.user.id, { days: 90 });

  return { summary, chartData };
};
```

```svelte
<!-- src/routes/analytics/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<!-- Renders immediately — summary was awaited -->
<p class="text-2xl font-bold">{data.summary.pageViews.toLocaleString()} views</p>

<!-- Streams in — shows skeleton until resolved -->
{#await data.chartData}
  <div class="h-64 bg-gray-100 rounded animate-pulse"></div>
{:then chartData}
  <Chart data={chartData} />
{:catch error}
  <div class="text-red-500">Failed to load: {error.message}</div>
{/await}
```

### Form Actions for Mutations

```typescript
// src/routes/products/[slug]/+page.server.ts
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { z } from 'zod';

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().min(10, 'Review must be at least 10 characters').max(1000),
});

export const load: PageServerLoad = async ({ params }) => {
  const product = await db.product.findUnique({
    where: { slug: params.slug },
    include: { reviews: { orderBy: { createdAt: 'desc' }, take: 20 } },
  });
  if (!product) throw redirect(302, '/products');
  return { product };
};

export const actions: Actions = {
  addReview: async ({ request, params, locals }) => {
    if (!locals.user) return fail(401, { error: 'You must be logged in' });

    const formData = await request.formData();
    const parsed = reviewSchema.safeParse({
      rating: formData.get('rating'),
      body: formData.get('body'),
    });

    if (!parsed.success) {
      return fail(400, {
        error: parsed.error.errors[0].message,
        values: { rating: String(formData.get('rating')), body: String(formData.get('body')) },
      });
    }

    await db.review.create({
      data: { productSlug: params.slug, userId: locals.user.id, ...parsed.data },
    });

    return { success: true }; // Load functions re-run automatically after action
  },

  deleteReview: async ({ request, locals }) => {
    if (!locals.user) return fail(401);
    const formData = await request.formData();
    await db.review.delete({ where: { id: String(formData.get('reviewId')), userId: locals.user.id } });
    return { success: true };
  },
};
```

### Progressive Enhancement with use:enhance

```svelte
<!-- src/routes/products/[slug]/+page.svelte -->
<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { enhance } from '$app/forms';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let submitting = $state(false);
</script>

<form
  method="POST"
  action="?/addReview"
  use:enhance={() => {
    submitting = true;
    return async ({ update, result }) => {
      submitting = false;
      await update({ reset: result.type === 'success' });
    };
  }}
  class="space-y-4 bg-gray-50 p-6 rounded-lg"
>
  {#if form?.error}
    <div class="bg-red-50 text-red-700 px-4 py-2 rounded">{form.error}</div>
  {/if}
  {#if form?.success}
    <div class="bg-green-50 text-green-700 px-4 py-2 rounded">Review submitted!</div>
  {/if}

  <select name="rating" class="border rounded px-3 py-2">
    {#each [5, 4, 3, 2, 1] as n}<option value={n}>{n} star{n > 1 ? 's' : ''}</option>{/each}
  </select>

  <textarea name="body" rows="4" class="w-full border rounded px-3 py-2"
    value={form?.values?.body ?? ''}></textarea>

  <button type="submit" disabled={submitting}
    class="px-6 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
    {submitting ? 'Submitting...' : 'Submit Review'}
  </button>
</form>

<!-- Delete uses use:enhance for SPA-like behavior -->
{#each data.product.reviews as review (review.id)}
  <div class="border rounded-lg p-4">
    <p>{review.body}</p>
    <form method="POST" action="?/deleteReview" use:enhance>
      <input type="hidden" name="reviewId" value={review.id} />
      <button type="submit" class="text-sm text-red-500">Delete</button>
    </form>
  </div>
{/each}
```

### Invalidation and Revalidation

```svelte
<script lang="ts">
  import { invalidate, invalidateAll } from '$app/navigation';

  // Targeted: only re-run loads that called depends('app:dashboard')
  async function refreshDashboard() { await invalidate('app:dashboard'); }

  // Re-run any load that fetched this URL
  async function refreshProducts() { await invalidate('/api/products'); }

  // Nuclear: re-run ALL load functions for current page
  async function refreshAll() { await invalidateAll(); }
</script>
```

---

## Key Rules

1. **Load functions return data, actions mutate data** — never mutate in load or fetch in actions. After an action, load functions re-run automatically.
2. **`fail()` preserves form state** — return `fail(status, data)` to send validation errors without losing user input.
3. **`use:enhance` is opt-in** — without it, forms do full page reloads. With it, SvelteKit intercepts and updates reactively.
4. **Streaming requires `+page.server.ts`** — return un-awaited promises from server loads. Use `{#await}` in templates.
5. **`depends()` enables targeted invalidation** — call in load, then `invalidate('key')` to selectively refresh.
6. **Actions only in `+page.server.ts`** — always server-side. Use named actions (`?/name`) for multiple forms per page.

---

## Anti-Patterns

```svelte
<!-- WRONG: Fetching data inside component with $effect -->
<script lang="ts">
  let data = $state(null);
  $effect(() => { fetch('/api/dashboard').then(r => r.json()).then(d => data = d); });
</script>
<!-- RIGHT: Use load functions — SSR works, data is typed, invalidation works -->
```

```typescript
// WRONG: Mutating data in a load function
export const load = async () => { await db.analytics.recordVisit(); /* side effect! */ };
// RIGHT: Load = reading. Use form actions or +server.ts for mutations.
```

```svelte
<!-- WRONG: Form without use:enhance (full page reload every submit) -->
<form method="POST" action="?/submit">...</form>
<!-- RIGHT: Progressive enhancement -->
<form method="POST" action="?/submit" use:enhance>...</form>
```
