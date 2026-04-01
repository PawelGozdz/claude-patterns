# Testing Pattern

## When to Use

- Every SvelteKit 2 application — testing is split across three layers
- **Vitest** for unit tests: utilities, load functions, form actions, server logic
- **@testing-library/svelte** for component tests: render, interact, assert DOM
- **Playwright** for E2E tests: full browser flows, form submissions, navigation

**Do NOT** test implementation details (internal `$state` values). Test behavior — what the user sees and does. Do NOT test SvelteKit framework behavior (routing, SSR) — test YOUR code.

---

## Implementation

### Project Setup

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    alias: { $lib: '/src/lib' },
  },
});
```

```typescript
// playwright.config.ts
import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  webServer: { command: 'npm run build && npm run preview', port: 4173 },
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173' },
};
export default config;
```

### Component Test with @testing-library/svelte

```typescript
// src/lib/components/Counter.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Counter from './Counter.svelte';

describe('Counter', () => {
  it('renders with initial count of 0', () => {
    render(Counter);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('increments when + button is clicked', async () => {
    const user = userEvent.setup();
    render(Counter);
    await user.click(screen.getByRole('button', { name: '+' }));
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('decrements when - button is clicked', async () => {
    const user = userEvent.setup();
    render(Counter);
    await user.click(screen.getByRole('button', { name: '-' }));
    expect(screen.getByText('-1')).toBeInTheDocument();
  });
});
```

### Testing Components with Props (Test Wrapper for Snippets)

```svelte
<!-- src/lib/components/CardTestWrapper.test.svelte -->
<script lang="ts">
  import Card from './Card.svelte';
  let { variant = 'default' }: { variant?: 'default' | 'elevated' | 'outlined' } = $props();
</script>

<div data-testid="card">
  <Card title="Test Card" {variant}>
    <p>Test content</p>
  </Card>
</div>
```

```typescript
// src/lib/components/Card.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CardTestWrapper from './CardTestWrapper.test.svelte';

describe('Card', () => {
  it('renders title and content', () => {
    render(CardTestWrapper);
    expect(screen.getByText('Test Card')).toBeInTheDocument();
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('applies elevated variant classes', () => {
    render(CardTestWrapper, { props: { variant: 'elevated' } });
    expect(screen.getByTestId('card').innerHTML).toContain('shadow-lg');
  });
});
```

### Testing Load Functions

```typescript
// src/routes/products/page.server.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load } from './+page.server';

vi.mock('$lib/server/db', () => ({
  db: { product: { findMany: vi.fn() } },
}));
import { db } from '$lib/server/db';

describe('+page.server.ts load', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns products for authenticated user', async () => {
    const mockProducts = [{ id: '1', name: 'Widget', price: 29.99 }];
    vi.mocked(db.product.findMany).mockResolvedValue(mockProducts);

    const result = await load({
      locals: { user: { id: 'user-1' } },
      depends: vi.fn(),
    } as any);

    expect(result.products).toEqual(mockProducts);
  });

  it('throws 401 for unauthenticated user', async () => {
    await expect(
      load({ locals: { user: null }, depends: vi.fn() } as any),
    ).rejects.toMatchObject({ status: 401 });
  });
});
```

### Testing Form Actions

```typescript
// src/routes/products/[slug]/actions.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { actions } from './+page.server';

vi.mock('$lib/server/db', () => ({ db: { review: { create: vi.fn() } } }));
import { db } from '$lib/server/db';

function mockRequest(data: Record<string, string>): Request {
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => fd.append(k, v));
  return { formData: () => Promise.resolve(fd) } as unknown as Request;
}

describe('addReview action', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates review with valid data', async () => {
    vi.mocked(db.review.create).mockResolvedValue({ id: 'r1' } as any);

    const result = await actions.addReview({
      request: mockRequest({ rating: '5', body: 'This product is excellent!' }),
      params: { slug: 'widget' },
      locals: { user: { id: 'user-1' } },
    } as any);

    expect(result).toEqual({ success: true });
    expect(db.review.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ productSlug: 'widget', rating: 5 }),
    });
  });

  it('returns validation error for short review', async () => {
    const result = await actions.addReview({
      request: mockRequest({ rating: '5', body: 'Short' }),
      params: { slug: 'widget' },
      locals: { user: { id: 'user-1' } },
    } as any);

    expect(result?.status).toBe(400);
    expect(result?.data?.error).toContain('at least 10 characters');
  });
});
```

### E2E Tests with Playwright

```typescript
// e2e/products.test.ts
import { test, expect } from '@playwright/test';

test.describe('Products', () => {
  test('displays product list and navigates to detail', async ({ page }) => {
    await page.goto('/products');
    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();

    await page.getByTestId('product-card').first().click();
    await expect(page).toHaveURL(/\/products\/.+/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('submits a review via form action', async ({ page }) => {
    await page.goto('/products/widget');
    await page.getByLabel('Rating').selectOption('5');
    await page.getByLabel('Review').fill('This is an excellent product that I recommend!');
    await page.getByRole('button', { name: 'Submit Review' }).click();
    await expect(page.getByText('Review submitted!')).toBeVisible();
  });

  test('shows validation error for invalid review', async ({ page }) => {
    await page.goto('/products/widget');
    await page.getByRole('button', { name: 'Submit Review' }).click();
    await expect(page.getByText('at least 10 characters')).toBeVisible();
  });
});

test('404 page for non-existent route', async ({ page }) => {
  const response = await page.goto('/this-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('404')).toBeVisible();
});
```

### Mock Data Factory

```typescript
// src/tests/factories.ts
let counter = 0;

export function createProduct(overrides: Partial<Product> = {}) {
  counter++;
  return {
    id: `product-${counter}`,
    name: `Product ${counter}`,
    slug: `product-${counter}`,
    price: 29.99,
    description: 'A test product',
    createdAt: new Date(),
    ...overrides,
  };
}
```

---

## Key Rules

1. **Test behavior, not implementation** — assert what the user sees (text, roles), not internal `$state` or CSS.
2. **Use `userEvent` over `fireEvent`** — `userEvent.setup()` simulates real interaction (focus, type, click).
3. **Mock at module boundaries** — mock `$lib/server/db`, external APIs. Never mock Svelte runes.
4. **Test load functions as plain async functions** — pass mock arguments, assert returned data.
5. **Test form actions with FormData** — construct mock `Request` objects to test validation and mutation.
6. **E2E for critical user journeys** — login, submission, navigation. Keep tests focused and independent.
7. **Use `.test.svelte` wrappers** for components that require snippet props.

---

## Anti-Patterns

```typescript
// WRONG: Testing internal $state values
const { component } = render(Counter);
expect(component.count).toBe(1); // Don't access internals

// RIGHT: Test visible output
await user.click(screen.getByRole('button', { name: '+' }));
expect(screen.getByText('1')).toBeInTheDocument();
```

```typescript
// WRONG: Sharing mutable state between tests
let sharedUser: User;
beforeAll(() => { sharedUser = createUser(); });

// RIGHT: Each test creates its own data
it('test one', () => { const user = createUser({ name: 'Alice' }); });
it('test two', () => { const user = createUser({ name: 'Bob' }); });
```
