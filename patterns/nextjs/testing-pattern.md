# Testing Pattern

**Tags**: "web:tests", "web:platform:nextjs"
**Layer**: Testing
**Level**: core
**Status**: production

## When to Use

**Use this pattern for:**
- ✅ Every Next.js 16 application that needs unit, integration, or end-to-end tests
- ✅ Unit-testing synchronous Server and Client Components, Server Actions, Route Handlers and DAL functions; E2E for async Server Components
- ✅ A CI pipeline that validates correctness before deployment
- ✅ TDD or test-first development as the team practice

**Do NOT use for:**
- ❌ A different runner without a reason — Jest is also supported by Next.js; this pattern standardizes on Vitest as a team preference (config below follows the official Next.js Vitest guide)
- ❌ Designing the Server Action or Route Handler itself — see `forms-actions-pattern.md` and `route-handlers-pattern.md`
- ❌ Deciding what to authorize — rules live in `auth-boundaries-pattern.md`; this pattern only shows how to test them

---

## Implementation

### Vitest Configuration

Install: `npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom vite-tsconfig-paths`
and add `"test": "vitest"` to `package.json` scripts.

```ts
// vitest.config.mts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    // Team additions on top of the official setup:
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: { statements: 80, branches: 75, functions: 80, lines: 80 },
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

### Testing a Server Component

Vitest does not support **async** Server Components. Unit-test only synchronous Server and
Client Components; for an async page (`await params`, data fetching) move the logic into a DAL
function or helper and unit-test that, and cover the rendered page with E2E (Playwright, below).

```tsx
// components/post-article.test.tsx — synchronous Server Component, data passed as props
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PostArticle } from './post-article';

describe('PostArticle', () => {
  it('renders title and content', () => {
    render(<PostArticle title="Test Post" htmlContent="<p>Hello world</p>" />);

    expect(screen.getByText('Test Post')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });
});
```

```ts
// data/posts.test.ts — the logic behind the async page, tested as a plain function
import { describe, it, expect, vi } from 'vitest';
import { getPostOrNull } from './posts';
// ...mock the persistence boundary, assert the mapping / not-found behaviour
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

// Mock the DAL module, not the database client: the action's contract is "call the DAL
// with validated data", and the DAL has its own tests.
vi.mock('@/data/contact', () => ({
  createContactMessage: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

import { createContactMessage } from '@/data/contact';

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
    vi.mocked(createContactMessage).mockResolvedValue(undefined);

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
    expect(createContactMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Jane Doe',
        email: 'jane@example.com',
        category: 'support',
      }),
    );
  });

  it('returns form error when the DAL fails', async () => {
    vi.mocked(createContactMessage).mockRejectedValue(new Error('DB error'));

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

Authorization lives in the DAL (`auth-boundaries-pattern.md`), so give it its own tests: the
unauthenticated case and the wrong-owner case each need a test, at the DAL level (real
authorization logic, test database or fake) and at the action level (the action surfaces the
rejection without leaking a row).

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

1. **Use Vitest with `@vitejs/plugin-react` and `vite-tsconfig-paths`** — the setup from the official Next.js Vitest guide; path aliases and JSX work without extra transforms
2. **Vitest does not support async Server Components** — unit-test synchronous Server and Client Components only; move logic of async components into DAL functions/helpers tested as plain functions, and cover async rendering with E2E
3. **Mock `next/navigation`, `next/cache`, and data modules** — Server Components import framework modules that do not exist in the test environment
4. **Test Server Actions as plain async functions** — pass `FormData`, mock the DAL module (`vi.mock('@/data/contact')`), and assert the return value; no HTTP layer involved
5. **Test authorization paths separately** — unauthenticated and wrong-owner cases deserve their own tests; a happy-path test proves nothing about who may call
6. **Use Playwright for E2E** — test the full flow including proxy.ts redirects, streaming, and progressive enhancement
7. **Separate test types in CI** — run Vitest (fast) on every push; run Playwright (slow) on PR merge or nightly

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| Mixing Jest and Vitest in one repo | Two runners, two configs, duplicated setup | Pick one per repo; this pattern standardizes on Vitest (team preference) |
| Unit-testing an async Server Component with Vitest | Vitest does not support async Server Components; `await Page(...)` hacks are unsupported | Extract logic to DAL/helpers (unit tests); render the async page in Playwright E2E |
| Testing implementation details | Brittle tests that break on refactors | Test behavior: what the user sees and interactions |
| Skipping Server Action tests | Actions contain business logic, validation, and auth checks | Test actions as async functions with FormData |
| Mocking `fetch` globally | Pollutes test isolation; does not catch real integration issues | Mock at the DAL module (`@/data/*`) or API client, or use MSW for HTTP-level mocking |
| E2E tests for every edge case | Slow, flaky, expensive | E2E for critical paths; Vitest for edge cases |
| No coverage thresholds | Coverage silently degrades over time | Set thresholds in vitest.config.ts; enforce in CI |
