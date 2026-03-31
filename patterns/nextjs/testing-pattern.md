# Testing Pattern

## When to Use

- Every Next.js 16 application that needs unit, integration, or end-to-end tests
- When testing Server Components (async), Client Components, Server Actions, and API routes
- When building a CI pipeline that validates correctness before deployment
- When TDD or test-first development is the team practice

**Do NOT** use Jest — Turbopack (Next.js 16's default bundler) has native Vitest integration via `next/vitest`. Jest requires additional configuration and does not support the same module transforms out of the box.

---

## Implementation

### Vitest Configuration with next/vitest

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { nextVitest } from 'next/vitest';

export default defineConfig({
  plugins: [nextVitest()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['app/**', 'lib/**', 'components/**'],
      exclude: ['**/*.test.*', '**/*.d.ts', '**/types/**'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

### Setup File

```ts
// vitest.setup.ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Automatic cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock next/navigation — commonly needed across tests
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));
```

### Testing a Server Component (Async)

```tsx
// app/blog/[slug]/page.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import BlogPostPage from './page';

// Mock the data layer
vi.mock('@/lib/data/posts', () => ({
  getPostBySlug: vi.fn(),
  getAllPostSlugs: vi.fn(),
}));

vi.mock('next/navigation', async (importOriginal) => {
  const mod = await importOriginal<typeof import('next/navigation')>();
  return { ...mod, notFound: vi.fn() };
});

import { getPostBySlug } from '@/lib/data/posts';
import { notFound } from 'next/navigation';

const mockPost = {
  title: 'Test Post',
  slug: 'test-post',
  excerpt: 'A test post excerpt',
  htmlContent: '<p>Hello world</p>',
  publishedAt: '2026-03-15T00:00:00Z',
};

describe('BlogPostPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders post content when found', async () => {
    vi.mocked(getPostBySlug).mockResolvedValue(mockPost);

    // Server Components are async — await the JSX
    const jsx = await BlogPostPage({ params: Promise.resolve({ slug: 'test-post' }) });
    render(jsx);

    expect(screen.getByText('Test Post')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(getPostBySlug).toHaveBeenCalledWith('test-post');
  });

  it('calls notFound when post does not exist', async () => {
    vi.mocked(getPostBySlug).mockResolvedValue(null);

    await BlogPostPage({ params: Promise.resolve({ slug: 'missing' }) });

    expect(notFound).toHaveBeenCalled();
  });
});
```

### Testing a Client Component

```tsx
// components/counter.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Counter } from './counter';

describe('Counter', () => {
  it('renders initial count', () => {
    render(<Counter initialCount={5} />);
    expect(screen.getByText('Count: 5')).toBeInTheDocument();
  });

  it('increments on click', async () => {
    const user = userEvent.setup();
    render(<Counter initialCount={0} />);

    await user.click(screen.getByRole('button', { name: 'Increment' }));

    expect(screen.getByText('Count: 1')).toBeInTheDocument();
  });

  it('disables decrement at zero', () => {
    render(<Counter initialCount={0} />);
    expect(screen.getByRole('button', { name: 'Decrement' })).toBeDisabled();
  });
});
```

### Testing a Server Action

```ts
// app/actions/contact.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitContact } from './contact';

vi.mock('@/lib/db', () => ({
  db: {
    contactMessage: {
      create: vi.fn(),
    },
  },
}));

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

import { db } from '@/lib/db';

function createFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  Object.entries(data).forEach(([k, v]) => fd.append(k, v));
  return fd;
}

describe('submitContact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns validation errors for invalid input', async () => {
    const result = await submitContact(
      {},
      createFormData({ name: '', email: 'not-an-email', message: 'short', category: 'general' }),
    );

    expect(result.errors).toBeDefined();
    expect(result.errors?.name).toBeDefined();
    expect(result.errors?.email).toBeDefined();
    expect(result.success).toBeUndefined();
  });

  it('creates record and returns success for valid input', async () => {
    vi.mocked(db.contactMessage.create).mockResolvedValue({} as never);

    const result = await submitContact(
      {},
      createFormData({
        name: 'Jane Doe',
        email: 'jane@example.com',
        message: 'This is a valid test message with enough length.',
        category: 'support',
      }),
    );

    expect(result.success).toBe(true);
    expect(db.contactMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Jane Doe',
        email: 'jane@example.com',
        category: 'support',
      }),
    });
  });

  it('returns form error on database failure', async () => {
    vi.mocked(db.contactMessage.create).mockRejectedValue(new Error('DB error'));

    const result = await submitContact(
      {},
      createFormData({
        name: 'Jane Doe',
        email: 'jane@example.com',
        message: 'This is a valid test message with enough length.',
        category: 'general',
      }),
    );

    expect(result.errors?._form).toContain('Failed to submit. Please try again.');
  });
});
```

### API Route Testing

```ts
// app/api/private/data/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
import { getSession } from '@/lib/auth/session';

describe('GET /api/private/data', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it('returns 200 when authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'user-1', email: 'test@test.com', role: 'user', expiresAt: Date.now() + 100000,
    });
    const response = await GET();
    expect(response.status).toBe(200);
  });
});
```

### Playwright E2E Tests

```ts
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication flow', () => {
  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?callbackUrl/);
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByLabel('Password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('wrong@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });
});
```

---

## Key Rules

1. **Use Vitest with `next/vitest` plugin** — Turbopack-native; handles path aliases, JSX, and Server Component transforms
2. **Server Components are async** — `await` the component function, then pass the result to `render()`
3. **Mock `next/navigation`, `next/cache`, and data modules** — Server Components import framework modules that do not exist in the test environment
4. **Test Server Actions as plain async functions** — pass `FormData` and assert the return value; no HTTP layer involved
5. **Use Playwright for E2E** — test the full flow including proxy.ts redirects, streaming, and progressive enhancement
6. **Separate test types in CI** — run Vitest (fast) on every push; run Playwright (slow) on PR merge or nightly

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| Using Jest with Next.js 16 | Missing Turbopack transforms; requires custom config for `"use client"`, `"use server"`, `"use cache"` | Use Vitest + `next/vitest` |
| Rendering Server Components synchronously | Server Components are `async` functions; `render()` receives a Promise, not JSX | `const jsx = await Page({ params }); render(jsx);` |
| Testing implementation details | Brittle tests that break on refactors | Test behavior: what the user sees and interactions |
| Skipping Server Action tests | Actions contain business logic, validation, and auth checks | Test actions as async functions with FormData |
| Mocking `fetch` globally | Pollutes test isolation; does not catch real integration issues | Mock at the data layer (`db`, `api client`), or use MSW for HTTP-level mocking |
| E2E tests for every edge case | Slow, flaky, expensive | E2E for critical paths; Vitest for edge cases |
| No coverage thresholds | Coverage silently degrades over time | Set thresholds in vitest.config.ts; enforce in CI |
