# Marketing Skills (vendored)

**41 specialized marketing skills** for AI agents — CRO, copywriting, SEO,
paid ads, growth, RevOps, and more.

## Origin & Attribution

Vendored from
[**coreyhaines31/marketingskills**](https://github.com/coreyhaines31/marketingskills)
by [Corey Haines](https://corey.co) (MIT license).

These skills follow the standard Agent Skills specification and are
compatible with Claude Code, Cursor, Windsurf, and other AI coding agents.

The version currently vendored is recorded in [`UPSTREAM_VERSION`](./UPSTREAM_VERSION)
(written by `scripts/sync-marketing-skills.sh`).

To pull updates from upstream:

```bash
./scripts/sync-marketing-skills.sh             # interactive — diff + confirm
./scripts/sync-marketing-skills.sh --diff      # show diff, no changes
./scripts/sync-marketing-skills.sh --ref v1.10.0  # pin to a tag
```

## How These Skills Are Used

1. **Foundation**: `product-marketing-context` runs first per project. It
   creates `.agents/product-marketing-context.md` with positioning, ICP,
   audience, and proof points. Every other skill reads this file before
   asking questions.
2. **Routing**: the `@marketing-strategist` agent
   (`agents/universal/marketing-strategist.md`) and the `/marketing` slash
   command pick the right skill for a given task.
3. **Direct invocation**: power users can call any skill directly with
   `/<skill-name>` — e.g., `/page-cro`, `/copywriting`, `/seo-audit`.

## Skill Catalog (41)

### Foundation (run first, always)
- [`product-marketing-context`](product-marketing-context/) — positioning,
  ICP, audience, brand voice (creates `.agents/product-marketing-context.md`)

### Conversion Optimization (6)
- [`page-cro`](page-cro/) — homepage / landing / pricing / feature pages
- [`signup-flow-cro`](signup-flow-cro/) — multi-step signup / registration
- [`onboarding-cro`](onboarding-cro/) — post-signup activation
- [`form-cro`](form-cro/) — checkout / contact / lead forms (non-signup)
- [`popup-cro`](popup-cro/) — popups, modals, exit intents
- [`paywall-upgrade-cro`](paywall-upgrade-cro/) — free→paid upgrade prompts

### Content & Copy (6)
- [`copywriting`](copywriting/) — write copy from scratch
- [`copy-editing`](copy-editing/) — improve existing copy
- [`social-content`](social-content/) — LinkedIn / X / posts
- [`content-strategy`](content-strategy/) — editorial calendar, content roadmap
- [`image`](image/) — image briefs (OG images, hero shots, thumbnails)
- [`video`](video/) — video scripts (explainers, VSLs, demos)

### SEO & Discovery (6)
- [`seo-audit`](seo-audit/) — technical + content SEO audit
- [`ai-seo`](ai-seo/) — generative engine optimization (LLMs.txt, GEO)
- [`programmatic-seo`](programmatic-seo/) — templated page generation at scale
- [`site-architecture`](site-architecture/) — IA, internal linking, URL structure
- [`schema-markup`](schema-markup/) — JSON-LD structured data
- [`competitor-alternatives`](competitor-alternatives/) — "alternatives to X" pages
- [`aso-audit`](aso-audit/) — App Store / Play Store optimization

### Paid & Distribution (2)
- [`paid-ads`](paid-ads/) — Google / Meta / LinkedIn campaign strategy
- [`ad-creative`](ad-creative/) — ad headline + image production

### Email (2)
- [`cold-email`](cold-email/) — outbound prospecting sequences
- [`email-sequence`](email-sequence/) — drip / nurture / lifecycle automations

### Measurement (2)
- [`ab-test-setup`](ab-test-setup/) — experiment design, hypothesis, MDE
- [`analytics-tracking`](analytics-tracking/) — event taxonomy, KPIs

### Growth (8)
- [`churn-prevention`](churn-prevention/) — retention, save flows
- [`co-marketing`](co-marketing/) — partner campaigns
- [`community-marketing`](community-marketing/) — community-led growth
- [`free-tool-strategy`](free-tool-strategy/) — calculators, free tools as lead-gen
- [`lead-magnets`](lead-magnets/) — gated content, ebooks, templates
- [`referral-program`](referral-program/) — viral loops, customer referrals
- [`directory-submissions`](directory-submissions/) — Product Hunt, G2, listings
- [`launch-strategy`](launch-strategy/) — product launches, PH, sequencing

### Strategy & RevOps (8)
- [`marketing-ideas`](marketing-ideas/) — brainstorm next bets
- [`marketing-psychology`](marketing-psychology/) — Cialdini-style behavioral levers
- [`pricing-strategy`](pricing-strategy/) — tiers, packaging, anchoring
- [`customer-research`](customer-research/) — interviews, surveys, JTBD
- [`competitor-profiling`](competitor-profiling/) — competitor intel
- [`revops`](revops/) — lead routing, scoring, SLAs
- [`sales-enablement`](sales-enablement/) — battlecards, one-pagers
- [`launch-strategy`](launch-strategy/) — see Growth

## Skill Structure

Each skill folder follows this layout:

```
<skill-name>/
├── SKILL.md          # main workflow (required)
├── references/       # playbooks, experiments, deep-dives (optional)
└── evals/            # JSON test cases (optional)
```

`SKILL.md` uses standard Agent Skills frontmatter:

```yaml
---
name: page-cro
description: "When the user wants to optimize, improve, or increase conversions on..."
metadata:
  version: 1.1.0
---
```

## Related Resources

- **Agent**: [`agents/universal/marketing-strategist.md`](../../agents/universal/marketing-strategist.md)
- **Slash command**: [`commands/marketing.md`](../../commands/marketing.md)
- **Pattern**: [`patterns/marketing/product-marketing-context-pattern.md`](../../patterns/marketing/product-marketing-context-pattern.md)
- **Template**: [`templates/product-marketing-context.md`](../../templates/product-marketing-context.md)
- **Tools**: [`tools/marketing/`](../../tools/marketing/) — 60 CLI helpers + 75
  integration guides for marketing platforms (GA4, Stripe, HubSpot, Mixpanel,
  Klaviyo, etc.)

## License

These vendored skills are licensed under the MIT License — see the upstream
[LICENSE](https://github.com/coreyhaines31/marketingskills/blob/main/LICENSE).

When syncing updates, the `sync-marketing-skills.sh` script writes upstream
metadata to `UPSTREAM_VERSION` so attribution stays current.
