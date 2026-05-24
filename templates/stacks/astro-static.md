## Astro 5 + Content Collections

Content Collections schema = contract between AI agents and the SSG build.
**If an AI-generated post breaks the schema → Astro build fails → CI rejects → no broken post deployed.**

### Post Frontmatter (Zod schema in `src/content/config.ts`)

```typescript
import { defineCollection, z } from 'astro:content';

const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    description: z.string().max(160),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    author: z.enum(['founder', 'dri-content']),
    tags: z.array(z.string()),
    hero_image: z.string().optional(),
    draft: z.boolean().default(true),         // ALWAYS true until human review
    canonical_url: z.string().url().optional(),
  }),
});
```

**`draft: true` by default.** Human sets `draft: false` at merge time — never the AI agent.

### File Naming

```
src/content/posts/YYYY-MM-DD-slug-in-kebab-case.md
```

---

## AI-First Git Workflow

```
@dri-content writes draft → open PR → founder reviews → merge → auto-deploy
```

- Agent opens PR with `draft: true`
- Founder edits description, sets `draft: false`, merges
- Azure SWA deploys on push to `main`

Never merge AI-generated posts without human review of schema + content.

---

## Brand Voice (enforced in CLAUDE.md rules)

**Voice**: technical, transparent, direct, data-first

**Do**: cite real metrics, show code snippets, use "we" / "I" (founder POV), Polish-first

**Never**:
- Generic SaaS marketing speak ("industry-leading", "best-in-class")
- Vague claims without data
- Long introductions — get to the point
- Stock photos — real screenshots or skip

---

## Build + Deploy

```bash
npm run dev      # local preview at localhost:4321
npm run build    # static output to dist/
npm run preview  # preview built output
```

Azure Static Web Apps deploys automatically on push to `main` via GitHub Actions.
Free tier: 100 GB/month — upgrade to Standard ($9/month) only if needed.

---

## Testing

Astro has no unit test framework by default. Quality gates:
- `npm run build` — catches broken frontmatter, broken imports
- Zod schema validation — catches malformed AI-generated posts at build time
- Manual smoke test on preview URL before DNS cutover
