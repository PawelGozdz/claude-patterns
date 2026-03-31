# Forms & Server Actions Pattern

## When to Use

- Any form submission, data mutation, or user input that writes to a database or external service
- When you need progressive enhancement (form works without JavaScript)
- When form state (errors, success messages) must be managed across server roundtrips
- When optimistic UI updates improve perceived performance

**Do NOT** create API routes (`route.ts`) just to handle form submissions — Server Actions replace that pattern. Do NOT use `"use server"` at the component level (it is for action files/functions only).

---

## Implementation

### Server Action with Zod Validation

```ts
// app/actions/contact.ts
'use server';

import { z } from 'zod';
import { db } from '@/lib/db';
import { revalidateTag } from 'next/cache';

const ContactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  message: z.string().min(10, 'Message must be at least 10 characters').max(5000),
  category: z.enum(['general', 'support', 'sales', 'feedback']),
});

export type ContactFormState = {
  errors?: {
    name?: string[];
    email?: string[];
    message?: string[];
    category?: string[];
    _form?: string[];
  };
  success?: boolean;
};

export async function submitContact(
  prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const parsed = ContactSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    message: formData.get('message'),
    category: formData.get('category'),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  try {
    await db.contactMessage.create({ data: parsed.data });
    revalidateTag('contact-messages', 'max');
    return { success: true };
  } catch {
    return { errors: { _form: ['Failed to submit. Please try again.'] } };
  }
}
```

### Form Component with useActionState

```tsx
// app/contact/contact-form.tsx
'use client';

import { useActionState } from 'react';
import { submitContact, type ContactFormState } from '@/app/actions/contact';

const initialState: ContactFormState = {};

export function ContactForm() {
  const [state, formAction, isPending] = useActionState(submitContact, initialState);

  if (state.success) {
    return (
      <div className="rounded-lg bg-green-50 p-6 text-green-800">
        <h3 className="font-semibold">Message sent!</h3>
        <p>We will get back to you within 24 hours.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6 max-w-lg">
      {state.errors?._form && (
        <div className="rounded-lg bg-red-50 p-4 text-red-700">
          {state.errors._form.map((e) => <p key={e}>{e}</p>)}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium mb-1">Name</label>
        <input
          id="name"
          name="name"
          type="text"
          required
          className="w-full border rounded-lg px-3 py-2"
        />
        {state.errors?.name && (
          <p className="text-sm text-red-600 mt-1">{state.errors.name[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="w-full border rounded-lg px-3 py-2"
        />
        {state.errors?.email && (
          <p className="text-sm text-red-600 mt-1">{state.errors.email[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="category" className="block text-sm font-medium mb-1">Category</label>
        <select id="category" name="category" className="w-full border rounded-lg px-3 py-2">
          <option value="general">General</option>
          <option value="support">Support</option>
          <option value="sales">Sales</option>
          <option value="feedback">Feedback</option>
        </select>
        {state.errors?.category && (
          <p className="text-sm text-red-600 mt-1">{state.errors.category[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-medium mb-1">Message</label>
        <textarea
          id="message"
          name="message"
          rows={5}
          required
          className="w-full border rounded-lg px-3 py-2"
        />
        {state.errors?.message && (
          <p className="text-sm text-red-600 mt-1">{state.errors.message[0]}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50"
      >
        {isPending ? 'Sending...' : 'Send Message'}
      </button>
    </form>
  );
}
```

### Optimistic Updates with useOptimistic

```tsx
// app/todos/todo-list.tsx
'use client';

import { useOptimistic, useRef } from 'react';
import { addTodo, toggleTodo, deleteTodo } from '@/app/actions/todos';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

export function TodoList({ todos }: { todos: Todo[] }) {
  const formRef = useRef<HTMLFormElement>(null);

  const [optimisticTodos, addOptimistic] = useOptimistic(
    todos,
    (state: Todo[], action: { type: string; payload: unknown }) => {
      switch (action.type) {
        case 'add':
          return [...state, { id: crypto.randomUUID(), text: action.payload as string, completed: false }];
        case 'toggle':
          return state.map((t) => (t.id === action.payload ? { ...t, completed: !t.completed } : t));
        case 'delete':
          return state.filter((t) => t.id !== action.payload);
        default:
          return state;
      }
    },
  );

  async function handleAdd(formData: FormData) {
    const text = formData.get('text') as string;
    if (!text.trim()) return;

    // Optimistic: update UI immediately
    addOptimistic({ type: 'add', payload: text });
    formRef.current?.reset();

    // Server: persist to database
    await addTodo(text);
  }

  async function handleToggle(id: string) {
    addOptimistic({ type: 'toggle', payload: id });
    await toggleTodo(id);
  }

  async function handleDelete(id: string) {
    addOptimistic({ type: 'delete', payload: id });
    await deleteTodo(id);
  }

  return (
    <div className="max-w-md mx-auto">
      <form ref={formRef} action={handleAdd} className="flex gap-2 mb-6">
        <input
          name="text"
          type="text"
          placeholder="Add a todo..."
          className="flex-1 border rounded-lg px-3 py-2"
          required
        />
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">
          Add
        </button>
      </form>

      <ul className="space-y-2">
        {optimisticTodos.map((todo) => (
          <li key={todo.id} className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm">
            <button onClick={() => handleToggle(todo.id)}>
              <span className={todo.completed ? 'line-through text-gray-400' : ''}>
                {todo.completed ? '✓' : '○'}
              </span>
            </button>
            <span className={`flex-1 ${todo.completed ? 'line-through text-gray-400' : ''}`}>
              {todo.text}
            </span>
            <button
              onClick={() => handleDelete(todo.id)}
              className="text-red-500 hover:text-red-700 text-sm"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Server Action with updateTag for Instant Cache Refresh

```ts
// app/actions/todos.ts
'use server';

import { updateTag } from 'next/cache';
import { db } from '@/lib/db';
import { getUser } from '@/lib/auth';

export async function addTodo(text: string) {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');
  await db.todo.create({ data: { text, userId: user.id, completed: false } });
  updateTag(`todos-${user.id}`); // Instant cache invalidation
}

export async function toggleTodo(id: string) {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');
  const todo = await db.todo.findUnique({ where: { id } });
  if (!todo || todo.userId !== user.id) throw new Error('Not found');
  await db.todo.update({ where: { id }, data: { completed: !todo.completed } });
  updateTag(`todos-${user.id}`);
}

export async function deleteTodo(id: string) {
  const user = await getUser();
  if (!user) throw new Error('Unauthorized');
  await db.todo.delete({ where: { id, userId: user.id } });
  updateTag(`todos-${user.id}`);
}
```

### Server Page Composing the Form

```tsx
// app/todos/page.tsx
import { getUser } from '@/lib/auth';
import { getTodos } from '@/lib/data/todos';
import { TodoList } from './todo-list';
import { redirect } from 'next/navigation';

export default async function TodosPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const todos = await getTodos(user.id);
  // Server fetches data, Client Component handles interactivity
  return <TodoList todos={todos} />;
}
```

---

## Key Rules

1. **Server Actions use `"use server"`** — either at the top of a file or inline in an async function inside a Server Component
2. **`useActionState` replaces `useFormState`** — it returns `[state, formAction, isPending]`; the third value eliminates the need for `useFormStatus` in most cases
3. **Forms work without JS** — `<form action={serverAction}>` submits as a standard POST when JavaScript is disabled (progressive enhancement)
4. **Always validate on the server** — client-side validation is UX sugar; never trust it for security
5. **`updateTag()` after mutations** — instantly invalidates cached data so the next render shows fresh results
6. **`useOptimistic` for perceived speed** — update UI before the server responds; the real state reconciles after the action completes
7. **Return state, do not throw** — Server Actions should return `{ errors }` or `{ success }`, not throw exceptions (throws become unhandled error boundaries)

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| API route for form handling | Unnecessary indirection; Server Actions are simpler and type-safe | Use Server Actions with `<form action={...}>` |
| `"use server"` on a component | Marks all exports as Server Actions, not the component as server-side | `"use server"` goes in action files or inline functions only |
| Skipping server-side validation | Client validation is bypassable; opens injection/corruption risks | Always validate with Zod (or similar) in the Server Action |
| Throwing errors from Server Actions | Triggers error boundary, loses form state | Return `{ errors }` object and render inline |
| Forgetting `updateTag` after mutation | Stale cached data persists until TTL expires | Call `updateTag('tag')` after every write |
| `useFormState` | Renamed to `useActionState` in React 19 | Use `useActionState` from `'react'` |
| Calling Server Action in `useEffect` | Runs on every render; Server Actions are for user-initiated mutations | Use `<form action>` or call inside event handlers |
