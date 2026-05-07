# Pattern: Product Marketing Context (Foundational Document)

**Layer**: Marketing / Cross-Layer
**Status**: production
**Origin**: vendored from [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) (MIT)
**Skills**: `product-marketing-context` (skills/marketing/), all 40 other marketing skills
**Agent**: `marketing-strategist` (agents/universal/)

---

## What This Is

A single markdown file at `.agents/product-marketing-context.md` that captures
foundational positioning, audience, and messaging information about a
product. Every marketing skill in `skills/marketing/` reads this file first
before doing analysis — so the user does not repeat product/ICP/positioning
context across every CRO, SEO, copy, and growth task.

It is the marketing equivalent of `BUSINESS_RULES.yaml` for DDD projects:
**one shared source of truth that prevents drift across many specialized
workflows.**

---

## When to Use

- Starting marketing work on any project for the first time (set it up before
  running `/marketing` or any specific marketing skill)
- Onboarding a new agent or contractor to a project's positioning
- After a major repositioning, ICP shift, or pricing change (refresh the doc)
- When marketing skills produce inconsistent voice/positioning across pages

---

## When NOT to Use

- Pure tactical work where positioning doesn't matter (e.g., one-off image
  briefs, ad asset cropping)
- Internal tooling marketing (where there's no external customer)
- Code-only repositories with no marketing output

---

## File Location

- **Primary**: `.agents/product-marketing-context.md` (current convention)
- **Legacy**: `.claude/product-marketing-context.md` (older — auto-migrate to
  `.agents/` when found)
- **Template**: `templates/product-marketing-context.md` (in claude-patterns)

The `.agents/` folder is project-local and should be committed to git unless
the positioning is sensitive (then add to `.gitignore` and ship a sanitized
template).

---

## Document Structure (12 Sections)

The skill `product-marketing-context` creates a doc with these sections,
each tuned for downstream marketing skills to consume:

| # | Section | Consumed by |
|---|---|---|
| 1 | Product Overview | every skill |
| 2 | Target Audience | `page-cro`, `cold-email`, `paid-ads`, `customer-research` |
| 3 | Personas (B2B) | `cold-email`, `sales-enablement`, `revops` |
| 4 | Problems & Pain Points | `copywriting`, `page-cro`, `ad-creative` |
| 5 | Competitive Landscape | `competitor-alternatives`, `competitor-profiling`, `paid-ads` |
| 6 | Differentiation | `copywriting`, `page-cro`, `pricing-strategy` |
| 7 | Objections & Anti-Personas | `sales-enablement`, `paywall-upgrade-cro` |
| 8 | Switching Dynamics (JTBD Four Forces) | `cold-email`, `email-sequence`, `churn-prevention` |
| 9 | Customer Language (verbatim quotes) | `copywriting`, `seo-audit`, `ai-seo` |
| 10 | Brand Voice | every copy-producing skill |
| 11 | Proof Points (metrics, logos, testimonials) | `copywriting`, `ad-creative`, `social-content` |
| 12 | Goals (primary CTA, business goal) | `page-cro`, `signup-flow-cro`, `analytics-tracking` |

---

## How Skills Reference It

Every marketing skill begins its workflow with a check like:

```markdown
**Check for product marketing context first:**
If `.agents/product-marketing-context.md` exists, read it before asking
questions. Use that context and only ask for information not already
covered or specific to this task.
```

The `marketing-strategist` agent enforces this gate — if the file is
missing, it stops and recommends running `product-marketing-context` first
rather than fabricating positioning facts.

---

## Implementation

### Setting it up in a project

1. Run the skill once: `/product-marketing-context` (or via `/marketing` →
   strategist will route there if file is missing)
2. The skill offers two modes:
   - **Auto-draft from codebase**: agent reads README, landing pages,
     `package.json`, marketing copy, drafts V1, user corrects gaps
   - **From scratch**: walk through 12 sections conversationally
3. Save to `.agents/product-marketing-context.md`
4. Commit it (unless sensitive)

### Refreshing it

Re-run the skill — it detects existing file and asks which sections to
update rather than starting over.

### Sharing across projects

For a multi-product company, keep one file per product (e.g.,
`.agents/product-marketing-context-foo.md`). The agent will ask which one
to use at the start of each task.

---

## Anti-Patterns

### ❌ Letting agents fabricate positioning

**Bad**: Running `/page-cro` with no context — the agent will invent ICP,
problems, and value props that sound plausible but don't match the actual
product. Output reads like generic marketing.

**Good**: Always set up `product-marketing-context` first. The
`marketing-strategist` agent refuses to proceed without it.

---

### ❌ Stuffing the doc with marketing fluff

**Bad**: "We empower forward-thinking innovators to unlock unprecedented
synergies in the cloud-native ecosystem." (Adjective soup, no specifics.)

**Good**: Verbatim customer quotes. "I switched because Calendly's free
plan started showing branding I couldn't remove." Real, specific, citable.

---

### ❌ Skipping the Customer Language section

**Bad**: Filling the doc with how marketing wants customers to talk about
the product.

**Good**: Capturing how customers actually talk — exact phrases from sales
calls, support tickets, reviews, interviews. This is what makes downstream
copy sound real.

---

### ❌ Treating it as set-and-forget

**Bad**: Writing the doc once at project start and never touching it.
Positioning drifts, ICP shifts, the doc rots silently.

**Good**: Refresh after every major pricing/positioning change, or
quarterly. The skill supports incremental updates — just rerun.

---

### ❌ Per-skill duplicate context

**Bad**: Re-explaining "we sell to B2B SaaS founders, our differentiator
is X..." in every prompt to every marketing skill.

**Good**: Trust the foundational doc. Skills load it themselves. Prompt
the skill only with what's task-specific.

---

## Why This Pattern Matters

41 marketing skills × N projects × M tasks per project = enormous
combinatorial surface for inconsistency. Without a shared context document:

- Copy on the homepage contradicts copy in cold emails
- SEO content targets the wrong ICP
- Ad creative speaks to a different persona than landing pages
- Pricing pages assume different alternatives than competitor pages

With one foundational doc, all 41 skills draw from the same well. The
benefit compounds — every skill gets sharper as the doc gets sharper.

This is the same insight as `BUSINESS_RULES.yaml` for DDD: complexity
belongs in the executors, not duplicated in the prompts.
