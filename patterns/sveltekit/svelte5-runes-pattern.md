# Svelte 5 Runes Pattern

## When to Use

- Every Svelte 5 component — runes are the default reactivity system
- `$state()` for any mutable reactive value (replaces `let` + stores)
- `$derived()` for computed values (replaces `$:` reactive declarations)
- `$effect()` for side effects (replaces `$:` statements and `onMount`)
- `$props()` for component props (replaces `export let`)
- `$bindable()` for props that support `bind:` from the parent

**Do NOT** use Svelte 4 patterns: no `export let`, no `$:` reactive declarations, no `writable`/`readable` stores. These are removed or deprecated in Svelte 5.

---

## Implementation

### Reactive State with $state and Derived Values with $derived

```svelte
<!-- src/lib/components/TodoList.svelte -->
<script lang="ts">
  interface Todo { id: number; text: string; done: boolean }

  // $state() — reactive signal; deep reactivity for objects and arrays
  let todos = $state<Todo[]>([
    { id: 1, text: 'Learn Svelte 5 runes', done: false },
    { id: 2, text: 'Build a SvelteKit app', done: false },
  ]);
  let filter = $state<'all' | 'active' | 'done'>('all');
  let nextId = $state(3);

  // $derived() — recomputes when dependencies change (auto-tracked)
  let filtered = $derived(
    filter === 'all' ? todos : todos.filter((t) => (filter === 'done' ? t.done : !t.done))
  );
  let remaining = $derived(todos.filter((t) => !t.done).length);

  // $derived.by() — multi-line computed values
  let stats = $derived.by(() => {
    const done = todos.filter((t) => t.done).length;
    const percent = todos.length > 0 ? Math.round((done / todos.length) * 100) : 0;
    return { done, percent };
  });

  function addTodo(text: string) {
    // Deep reactivity: .push() works directly, no spread/reassignment needed
    todos.push({ id: nextId++, text, done: false });
  }

  function toggleTodo(id: number) {
    const todo = todos.find((t) => t.id === id);
    if (todo) todo.done = !todo.done; // Direct mutation works
  }
</script>

<div class="max-w-md mx-auto p-6">
  <h2 class="text-xl font-bold mb-4">Todos ({remaining} remaining, {stats.percent}% done)</h2>

  <div class="flex gap-2 mb-4">
    {#each ['all', 'active', 'done'] as f}
      <button
        onclick={() => filter = f as typeof filter}
        class="px-3 py-1 rounded text-sm {filter === f ? 'bg-blue-600 text-white' : 'bg-gray-200'}"
      >
        {f}
      </button>
    {/each}
  </div>

  {#each filtered as todo (todo.id)}
    <label class="flex items-center gap-2 py-1">
      <input type="checkbox" checked={todo.done} onchange={() => toggleTodo(todo.id)} />
      <span class={todo.done ? 'line-through text-gray-400' : ''}>{todo.text}</span>
    </label>
  {/each}
</div>
```

### Side Effects with $effect

```svelte
<!-- src/lib/components/SearchInput.svelte -->
<script lang="ts">
  let query = $state('');
  let results = $state<string[]>([]);
  let loading = $state(false);

  // $effect auto-tracks $state/$derived reads — no dependency array needed
  $effect(() => {
    if (query.length < 2) { results = []; return; }

    loading = true;
    const controller = new AbortController();

    fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => { results = data.items; loading = false; })
      .catch((err) => { if (err.name !== 'AbortError') loading = false; });

    // Cleanup: runs before re-execution and on component destroy
    return () => controller.abort();
  });

  // $effect for event listeners (replaces onMount)
  $effect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') query = ''; };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });
</script>

<div class="relative">
  <input bind:value={query} class="w-full px-4 py-2 border rounded-lg" placeholder="Search..." />
  {#if loading}
    <div class="absolute right-3 top-2.5 text-gray-400">Loading...</div>
  {/if}
  {#if results.length > 0}
    <ul class="absolute mt-1 w-full bg-white border rounded-lg shadow-lg z-10">
      {#each results as result}
        <li class="px-4 py-2 hover:bg-gray-100 cursor-pointer">{result}</li>
      {/each}
    </ul>
  {/if}
</div>
```

### Component Props with $props and Snippets

```svelte
<!-- src/lib/components/Button.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'danger';
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;  // Replaces default <slot />
  }

  // $props() with destructured defaults — replaces export let
  let { variant = 'primary', disabled = false, onclick, children }: Props = $props();

  let classes = $derived(
    variant === 'primary'   ? 'bg-blue-600 text-white hover:bg-blue-700' :
    variant === 'secondary' ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' :
                              'bg-red-600 text-white hover:bg-red-700'
  );
</script>

<button {onclick} {disabled} class="px-4 py-2 rounded font-medium {classes}">
  {@render children()}
</button>
```

### Snippet Blocks for Template Reuse

```svelte
<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<!-- Snippets: declare reusable template blocks with typed parameters -->
{#snippet statCard(title: string, value: number, trend: string, color: string)}
  <div class="bg-white rounded-lg shadow p-6">
    <h3 class="text-sm font-medium text-gray-500">{title}</h3>
    <div class="mt-2 flex items-baseline gap-2">
      <span class="text-3xl font-bold {color}">{value.toLocaleString()}</span>
      <span class="text-sm text-gray-500">{trend}</span>
    </div>
  </div>
{/snippet}

<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
  {@render statCard('Revenue', data.revenue, '+12%', 'text-green-600')}
  {@render statCard('Users', data.userCount, '+5%', 'text-blue-600')}
  {@render statCard('Orders', data.orderCount, '-2%', 'text-red-600')}
</div>
```

### $bindable for Two-Way Binding Props

```svelte
<!-- src/lib/components/TextInput.svelte -->
<script lang="ts">
  interface Props { value: string; label: string; name: string; error?: string }

  let { value = $bindable(''), label, name, error }: Props = $props();
</script>

<div class="space-y-1">
  <label for={name} class="block text-sm font-medium text-gray-700">{label}</label>
  <input id={name} {name} bind:value class="w-full px-3 py-2 border rounded-lg
    {error ? 'border-red-500' : 'border-gray-300'}" />
  {#if error}<p class="text-sm text-red-600">{error}</p>{/if}
</div>
```

```svelte
<!-- Usage: bind:value works because prop uses $bindable() -->
<script lang="ts">
  import TextInput from '$lib/components/TextInput.svelte';
  let email = $state('');
</script>
<TextInput bind:value={email} label="Email" name="email" />
```

---

## Key Rules

1. **`$state()` is the single source of truth** — all mutable reactive values. Supports primitives, objects, and arrays with deep reactivity.
2. **`$derived()` is pure** — computation only, no side effects. Use `$derived.by()` for multi-line logic.
3. **`$effect()` auto-tracks dependencies** — reads `$state`/`$derived` inside the callback automatically. No dependency arrays.
4. **`$effect()` cleanup** — return a function to clean up (listeners, abort controllers). Runs before re-execution and on destroy.
5. **`$props()` replaces `export let`** — destructure with TypeScript interface and defaults.
6. **Snippets replace slots** — `{#snippet name(params)}` to declare, `{@render name(args)}` to invoke. `children` snippet replaces default `<slot />`.
7. **Events are props** — `onclick`, `onkeydown` are callback props, not `on:click` directives.
8. **Deep reactivity works** — `.push()`, `.splice()`, property assignment on `$state` objects all trigger updates.

---

## Anti-Patterns

```svelte
<!-- WRONG (Svelte 4): Reactive declarations and export let -->
<script>
  export let items;
  $: filtered = items.filter(i => i.active);
  $: count = filtered.length;
</script>

<!-- RIGHT (Svelte 5): Runes -->
<script lang="ts">
  let { items }: { items: Item[] } = $props();
  let filtered = $derived(items.filter(i => i.active));
  let count = $derived(filtered.length);
</script>
```

```svelte
<!-- WRONG: Svelte stores for component state -->
<script>
  import { writable } from 'svelte/store';
  const count = writable(0);
</script>
<button on:click={() => $count++}>{$count}</button>

<!-- RIGHT: $state rune -->
<script lang="ts">
  let count = $state(0);
</script>
<button onclick={() => count++}>{count}</button>
```

```svelte
<!-- WRONG: on:event directive (Svelte 4) / slots -->
<button on:click={handleClick}>Click</button>
<slot /><slot name="header" />

<!-- RIGHT: Event props (Svelte 5) / snippets -->
<button onclick={handleClick}>Click</button>
{@render children()}{@render header()}
```
