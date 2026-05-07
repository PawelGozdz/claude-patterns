---
name: marketing
description: |
  Entry point for marketing tasks. Routes the request to the right skill in
  skills/marketing/ via the @marketing-strategist agent.

  Examples:
    /marketing optimize the pricing page for conversions
    /marketing draft a 5-email cold sequence for SaaS founders
    /marketing run an SEO audit on /blog/index
    /marketing design a referral program for our B2B SaaS
    /marketing what should we A/B test next on signup?

  Usage: /marketing <task description>
  Alias: /m <task description>

tools: Task, Read, Glob, Grep
disallowedTools: Write, Edit, MultiEdit, Bash, NotebookEdit
---

# /marketing — Marketing Task Router

**ZERO IMPLEMENTATION** — coordinates marketing analysis through the
`@marketing-strategist` agent and the 41 skills in `skills/marketing/`.

## What This Does

1. Reads `.agents/product-marketing-context.md` (or recommends creating one
   via the `product-marketing-context` skill if missing).
2. Delegates to `@marketing-strategist` with the user's task.
3. The strategist picks the right specialized skill, reads its `SKILL.md`
   workflow, and produces a structured deliverable (analysis, copy, audit,
   playbook).

## Steps

1. **Pre-flight check**
   - Look for `.agents/product-marketing-context.md` in the current project
   - If missing, surface this to the user before doing deep analysis:
     > "No product marketing context found. Strongly recommend running
     > the `product-marketing-context` skill first — it captures product,
     > ICP, and positioning so every other marketing skill works coherently.
     > Want to set it up now, or proceed with the task using only what's in
     > the prompt?"

2. **Delegate to @marketing-strategist**
   - Spawn the agent with the user's full request and any context found
   - The agent classifies the task, picks the matching skill from the routing
     table, follows that skill's `SKILL.md` workflow, and returns a
     structured deliverable

3. **Surface the result**
   - Show the strategist's recommendations + "What I Need From You" + "Next
     Action" sections back to the user
   - Do NOT post-process or summarize — the strategist already produces
     actionable output

## Cost

- ~$0.05–0.20 per call (one Sonnet agent invocation, sometimes one or two
  skill workflow reads)
- Foundational `product-marketing-context` skill setup is a one-time cost
  per project

## When NOT to use this command

- Pure code generation tasks → use `/orchestrate` or implementer agents
- Architecture decisions → use `@technical-architecture-lead`
- Project planning → use `/pulse`, `/sprint`, `@tech-lead`, `@product-owner`
- Direct skill invocation when you already know which skill you want →
  `/<skill-name>` (e.g., `/copywriting`, `/seo-audit`)

## Skills Available Via This Router

CRO: `page-cro`, `signup-flow-cro`, `onboarding-cro`, `form-cro`,
`popup-cro`, `paywall-upgrade-cro`

Copy & content: `copywriting`, `copy-editing`, `social-content`,
`content-strategy`, `image`, `video`

SEO: `seo-audit`, `ai-seo`, `programmatic-seo`, `site-architecture`,
`schema-markup`, `competitor-alternatives`

Paid: `paid-ads`, `ad-creative`

Email: `cold-email`, `email-sequence`

Measurement: `ab-test-setup`, `analytics-tracking`

Growth: `churn-prevention`, `co-marketing`, `community-marketing`,
`free-tool-strategy`, `lead-magnets`, `referral-program`,
`directory-submissions`, `launch-strategy`

Strategy & RevOps: `marketing-ideas`, `marketing-psychology`,
`pricing-strategy`, `customer-research`, `competitor-profiling`, `revops`,
`sales-enablement`, `aso-audit`

Foundation: `product-marketing-context` (run first, always)
