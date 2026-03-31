## Agent Ecosystem

**Global agents** (auto-discovered via `~/.claude/agents/`):

| Role | Agent | Model |
|------|-------|-------|
| Advisory | backend-technology-expert | Opus |
| Advisory | security-privacy-architect | Opus |
| Advisory | technical-architecture-lead | Opus |

**Stack agents** (auto-linked via `setup-project.sh`):

| Role | Agent | Model |
|------|-------|-------|
| Advisory | nextjs-architecture-expert | Sonnet |
| Verification | nextjs-quality-verifier (VETO) | Sonnet |

**Built-in**: Explore agent (Haiku) — cost-efficient file discovery.

**Cost targets**:

| Model | Target |
|-------|--------|
| Opus | %%COST_OPUS%% |
| Sonnet | %%COST_SONNET%% |
| Haiku | %%COST_HAIKU%% |

---

## Next.js 16 Architecture

### Server vs Client Components

```
Server Component (DEFAULT — no directive)
├── Data fetching (async component)
├── Database queries
├── API calls
└── Static rendering

"use client" (OPT-IN — only when needed)
├── useState, useEffect
├── Event handlers (onClick, onChange)
├── Browser APIs (window, localStorage)
└── Third-party client libraries
```

### Cache Components

```typescript
// Page-level caching
"use cache"
export default async function Page() {
  cacheLife('hours')
  cacheTag('products')
  const products = await db.products.findMany()
  return <ProductList products={products} />
}

// Invalidation in Server Action
"use server"
export async function updateProduct(id: string, data: FormData) {
  await db.products.update(id, data)
  updateTag('products')  // instant refresh
}
```

### proxy.ts (replaces middleware.ts)

```typescript
// proxy.ts — network boundary (auth, redirects, i18n)
export default function proxy(request: NextRequest) {
  const token = request.cookies.get('session')
  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
}
```

---

## Key Architecture Rules

1. **Server Components are DEFAULT** — "use client" only for interactivity
2. **"use cache"** for caching — explicit, opt-in, with cacheLife/cacheTag
3. **proxy.ts** for network concerns — NOT middleware.ts (deprecated)
4. **Async APIs** — `await params`, `await cookies()`, `await headers()`
5. **Server Actions** for mutations — not API routes
6. **No manual memoization** — React Compiler handles useMemo/useCallback
7. **Vitest** for testing — not Jest (Turbopack compatibility)

---

## Patterns Library

**Location**: `.claude/knowledge/patterns/` (symlinked from claude-patterns)

| Pattern | Purpose |
|---------|---------|
| `server-client-components-pattern.md` | Component boundaries |
| `data-fetching-pattern.md` | Caching, revalidation |
| `routing-proxy-pattern.md` | Routes, proxy.ts |
| `forms-actions-pattern.md` | Server Actions, validation |
| `auth-pattern.md` | Authentication |
| `testing-pattern.md` | Vitest, Playwright |
| `styling-pattern.md` | Tailwind, View Transitions |

---

## Testing Strategy

| Type | Coverage | What to Test |
|------|----------|-------------|
| **Unit** | ~40% | Server Components, utilities, helpers |
| **Component** | ~40% | Client Components, forms, interactions |
| **E2E** | ~20% | Critical flows (auth, checkout, navigation) |

Framework: **Vitest** + React Testing Library + Playwright
