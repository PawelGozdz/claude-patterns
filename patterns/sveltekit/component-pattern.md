# Component Architecture Pattern

## When to Use

- Every reusable UI element in a SvelteKit 2 application
- When building typed component APIs with `$props()` and TypeScript
- When composing components with snippets (replaces slots in Svelte 5)
- When sharing components and utilities via `$lib/`
- When integrating Tailwind CSS with component variants

**Do NOT** use `export let` for props, `on:event` for events, or `<slot>` for content projection. These are all Svelte 4 and replaced in Svelte 5.

---

## Implementation

### Typed Component with $props and Snippets

```svelte
<!-- src/lib/components/Card.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    subtitle?: string;
    href?: string;
    variant?: 'default' | 'elevated' | 'outlined';
    header?: Snippet;
    footer?: Snippet;
    children: Snippet;  // Replaces default <slot />
  }

  let { title, subtitle, href, variant = 'default', header, footer, children }: Props = $props();

  const variantClasses = {
    default: 'bg-white shadow-sm',
    elevated: 'bg-white shadow-lg',
    outlined: 'bg-white border border-gray-200',
  } as const;
</script>

<div class="rounded-lg overflow-hidden {variantClasses[variant]}">
  {#if header}
    <div class="border-b border-gray-100">{@render header()}</div>
  {/if}

  <div class="p-6">
    {#if href}
      <a {href} class="group">
        <h3 class="text-lg font-semibold group-hover:text-blue-600">{title}</h3>
      </a>
    {:else}
      <h3 class="text-lg font-semibold text-gray-900">{title}</h3>
    {/if}
    {#if subtitle}<p class="mt-1 text-sm text-gray-500">{subtitle}</p>{/if}
    <div class="mt-4">{@render children()}</div>
  </div>

  {#if footer}
    <div class="px-6 py-4 bg-gray-50 border-t">{@render footer()}</div>
  {/if}
</div>
```

### Using Snippet Props (Replacing Slots)

```svelte
<!-- src/routes/products/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types';
  import Card from '$lib/components/Card.svelte';
  let { data }: { data: PageData } = $props();
</script>

{#each data.products as product (product.id)}
  <Card title={product.name} subtitle={product.category} variant="outlined">
    {#snippet header()}
      <img src={product.imageUrl} alt={product.name} class="w-full h-48 object-cover" />
    {/snippet}

    <p class="text-gray-700">{product.description}</p>

    {#snippet footer()}
      <div class="flex justify-between items-center">
        <span class="text-sm text-gray-500">{product.stockCount} in stock</span>
        <button class="px-4 py-2 bg-blue-600 text-white text-sm rounded">Add to Cart</button>
      </div>
    {/snippet}
  </Card>
{/each}
```

### Event Handling (Svelte 5 — Events are Props)

```svelte
<!-- src/lib/components/Modal.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title: string;
    onclose: () => void;      // Event callbacks are regular props
    children: Snippet;
    actions?: Snippet;
  }

  let { open, title, onclose, children, actions }: Props = $props();
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
    onkeydown={(e) => { if (e.key === 'Escape') onclose(); }}
    role="dialog" aria-modal="true">

    <div class="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4">
      <div class="flex items-center justify-between px-6 py-4 border-b">
        <h2 class="text-lg font-semibold">{title}</h2>
        <button onclick={onclose} class="text-gray-400 hover:text-gray-600" aria-label="Close">&times;</button>
      </div>
      <div class="px-6 py-4">{@render children()}</div>
      {#if actions}
        <div class="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">{@render actions()}</div>
      {/if}
    </div>
  </div>
{/if}
```

### Using the Modal

```svelte
<script lang="ts">
  import Modal from '$lib/components/Modal.svelte';
  import Button from '$lib/components/Button.svelte';

  let showModal = $state(false);
  let deleting = $state(false);

  async function handleDelete() {
    deleting = true;
    await fetch('/api/account', { method: 'DELETE' });
    deleting = false;
    showModal = false;
  }
</script>

<Button variant="danger" onclick={() => (showModal = true)}>Delete Account</Button>

<Modal open={showModal} title="Delete Account" onclose={() => (showModal = false)}>
  <p>This action is irreversible. All your data will be permanently deleted.</p>

  {#snippet actions()}
    <Button variant="secondary" onclick={() => (showModal = false)}>Cancel</Button>
    <Button variant="danger" onclick={handleDelete} disabled={deleting}>
      {deleting ? 'Deleting...' : 'Delete Forever'}
    </Button>
  {/snippet}
</Modal>
```

### $bindable for Two-Way Binding

```svelte
<!-- src/lib/components/TextInput.svelte -->
<script lang="ts">
  interface Props { value: string; label: string; name: string; error?: string; required?: boolean }
  let { value = $bindable(''), label, name, error, required = false }: Props = $props();
</script>

<div class="space-y-1">
  <label for={name} class="block text-sm font-medium text-gray-700">
    {label}{#if required}<span class="text-red-500">*</span>{/if}
  </label>
  <input id={name} {name} {required} bind:value
    class="w-full px-3 py-2 border rounded-lg {error ? 'border-red-500' : 'border-gray-300'}" />
  {#if error}<p class="text-sm text-red-600">{error}</p>{/if}
</div>
```

### Organizing Shared Code with $lib

```
src/lib/
  components/       # Shared UI components (Button, Card, Modal, TextInput)
  server/           # Server-only (DB, auth) — SvelteKit blocks client imports
  utils/            # Format, validation helpers
  types/            # Shared TypeScript types
```

```typescript
// src/lib/utils/format.ts — imported as $lib/utils/format
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}
```

---

## Key Rules

1. **`$props()` is the only way to declare props** — destructure with TypeScript interface and defaults.
2. **Snippets replace slots** — declare with `Snippet` type. `children` replaces `<slot />`.
3. **Events are regular callback props** — `onclick`, `onchange`, `onsubmit`. Type as `(e: MouseEvent) => void`.
4. **`$bindable()` enables `bind:`** — only props using `$bindable()` support two-way binding from parent.
5. **`$lib/` is the import alias** — shared code lives here. `$lib/server/` is server-only enforced.
6. **Tailwind classes go directly on elements** — use `<style>` only for animations or third-party overrides.
7. **Variant classes via lookup objects** — avoid deeply nested ternaries in templates.

---

## Anti-Patterns

```svelte
<!-- WRONG (Svelte 4): export let, slots, createEventDispatcher -->
<script>
  export let title;
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>
<slot /><button on:click={() => dispatch('select', item)}>Select</button>

<!-- RIGHT (Svelte 5): $props, snippets, callback props -->
<script lang="ts">
  let { title, onselect, children }: Props = $props();
</script>
{@render children()}<button onclick={() => onselect(item)}>Select</button>
```

```svelte
<!-- WRONG: Deeply nested ternary class logic -->
<div class="{v === 'a' ? 'bg-red-500' : v === 'b' ? 'bg-blue-500' : 'bg-gray-500'}">

<!-- RIGHT: Lookup object -->
<script lang="ts">
  const classes = { a: 'bg-red-500', b: 'bg-blue-500' } as const;
</script>
<div class={classes[v] ?? 'bg-gray-500'}>
```
