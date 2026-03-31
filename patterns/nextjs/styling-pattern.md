# Styling Pattern

## When to Use

- Every Next.js 16 application that needs consistent, performant styling
- When using Tailwind CSS 4 (default in `create-next-app` as of Next.js 16)
- When components need scoped styles via CSS Modules
- When page transitions should be animated using React 19.2 View Transitions
- When building a design system with tokens and reusable utility classes

**Do NOT** use CSS-in-JS libraries that require runtime JavaScript in Server Components (styled-components, Emotion) — they add client-side JS overhead and do not work in Server Components without extra configuration.

---

## Implementation

### Tailwind CSS 4 Setup (Default in Next.js 16)

```css
/* app/globals.css */
/* Tailwind CSS 4 uses a single CSS import — no more @tailwind directives */
@import 'tailwindcss';

/* Custom theme tokens via CSS custom properties */
@theme {
  --color-brand-500: #3b82f6;
  --color-brand-600: #2563eb;
  --color-brand-700: #1d4ed8;
  --color-surface: #ffffff;
  --color-surface-secondary: #f8fafc;
  --color-border: #e2e8f0;
  --font-sans: 'Inter', system-ui, sans-serif;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
}

@media (prefers-color-scheme: dark) {
  @theme {
    --color-surface: #0f172a;
    --color-surface-secondary: #1e293b;
    --color-border: #334155;
  }
}
```

### Tailwind Component — Server Component

```tsx
// components/product-card.tsx
// Server Component — no directive needed, no JS shipped to browser
import Image from 'next/image';
import Link from 'next/link';

interface ProductCardProps {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  category: string;
}

export function ProductCard({ id, name, price, imageUrl, category }: ProductCardProps) {
  return (
    <Link href={`/products/${id}`}
      className="group block rounded-xl border border-border bg-surface overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <div className="aspect-[4/3] relative bg-surface-secondary">
        <Image src={imageUrl} alt={name} fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          className="object-cover group-hover:scale-105 transition-transform duration-300" />
      </div>
      <div className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-600">{category}</p>
        <h3 className="mt-1 font-semibold group-hover:text-brand-600 transition-colors">{name}</h3>
        <p className="mt-2 text-lg font-bold">${price.toFixed(2)}</p>
      </div>
    </Link>
  );
}
```

### CSS Modules — Scoped Styles

```css
/* components/badge/badge.module.css */
.badge {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.125rem 0.625rem; border-radius: 9999px;
  font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
}
.success { background-color: #dcfce7; color: #166534; }
.warning { background-color: #fef9c3; color: #854d0e; }
.error   { background-color: #fee2e2; color: #991b1b; }
.info    { background-color: #dbeafe; color: #1e40af; }
```

```tsx
// components/badge/badge.tsx
// Server Component — CSS Modules work directly, no "use client" needed
import styles from './badge.module.css';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
}

export function Badge({ variant, children }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[variant]}`}>
      {children}
    </span>
  );
}
```

### cn() Utility — Conditional Class Merging

```ts
// lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Combines clsx (conditionals) with tailwind-merge (dedup conflicting classes)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

```tsx
// components/button.tsx
// Server Component — can be used in both Server and Client Components
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const variantStyles = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-white text-gray-700 border border-border hover:bg-gray-50 shadow-sm',
  ghost: 'text-gray-700 hover:bg-gray-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
```

### View Transitions (React 19.2) for Page Animations

```tsx
// components/page-transition.tsx
'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useTransition, useCallback } from 'react';

// React 19.2 View Transitions API — animate between pages
export function useViewTransitionRouter() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const push = useCallback(
    (href: string) => {
      // Check browser support for View Transitions
      if (!document.startViewTransition) {
        router.push(href);
        return;
      }

      document.startViewTransition(() => {
        startTransition(() => {
          router.push(href);
        });
      });
    },
    [router, startTransition],
  );

  return { push, isPending };
}
```

```css
/* app/globals.css — add to the end */

/* View Transition animations */
::view-transition-old(root) { animation: slide-out 200ms ease-in-out; }
::view-transition-new(root) { animation: slide-in 200ms ease-in-out; }

@keyframes slide-out {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(-20px); }
}
@keyframes slide-in {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* Named view transitions for element-level morph (e.g., product images) */
.product-image { view-transition-name: product-image; }
::view-transition-old(product-image) { animation: fade-scale 300ms ease-in-out reverse; }
::view-transition-new(product-image) { animation: fade-scale 300ms ease-in-out; }
@keyframes fade-scale {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}
```

### Activity Component (React 19.2) for Preloaded UI

```tsx
// components/tabs/tab-panel.tsx
'use client';

import { Activity } from 'react';

interface TabPanelProps {
  active: boolean;
  children: React.ReactNode;
}

// <Activity/> keeps the component mounted but hidden — preserves state
// When mode="hidden", the component is in the DOM but visually hidden and deprioritized
// When mode="visible", it renders normally
export function TabPanel({ active, children }: TabPanelProps) {
  return (
    <Activity mode={active ? 'visible' : 'hidden'}>
      <div role="tabpanel">{children}</div>
    </Activity>
  );
}
```

---

## Key Rules

1. **Tailwind CSS 4 uses `@import 'tailwindcss'`** — no more `@tailwind base/components/utilities` directives
2. **Use `@theme` for design tokens** — replaces `tailwind.config.ts` theme extension for most use cases
3. **CSS Modules work in Server Components** — no "use client" needed for scoped styles; the CSS is extracted at build time
4. **`cn()` = `clsx` + `twMerge`** — use it for conditional and composable Tailwind class strings; prevents conflicting utility classes
5. **View Transitions require "use client"** — they use browser APIs (`document.startViewTransition`) and React hooks
6. **`view-transition-name` must be unique on the page** — use dynamic names (e.g., `product-${id}`) for element-level morph transitions
7. **React Compiler auto-memoizes** — do not manually wrap style objects in `useMemo`; the compiler handles it

---

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| CSS-in-JS runtime libraries in Server Components | styled-components/Emotion require client JS; not compatible with RSC | Use Tailwind CSS or CSS Modules |
| `@tailwind base; @tailwind components; @tailwind utilities;` | Tailwind CSS 4 syntax — use `@import 'tailwindcss'` | Single import in globals.css |
| String concatenation for class names | No dedup, no conditional logic, Tailwind class conflicts | Use `cn()` utility with `clsx` + `twMerge` |
| Inline `style` objects for complex layouts | Loses Tailwind's utility-first DX; not tree-shaken | Use Tailwind classes or CSS Modules |
| `useMemo` for style constants | React Compiler auto-memoizes; manual memo is noise | Define style maps as module-level constants |
| Forgetting `view-transition-name` uniqueness | Duplicate names cause transitions to fail silently | Use dynamic names: `style={{ viewTransitionName: \`item-\${id}\` }}` |
| Using `<Activity/>` without understanding state | Component stays mounted — timers, subscriptions keep running in hidden mode | Clean up in `useEffect` or design for hidden-aware behavior |
