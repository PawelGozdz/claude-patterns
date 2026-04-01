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
| Advisory | sveltekit-architecture-expert | Sonnet |
| Verification | sveltekit-quality-verifier (VETO) | Sonnet |

**Built-in**: Explore agent (Haiku) — cost-efficient file discovery.

**Cost targets**:

| Model | Target |
|-------|--------|
| Opus | %%COST_OPUS%% |
| Sonnet | %%COST_SONNET%% |
| Haiku | %%COST_HAIKU%% |

---

## Svelte 5 Runes (CRITICAL — not Svelte 4)

```svelte
<script lang="ts">
  // Props (replaces export let)
  let { title, count = 0 }: { title: string; count?: number } = $props();

  // Reactive state (replaces let + stores)
  let items = $state<string[]>([]);

  // Derived (replaces $:)
  let total = $derived(items.length);

  // Side effect (replaces onMount + $:)
  $effect(() => {
    console.log('Count changed:', count);
  });
</script>

<!-- Event handlers (replaces on:click) -->
<button onclick={() => count++}>{title}: {count}</button>

<!-- Snippets (replaces <slot>) -->
{#snippet row(item)}
  <li>{item}</li>
{/snippet}
{@render row('hello')}
```

---

## SvelteKit Routing

```
src/routes/
  +page.svelte              → /
  +layout.svelte            → Shared layout
  dashboard/
    +page.svelte            → /dashboard
    +page.ts                → Universal load (SSR + client)
    [id]/
      +page.svelte          → /dashboard/:id
      +page.server.ts       → Server-only load (DB, secrets)
  login/
    +page.svelte            → /login
    +page.server.ts         → Form actions (POST)
```

### Data Loading

```typescript
// +page.ts — universal (runs on server SSR + client navigation)
export const load = async ({ fetch, params }) => {
  const res = await fetch(`/api/data/${params.id}`);
  return { data: await res.json() };
};

// +page.server.ts — server only (DB, API keys, secrets)
export const load = async ({ params }) => {
  const data = await db.query(params.id);  // Direct DB access OK
  return { data };
};
```

### Form Actions

```typescript
// +page.server.ts
export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    // validate, save to DB, return
  }
};
```

```svelte
<!-- +page.svelte -->
<form method="POST" use:enhance>
  <input name="title" />
  <button>Submit</button>
</form>
```

---

## Patterns Library

**Location**: `.claude/knowledge/patterns/`

| Pattern | Purpose |
|---------|---------|
| `routing-loading-pattern.md` | Routes, load functions, layouts |
| `svelte5-runes-pattern.md` | $state, $derived, $effect, $props |
| `data-fetching-pattern.md` | Server loads, form actions, streaming |
| `component-pattern.md` | Props, snippets, composition |
| `testing-pattern.md` | Vitest, Testing Library, Playwright |

---

## Testing Strategy

| Type | Coverage | What to Test |
|------|----------|-------------|
| **Unit** | ~40% | Load functions, utilities, stores |
| **Component** | ~40% | Svelte components, user interactions |
| **E2E** | ~20% | Critical flows (auth, forms, navigation) |

Framework: **Vitest** + @testing-library/svelte + Playwright
