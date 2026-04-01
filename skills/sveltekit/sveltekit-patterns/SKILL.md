---
name: sveltekit-patterns
description: SvelteKit 2 + Svelte 5 runes patterns — routing, data loading, $state/$derived/$effect, form actions, component composition, Tailwind, Vitest/Playwright testing. Activates on .svelte and SvelteKit files.
origin: pcu
paths:
  - "**/*.svelte"
  - "**/+page.ts"
  - "**/+page.server.ts"
  - "**/+layout.ts"
  - "**/+layout.server.ts"
  - "**/svelte.config.*"
---

# SvelteKit 2 + Svelte 5 Patterns Skill

## Core Patterns

| Pattern | When to Use |
|---------|-------------|
| `routing-loading-pattern.md` | Routes, load functions, layouts |
| `svelte5-runes-pattern.md` | $state, $derived, $effect, $props |
| `data-fetching-pattern.md` | Server loads, form actions, streaming |
| `component-pattern.md` | Props, snippets, composition |
| `testing-pattern.md` | Vitest, Testing Library, Playwright |

## Quick Rules (Svelte 5 — NOT Svelte 4)

1. **$state()** not writable stores — `let count = $state(0)`
2. **$derived()** not $: — `let double = $derived(count * 2)`
3. **$effect()** not onMount for side effects — `$effect(() => { ... })`
4. **$props()** not export let — `let { name, age } = $props()`
5. **onclick** not on:click — `<button onclick={handler}>`
6. **Snippets** not slots — `{#snippet header()}{/snippet}` + `{@render header()}`
7. **+page.server.ts** for secrets/DB — never expose in +page.ts
8. **Form actions** for mutations — use:enhance for progressive enhancement
9. **$lib/** for shared code — `import { api } from '$lib/api/client'`

## Anti-Patterns (CRITICAL — Svelte 4 is WRONG)

```svelte
<!-- WRONG (Svelte 4) -->
<script>
  export let name;        // ← use $props()
  $: doubled = count * 2; // ← use $derived()
</script>
<button on:click={handler}>  <!-- ← use onclick -->
<slot />                      <!-- ← use snippets -->

<!-- CORRECT (Svelte 5) -->
<script lang="ts">
  let { name }: { name: string } = $props();
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
<button onclick={handler}>
{@render children()}
```
