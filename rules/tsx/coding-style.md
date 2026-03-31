---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
---

# TSX/React Coding Style

## Component Structure
- Server Components by default (no directive)
- "use client" ONLY for: useState, useEffect, event handlers, browser APIs
- Keep Client Components small — push data up to Server parents
- One component per file, named export matching filename

## Next.js 16 APIs
- `proxy.ts` NOT `middleware.ts` (deprecated)
- `await params`, `await searchParams` (async in Next.js 16)
- `await cookies()`, `await headers()` (async)
- `"use cache"` for caching (not implicit)
- `revalidateTag(tag, 'max')` requires cacheLife profile
- `updateTag(tag)` in Server Actions for instant refresh
- React Compiler handles memoization — NO manual useMemo/useCallback

## Styling
- Tailwind CSS classes preferred
- Use `cn()` utility for conditional classes (clsx + tailwind-merge)
- No inline styles except dynamic values
- Design tokens via Tailwind theme

## Forms
- Server Actions with "use server" for mutations
- useActionState for form state
- Zod validation server-side
- Progressive enhancement (works without JS)

## Error Handling
- error.tsx in routes with data fetching
- loading.tsx for suspense boundaries
- not-found.tsx for 404 handling
