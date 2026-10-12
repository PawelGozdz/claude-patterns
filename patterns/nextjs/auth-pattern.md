# Authentication Pattern (hand-rolled session, no auth library)

**Tags**: "web:auth", "web:platform:nextjs"
**Layer**: Cross-Layer
**Level**: core
**Status**: production

> The official Next.js docs recommend an auth LIBRARY for production (Better Auth, Auth.js /
> NextAuth.js, Clerk, Auth0, WorkOS, Supabase and others are listed) and present manual sessions as
> an educational example. Use this pattern ONLY when no library fits. The rules for WHERE to check
> identity and permissions live in `auth-boundaries-pattern.md` and apply here too.

## When to Use

**Use this pattern for:**
- ✅ Hand-rolled stateless JWT sessions stored in a cookie, signed with `jose`
- ✅ Password login where you hash and verify passwords yourself, server-side
- ✅ A Next.js 16 app where no auth library fits and you own the session code

**Do NOT use for:**
- ❌ Apps where an auth library provides sessions — use that library's Next.js guide plus `auth-boundaries-pattern.md`
- ❌ Deciding where checks go (page, layout, action, Route Handler, `proxy.ts`) — see `auth-boundaries-pattern.md`
- ❌ Webhook or third-party HTTP endpoints — see `route-handlers-pattern.md`

---

## Implementation

Data access is ORM-neutral: the samples call server-only DAL functions (`findUserByEmail`,
`findUserById`) from `@/data/users`. Implement them with whatever query layer the app uses.

### Session module

```ts
// lib/auth/session.ts
import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

// SESSION_SECRET: generate with `openssl rand -base64 32`; read via the validated env module
const key = new TextEncoder().encode(process.env.SESSION_SECRET);
const SESSION_COOKIE = 'session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Minimum payload: no email, no name, no other PII. Fetch the rest from the DAL.
export interface SessionPayload {
  userId: string;
  role: 'user' | 'admin';
}

export async function createSession(user: { id: string; role: 'user' | 'admin' }) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const token = await new SignJWT({ userId: user.id, role: user.role } satisfies SessionPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key);

  const cookieStore = await cookies(); // set on the server
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', expires: expiresAt,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] });
    return { userId: String(payload.userId), role: payload.role === 'admin' ? 'admin' : 'user' };
  } catch {
    return null; // invalid or expired token = no session
  }
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
```

### DAL — the secure check and password hashing

```ts
// data/auth.ts — the secure check lives HERE (see auth-boundaries-pattern.md)
import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getSession, type SessionPayload } from '@/lib/auth/session';
import { findUserById } from '@/data/users';

// `cache` dedupes only within ONE React render pass (pages, layouts, components).
// Server Actions and Route Handlers get no dedup: the function runs on every call.
export const verifySession = cache(async (): Promise<SessionPayload> => {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
});

export const getUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const user = await findUserById(session.userId);
  // DTO: never return the row (password hash, internal flags)
  return user ? { id: user.id, name: user.name, role: user.role } : null;
});
```

```ts
// data/users.ts — password hashing and comparison happen server-side, in the DAL
import 'server-only';
import bcrypt from 'bcryptjs';
import { findUserByEmail } from '@/data/queries/users'; // your query layer
import { insertUser } from '@/data/queries/users';

export async function registerUser(email: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  return insertUser({ email, passwordHash, role: 'user' });
}

// Returns a safe user reference or null. The hash never leaves this module.
export async function verifyCredentials(email: string, password: string) {
  const user = await findUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
  return { id: user.id, role: user.role };
}
```

### proxy.ts — optimistic route protection

```ts
// proxy.ts — reads the cookie only, no database. Runs on the Node.js runtime.
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has('session');
  const protectedPaths = ['/dashboard', '/settings', '/admin'];
  const authPaths = ['/login', '/register'];

  if (protectedPaths.some((p) => pathname.startsWith(p)) && !hasSession) {
    const url = new URL('/login', request.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }
  if (authPaths.some((p) => pathname.startsWith(p)) && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'] };
```

### Login Server Action

```ts
// app/actions/auth.ts
'use server';

import { z } from 'zod';
import { verifyCredentials } from '@/data/users';
import { createSession, deleteSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type LoginState = {
  errors?: { email?: string[]; password?: string[]; _form?: string[] };
};

// Only same-site relative paths: blocks open redirects such as "//evil.example"
function safeCallback(value: FormDataEntryValue | null): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/dashboard';
}

export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const user = await verifyCredentials(parsed.data.email, parsed.data.password);
  // One generic message: do not reveal whether the email exists
  if (!user) {
    return { errors: { _form: ['Invalid email or password'] } };
  }

  await createSession(user);
  redirect(safeCallback(formData.get('callbackUrl'))); // redirect() throws; keep it last
}

export async function logout() {
  await deleteSession();
  redirect('/login');
}
```

### Login Page and Form

```tsx
// app/login/page.tsx
import { LoginForm } from './login-form';

interface PageProps {
  searchParams: Promise<{ callbackUrl?: string }>;
}

export default async function LoginPage({ searchParams }: PageProps) {
  const { callbackUrl } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-8">Sign In</h1>
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}
```

```tsx
// app/login/login-form.tsx
'use client';

import { useActionState } from 'react';
import { login, type LoginState } from '@/app/actions/auth';

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="space-y-4">
      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
      {state.errors?._form && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{state.errors._form[0]}</div>
      )}
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required
          className="w-full border rounded-lg px-3 py-2" />
        {state.errors?.email && <p className="text-sm text-red-600 mt-1">{state.errors.email[0]}</p>}
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required
          className="w-full border rounded-lg px-3 py-2" />
        {state.errors?.password && <p className="text-sm text-red-600 mt-1">{state.errors.password[0]}</p>}
      </div>
      <button type="submit" disabled={isPending}
        className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50">
        {isPending ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}
```

### Protected Route Handler

```ts
// app/api/private/data/route.ts
import { getSession } from '@/lib/auth/session';
import { listItemsForUser } from '@/data/items'; // DAL: authorization + DTO inside

export async function GET() {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401 });
  return Response.json(await listItemsForUser(session.userId));
}
```

### Auth Provider for Client Components (UI only)

```tsx
// components/auth-provider.tsx
'use client';

import { createContext, useContext } from 'react';

interface AuthUser { id: string; name: string; role: string }

const AuthContext = createContext<AuthUser | null>(null);

export function AuthProvider({ user, children }: { user: AuthUser | null; children: React.ReactNode }) {
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

// null = signed out. This context drives UX (show/hide); it is not a security boundary.
export function useAuth() {
  return useContext(AuthContext);
}
```

```tsx
// app/(app)/layout.tsx — supplies the user for UI. It does NOT gate access:
// layouts do not re-render on navigation. Pages and the DAL call verifySession().
import { getUser } from '@/data/auth';
import { AuthProvider } from '@/components/auth-provider';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return <AuthProvider user={user}>{children}</AuthProvider>;
}
```

---

## Key Rules

1. **The secure check lives in the DAL** (`verifySession` and data functions) — see `auth-boundaries-pattern.md`. `proxy.ts` and layouts are optimistic only.
2. **`cookies()` is async in Next.js 16** — always `const cookieStore = await cookies()`; cookies are set on the server.
3. **Cookie baseline**: `httpOnly: true`, `secure: true`, `sameSite: 'lax'`, `path: '/'`, with `expires`/`maxAge`.
4. **Session payload holds the minimum** (user id, role). No PII, no email; JWTs are signed, not encrypted.
5. **Session code is `server-only`**, signed with `jose` (`SignJWT`/`jwtVerify`, HS256) using `SESSION_SECRET` from `openssl rand -base64 32`.
6. **`cache()` dedupes only within a render pass** — Server Actions and Route Handlers get no dedup, so do not rely on it there.
7. **`proxy.ts` reads the cookie only (no DB)** and runs on Node.js.
8. **Passwords are hashed and compared server-side inside the DAL**; the hash never leaves it; return DTOs.
9. **Every Server Action and Route Handler re-verifies the session**; stateless JWT is simplest, DB sessions allow instant revocation.
10. **Validate `callbackUrl`** — same-site relative paths only.

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| Auth only in `proxy.ts` | cookie presence is not a valid session; static routes and direct action POSTs skip it | check in the DAL, keep `proxy.ts` optimistic |
| Gating access in a layout | layouts do not re-render on navigation; nested segments still render | `verifySession()` where the data is read |
| `middleware.ts` for auth | renamed to `proxy.ts` in Next.js 16 | use `proxy.ts` |
| PII (email, name) in the JWT | JWTs are base64, not encrypted | store user id and role only, load the rest via the DAL |
| `localStorage` for auth tokens | XSS-readable; not sent automatically | `httpOnly` cookie |
| Revealing whether an email exists | account enumeration | generic "Invalid email or password" |
| Skipping auth in Server Actions | actions are public HTTP endpoints | call a DAL function that verifies the session |
| Hashing or comparing passwords in a Client Component or outside the DAL | hash exposure, scattered logic | `verifyCredentials` in a `server-only` module |
| Relying on `cache()` in an action or Route Handler | no dedup outside a render pass | accept repeat calls |
| Redirecting to an unvalidated `callbackUrl` | open redirect | allow only same-site relative paths |
| Sync `cookies()` call | `cookies()` is async in Next.js 16 | `await cookies()` |
