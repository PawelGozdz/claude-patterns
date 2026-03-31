# Authentication Pattern

## When to Use

- Any Next.js 16 application that requires user login, session management, or route protection
- When protecting both pages (Server Components) and API routes from unauthorized access
- When building role-based access control (RBAC)
- When you need CSRF protection for Server Actions and forms

**Do NOT** rely solely on `proxy.ts` for auth — it checks cookies/tokens but cannot validate sessions against a database. Always double-check auth in Server Components and API routes.

---

## Implementation

### Session Management Library

```ts
// lib/auth/session.ts
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);
const SESSION_COOKIE = 'session-token';
const SESSION_DURATION = 60 * 60 * 24 * 7; // 7 days in seconds

export interface SessionPayload {
  userId: string;
  email: string;
  role: 'user' | 'admin';
  expiresAt: number;
}

export async function createSession(user: { id: string; email: string; role: string }) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_DURATION;
  const token = await new SignJWT({
    userId: user.id, email: user.email, role: user.role, expiresAt,
  } satisfies SessionPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(expiresAt)
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/', maxAge: SESSION_DURATION,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
```

### Auth Helper — getUser with DB Lookup

```ts
// lib/auth/index.ts
import { getSession } from './session';
import { db } from '@/lib/db';
import { cache } from 'react';

// cache() deduplicates within a single request — safe to call getUser() multiple times
export const getUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  return db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, avatarUrl: true },
  });
});

export const requireUser = cache(async () => {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');
  return user;
});

export const requireAdmin = cache(async () => {
  const user = await requireUser();
  if (user.role !== 'admin') throw new Error('Forbidden');
  return user;
});
```

### proxy.ts — Route Protection

```ts
// proxy.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get('session-token')?.value;
  const protectedPaths = ['/dashboard', '/settings', '/admin'];
  const authPaths = ['/login', '/register', '/forgot-password'];

  if (protectedPaths.some((p) => pathname.startsWith(p)) && !sessionToken) {
    const url = new URL('/login', request.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }
  if (authPaths.some((p) => pathname.startsWith(p)) && sessionToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
```

### Login Server Action

```ts
// app/actions/auth.ts
'use server';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { createSession, deleteSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type LoginState = {
  errors?: { email?: string[]; password?: string[]; _form?: string[] };
};

export async function login(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });

  // Constant-time comparison message — do not reveal whether email exists
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return { errors: { _form: ['Invalid email or password'] } };
  }

  await createSession(user);

  // redirect() throws — so this line is only reached if redirect is not called
  const callbackUrl = formData.get('callbackUrl') as string;
  redirect(callbackUrl || '/dashboard');
}

export async function logout() {
  await deleteSession();
  redirect('/login');
}
```

### Login Page

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

### Login Form (Client Component)

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
        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
          {state.errors._form[0]}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full border rounded-lg px-3 py-2"
        />
        {state.errors?.email && <p className="text-sm text-red-600 mt-1">{state.errors.email[0]}</p>}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full border rounded-lg px-3 py-2"
        />
        {state.errors?.password && <p className="text-sm text-red-600 mt-1">{state.errors.password[0]}</p>}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
      >
        {isPending ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}
```

### Protected API Route

```ts
// app/api/private/data/route.ts
import { getSession } from '@/lib/auth/session';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Fetch and return user-specific data using session.userId
  return NextResponse.json({ userId: session.userId });
}
```

### Auth Provider for Client Components

```tsx
// components/auth-provider.tsx
'use client';

import { createContext, useContext } from 'react';

interface AuthUser { id: string; name: string; email: string; role: string }

const AuthContext = createContext<AuthUser | null>(null);

export function AuthProvider({ user, children }: { user: AuthUser | null; children: React.ReactNode }) {
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const user = useContext(AuthContext);
  if (!user) throw new Error('useAuth must be used within AuthProvider');
  return user;
}
```

```tsx
// app/(app)/layout.tsx — Server Component wraps Client provider
import { getUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AuthProvider } from '@/components/auth-provider';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect('/login');
  return <AuthProvider user={user}>{children}</AuthProvider>;
}
```

---

## Key Rules

1. **Defense in depth** — protect routes at three layers: `proxy.ts` (cookie check), layout (session validation), Server Component/Action (authorization)
2. **`cookies()` is async in Next.js 16** — always `const cookieStore = await cookies()`
3. **Use `cache()` from React for request deduplication** — `getUser()` can be called multiple times without duplicate DB queries
4. **Never expose password hashes** — select only the fields you need; use constant-time comparison error messages
5. **Server Actions inherit the auth context** — always re-verify the session inside every Server Action; do not trust the client
6. **JWT for stateless, DB sessions for revocable** — JWT is simpler; database sessions allow instant revocation
7. **`sameSite: 'lax'` + `httpOnly: true` + `secure: true`** — baseline cookie security for production

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| Auth only in `proxy.ts` | proxy.ts runs at edge, cannot query database; cookie presence does not mean valid session | Validate session in Server Components + proxy.ts |
| `middleware.ts` for auth | Renamed to `proxy.ts` in Next.js 16 | Use `proxy.ts` |
| Storing sensitive data in JWT | JWTs are base64-encoded (not encrypted); anyone can read them | Store only userId/role; fetch sensitive data from DB |
| `localStorage` for auth tokens | XSS-vulnerable; not sent to server automatically | Use `httpOnly` cookies |
| Revealing whether email exists on login failure | Information disclosure — attackers can enumerate accounts | Generic error: "Invalid email or password" |
| Skipping auth in Server Actions | Actions are public HTTP endpoints; anyone can call them | Always `await getSession()` at the top of every action |
| Sync `cookies()` call | `cookies()` is async in Next.js 16 | `const cookieStore = await cookies()` |
