# Auth Boundaries Pattern

**Tags**: "web:auth", "web:authz", "web:platform:nextjs"
**Layer**: Cross-Layer
**Level**: core
**Status**: production

> Verified against nextjs.org/docs (Authentication, Data Security guides) for Next.js 16.4, 2026-10.
> Library-agnostic: it says WHERE to check identity and permissions, not WHICH auth library
> produces the session. For a hand-rolled session (no library) see `auth-pattern.md`.

## What This Is

Next.js has many entry points to the same data: Server Components, Server Actions, Route
Handlers, `proxy.ts`, and layouts that do not re-render on navigation. A check placed at one
entry point does not protect the others. This pattern fixes ONE rule: **the security check lives
next to the data, in a server-only Data Access Layer (DAL)**, and every other layer only
re-uses it. `proxy.ts` is an optimistic pre-filter, never the boundary.

## When to Use

**Use this pattern for:**
- ✅ Any Next.js App Router app with logged-in users, whatever the auth library (Better Auth,
  Auth.js, Clerk, a hand-rolled cookie session…)
- ✅ Deciding where a permission check goes: page, layout, Server Action, Route Handler or `proxy.ts`
- ✅ Reviewing an app for IDOR: an action or handler that takes an `id` from the client
- ✅ Shaping what reaches Client Components (DTOs instead of whole database rows)

**Do NOT use for:**
- ❌ Choosing or configuring the auth library itself — follow that library's Next.js integration
  guide; this pattern only governs where its session is verified
- ❌ Custom JWT session code (`jose`, password hashing) — that is `auth-pattern.md`
- ❌ Public routes with no per-user data (marketing pages) — no boundary to enforce

---

## Implementation

### The three kinds of check

| Check | Where | Reads | Purpose |
|---|---|---|---|
| **Optimistic** | `proxy.ts`, UI show/hide | session cookie only, NO database | fast redirect, hide buttons |
| **Secure** | DAL (`verifySession`, data functions) | session validated against the source of truth | actually allow or deny the data |
| **Authorization** | inside every Server Action / Route Handler / DAL function | session + the specific resource | "may THIS user touch THIS row" (IDOR) |

Authentication ("who is it") and authorization ("may they do this to this resource") are
separate steps. Passing the first never implies the second.

### 1. Session adapter — the only file that knows the auth library

```ts
// lib/auth/session.ts
import 'server-only';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth/provider'; // your library's server instance

export type Session = { userId: string; role: 'admin' | 'member' };

// Returns null when there is no valid session. Swapping the auth library changes ONLY this file.
export async function readSession(): Promise<Session | null> {
  const raw = await auth.api.getSession({ headers: await headers() }); // adapt to your library
  if (!raw?.user) return null;
  return { userId: raw.user.id, role: raw.user.role === 'admin' ? 'admin' : 'member' };
}
```

### 2. DAL — `verifySession` and data functions

```ts
// data/auth.ts
import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { readSession, type Session } from '@/lib/auth/session';

// `cache` deduplicates within ONE React render pass (pages, layouts, components).
// Server Actions and Route Handlers are not part of a render pass: there the wrapper does
// nothing and the function runs on every call. That is fine, just do not count on it.
export const verifySession = cache(async (): Promise<Session> => {
  const session = await readSession();
  if (!session) redirect('/login');
  return session;
});
```

```ts
// data/posts.ts — a data function checks identity AND ownership, and returns a DTO
import 'server-only';
import { verifySession } from '@/data/auth';
import { findPostById, deletePostById } from '@/data/queries/posts'; // Kysely, Drizzle, SQL…

export type PostDTO = { id: string; title: string; canEdit: boolean };

export async function getPost(postId: string): Promise<PostDTO | null> {
  const session = await verifySession();
  const post = await findPostById(postId);
  if (!post) return null;
  // Return only what the UI renders. Never the whole row (password hashes, internal flags).
  return {
    id: post.id,
    title: post.title,
    canEdit: post.authorId === session.userId || session.role === 'admin',
  };
}

export async function deletePost(postId: string): Promise<void> {
  const session = await verifySession();
  const post = await findPostById(postId);
  if (!post) throw new Error('Not found');
  if (post.authorId !== session.userId && session.role !== 'admin') {
    throw new Error('Forbidden'); // authorization, not just authentication
  }
  await deletePostById(postId);
}
```

Choose ONE data-access approach per app (DAL recommended for new projects) and keep it. Only the
DAL touches `process.env` secrets and the database client (see `env-secrets-pattern.md`).

### 3. Server Actions — thin, and a public endpoint

A Server Action is reachable by a direct POST from anyone, even if no UI renders it. A page-level
redirect does not protect an action defined on that page. The action authenticates and authorizes
on its own, by delegating to the DAL.

```ts
// app/posts/actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { deletePost } from '@/data/posts'; // auth + ownership happen INSIDE

export async function deletePostAction(postId: string): Promise<{ ok: true }> {
  await deletePost(postId);
  revalidatePath('/posts');
  return { ok: true }; // return what the UI needs, not the deleted row
}
```

Take only the reference and the change from the client (`postId`, the new title). Derive identity
from the session and re-read the resource by ownership. Schema validation checks the SHAPE of the
input; a perfectly valid `postId` can still belong to someone else.

### 4. Route Handlers — same rule, explicit status codes

```ts
// app/api/admin/report/route.ts
import { readSession } from '@/lib/auth/session';

export async function GET() {
  const session = await readSession();
  if (!session) return new Response(null, { status: 401 });
  if (session.role !== 'admin') return new Response(null, { status: 403 });
  // ... build the report through DAL functions
  return Response.json({ ok: true });
}
```

401 = not authenticated, 403 = authenticated but not allowed. In a Route Handler do not use
`redirect()` for an API consumer; return the status.

### 5. `proxy.ts` — optimistic only

```ts
// proxy.ts — runs on every matched request INCLUDING prefetches, so: cookie read, no database
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/dashboard', '/settings'];

export function proxy(request: NextRequest) {
  const hasCookie = request.cookies.has('session'); // cookie name from your auth library
  const needsLogin = PROTECTED.some((p) => request.nextUrl.pathname.startsWith(p));
  if (needsLogin && !hasCookie) {
    return NextResponse.redirect(new URL('/login', request.nextUrl));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next/static|_next/image|.*\\.png$).*)'] };
```

`proxy.ts` runs on the Node.js runtime; confirm your auth and session libraries are compatible.
It is useful to pre-filter and to protect static routes that share data between users. It is not
a substitute for the DAL: a request that gets past it (or never goes through it) must still hit a
check at the data.

### 6. Layouts and Client Components

- A layout does not re-render on navigation (partial rendering), so a check there does not run on
  every route change, and hiding `children` does not stop nested segments or parallel slots from
  being rendered. Put the check in the DAL call the layout makes (`getUser()`), not in the layout.
- `return null` from a top-level component for unauthorized users is an SPA habit and does not
  work here: Next.js has several entry points.
- Client Components cannot import the DAL. Verify in a parent Server Component and pass minimal
  props down.
- Hiding a button is UX. The Server Action behind it still verifies.

---

## Key Rules

1. The boundary is the DAL. `proxy.ts` and UI gating are optimistic and may be bypassed.
2. Every Server Action and Route Handler authenticates AND authorizes the specific resource.
3. Identity comes from the session, never from client input (`userId`, `role`, `isAdmin` params).
4. Return DTOs with only the fields the caller needs; never raw database rows.
5. Prefer an auth library over hand-rolled sessions; keep the library behind one adapter file.
6. Treat `proxy.ts` and `route.ts` as high-risk files and review them like public API code.

## Anti-Patterns

| Anti-pattern | Why it hurts | Instead |
|---|---|---|
| Auth only in `proxy.ts` | any path that skips it (static route, direct action POST) is open | check in the DAL, keep `proxy.ts` optimistic |
| Database call in `proxy.ts` | runs on every request and prefetch | read the cookie only |
| `if (!user) return null` in a layout | layout does not re-run on navigation; nested segments still render | check where the data is read |
| Action trusts `formData.get('userId')` | client chooses the identity | take `userId` from the session |
| Action checks login but not ownership | IDOR: any user edits any row by changing an id | load by `{ id, ownerId: session.userId }` or compare after load |
| Returning the whole row from an action | leaks internal fields into the RSC payload | return `{ ok: true }` or a DTO |
| Auth check only in the page that hosts the action | the action is a separate POST entry point | re-verify inside the action |
| Reading the session in every component by hand | one forgotten check = open data | one DAL function per read, session check inside it |
